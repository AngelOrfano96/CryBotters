import ccxt

def make_binance(api_key:str, api_secret:str, testnet:bool=True):
    ex = ccxt.binance({'apiKey': api_key, 'secret': api_secret, 'enableRateLimit': True})
    try:
        ex.set_sandbox_mode(testnet)
    except Exception:
        pass
    ex.load_markets()
    return ex

def split_symbol(symbol: str):
    s = symbol.replace('/', '').upper()
    for q in ('USDT','BUSD','EUR','USD','BTC','ETH'):
        if s.endswith(q):
            return s[:-len(q)], q
    return s[:-4], s[-4:]
