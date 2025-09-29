from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwk, jwt
from jose.utils import base64url_decode
import httpx, time
from .config import settings

bearer = HTTPBearer()
_jwks_cache = {"exp":0,"keys":None}

async def get_jwks():
    now = int(time.time())
    if _jwks_cache["keys"] and _jwks_cache["exp"]>now:
        return _jwks_cache["keys"]
    if not settings.supabase_jwks_url:
        raise HTTPException(status_code=500, detail="JWKS URL not configured")
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(settings.supabase_jwks_url)
        r.raise_for_status()
        data = r.json()
        _jwks_cache.update({"exp": now+3600, "keys": data["keys"]})
        return data["keys"]

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    token = credentials.credentials
    try:
        headers = jwt.get_unverified_header(token)
        kid = headers.get("kid")
        keys = await get_jwks()
        key = next((k for k in keys if k.get("kid")==kid), None)
        if not key:
            raise HTTPException(status_code=401, detail="Invalid token (kid)")
        public_key = jwk.construct(key)
        message, encoded_sig = token.rsplit(".", 1)
        decoded_sig = base64url_decode(encoded_sig.encode())
        if not public_key.verify(message.encode(), decoded_sig):
            raise HTTPException(status_code=401, detail="Invalid signature")
        claims = jwt.get_unverified_claims(token)
        if claims.get("exp") and int(claims["exp"]) < int(time.time()):
            raise HTTPException(status_code=401, detail="Token expired")
        return claims
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
