from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, PlainTextResponse
import httpx, os
from .config import settings
from .security import verify_token
from .db import supabase_client
from .crypto import encrypt_text, decrypt_text
from .models import KeysIn, KeysStatus, OrderBuyQuote, OrderSellAll
from .binance_client import make_binance, split_symbol

app = FastAPI(title="CryptoBot All-in-One", version="0.1.0")

# Serve static assets
static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/config.js", response_class=PlainTextResponse)
async def config_js():
    # Expose only PUBLIC runtime info
    js = f"""window.APP_CONFIG = {{
  SUPABASE_URL: {settings.supabase_url!r},
  SUPABASE_ANON_KEY: {settings.supabase_anon_key!r},
  BINANCE_TESTNET_DEFAULT: {str(settings.binance_testnet_default).lower()}
}};
"""
    return js

@app.get("/", response_class=HTMLResponse)
async def index():
    index_path = os.path.join(static_dir, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())

@app.get("/health")
async def health():
    return {"ok": True}

# ---------- Keys management ----------
@app.get("/keys", response_model=KeysStatus)
async def keys_status(user=Depends(verify_token)):
    uid = user.get("sub")
    sb = supabase_client()
    data = sb.table("api_keys").select("user_id").eq("user_id", uid).maybe_single().execute()
    exists = bool(getattr(data, "data", None))
    return {"exists": exists}

@app.post("/keys")
async def upsert_keys(payload: KeysIn, user=Depends(verify_token)):
    uid = user.get("sub")
    sb = supabase_client()
    ek = encrypt_text(payload.api_key)
    es = encrypt_text(payload.api_secret)
    sb.table("api_keys").upsert({"user_id": uid, "api_key": ek, "api_secret": es}).execute()
    return {"ok": True}

def _load_keys(uid: str):
    sb = supabase_client()
    r = sb.table("api_keys").select("api_key, api_secret").eq("user_id", uid).maybe_single().execute()
    data = getattr(r, "data", None)
    if not data:
        raise HTTPException(status_code=400, detail="API keys not set")
    return decrypt_text(data["api_key"]), decrypt_text(data["api_secret"])

# ---------- Proxies / Trading ----------
@app.get("/ohlcv")
async def proxy_ohlcv(symbol: str, interval: str = "1m", limit: int = 500):
    url = "https://api.binance.com/api/v3/klines"
    params = {"symbol": symbol, "interval": interval, "limit": limit}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        return r.json()

@app.get("/balances")
async def balances(user=Depends(verify_token), testnet: bool | None = None):
    uid = user.get("sub")
    api_key, api_secret = _load_keys(uid)
    ex = make_binance(api_key, api_secret, testnet if testnet is not None else settings.binance_testnet_default)
    bal = ex.fetch_balance()
    return {"free": bal.get("free", {})}

@app.post("/order/buy-quote")
async def order_buy_quote(payload: OrderBuyQuote, user=Depends(verify_token)):
    uid = user.get("sub")
    api_key, api_secret = _load_keys(uid)
    ex = make_binance(api_key, api_secret, payload.testnet if payload.testnet is not None else settings.binance_testnet_default)
    quote_ccy = split_symbol(payload.symbol)[1]
    params = {"quoteOrderQty": ex.currency_to_precision(quote_ccy, payload.quote_amount)}
    try:
        o = ex.create_order(symbol=payload.symbol, type="market", side="buy", amount=None, price=None, params=params)
        return {"order": o}
    except Exception:
        last = ex.fetch_ticker(payload.symbol)["last"]
        amount = float(payload.quote_amount) / float(last)
        amount = float(ex.amount_to_precision(payload.symbol, amount))
        o = ex.create_market_buy_order(payload.symbol, amount)
        return {"order": o}

@app.post("/order/sell-all")
async def order_sell_all(payload: OrderSellAll, user=Depends(verify_token)):
    uid = user.get("sub")
    api_key, api_secret = _load_keys(uid)
    ex = make_binance(api_key, api_secret, payload.testnet if payload.testnet is not None else settings.binance_testnet_default)
    base, _ = split_symbol(payload.symbol)
    bal = ex.fetch_balance()
    amt = float(bal.get("free", {}).get(base, 0.0))
    if amt <= 0:
        raise HTTPException(status_code=400, detail="No base asset to sell")
    amt = float(ex.amount_to_precision(payload.symbol, amt))
    o = ex.create_market_sell_order(payload.symbol, amt)
    return {"order": o}
