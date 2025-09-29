from cryptography.fernet import Fernet
from .config import settings

def _fernet()->Fernet:
    if not settings.enc_key:
        raise RuntimeError("ENC_KEY not set")
    return Fernet(settings.enc_key)

def encrypt_text(s:str)->str:
    return _fernet().encrypt(s.encode()).decode()

def decrypt_text(s:str)->str:
    return _fernet().decrypt(s.encode()).decode()
