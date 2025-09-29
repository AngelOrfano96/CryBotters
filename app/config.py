from pydantic_settings import BaseSettings
import os

class Settings(BaseSettings):
    supabase_url: str = os.environ.get("SUPABASE_URL", "")
    supabase_anon_key: str = os.environ.get("SUPABASE_ANON_KEY", "")
    supabase_service_role_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    supabase_jwks_url: str = os.environ.get("SUPABASE_JWKS_URL", "")
    enc_key: str = os.environ.get("ENC_KEY", "")
    binance_testnet_default: bool = os.environ.get("BINANCE_TESTNET_DEFAULT","true").lower()=='true'

settings = Settings()
