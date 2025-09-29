from supabase import create_client, Client
from .config import settings

def supabase_client()->Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Supabase env vars missing")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
