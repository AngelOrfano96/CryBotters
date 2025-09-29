
# Crypto Bot — All-in-One (FastAPI + SPA)
Un **singolo Web Service su Render** che serve **frontend** (SPA) e **backend API** insieme.

## Cosa include
- Frontend **statico** (senza build) con **Supabase Auth** e **lightweight-charts** via CDN.
- Backend **FastAPI** per:
  - salvataggio chiavi **cifrate** su Supabase (`/keys`),
  - proxy OHLCV (`/ohlcv`),
  - bilanci (`/balances`),
  - ordini market BUY (per importo quote) e SELL ALL (testnet di default).
- Endpoint `/config.js` che espone le impostazioni **pubbliche** (Supabase URL/Anon Key) a runtime.

## Deploy su Render (un solo servizio)
1. Crea un nuovo **Web Service** da questa cartella.
2. Build: `pip install -r requirements.txt`
3. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Variabili d'ambiente:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (pubblica)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_JWKS_URL` (es. `https://xxxx.supabase.co/auth/v1/jwks`)
   - `ENC_KEY` (Fernet key)
   - `BINANCE_TESTNET_DEFAULT` = `true` (consigliato)

## Supabase: tabelle & RLS
Esegui nel **SQL editor**:
```sql
create table if not exists api_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key text not null,
  api_secret text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table api_keys enable row level security;
create policy "deny read" on api_keys for select using (false);
```
> Il backend usa la **Service Role Key** ed esegue upsert server-side.

## Note
- Per la **modalità LIVE reale** imposta `BINANCE_TESTNET_DEFAULT=false` e invia `testnet:false` nelle richieste.
- Il frontend incluso è minimale; puoi sostituirlo con una tua SPA più ricca mantenendo gli endpoint.
