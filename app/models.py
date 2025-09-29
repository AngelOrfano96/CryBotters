from pydantic import BaseModel, Field
from typing import Optional

class KeysIn(BaseModel):
    api_key: str = Field(..., min_length=5)
    api_secret: str = Field(..., min_length=5)

class KeysStatus(BaseModel):
    exists: bool

class OrderBuyQuote(BaseModel):
    symbol: str
    quote_amount: float
    testnet: Optional[bool] = None

class OrderSellAll(BaseModel):
    symbol: str
    testnet: Optional[bool] = None
