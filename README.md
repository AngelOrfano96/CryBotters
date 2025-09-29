# Crypto Bot — All-in-One (FastAPI + SPA)
Un **singolo Web Service su Render** che serve **frontend** e **backend** insieme.

## ENV richieste
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (pubblica)
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET` (Settings → API → JWT Secret)
- `SUPABASE_JWKS_URL` (solo se usi RS256; altrimenti puoi lasciarla vuota)
- `ENC_KEY` (Fernet key per cifrare le API key utenti)
- `BINANCE_TESTNET_DEFAULT` = `true`

Il backend verifica i token così:
- Se l'header `alg` del JWT è **HS256** e c'è `SUPABASE_JWT_SECRET` → verifica con HMAC.
- Altrimenti usa le chiavi pubbliche dal **JWKS** (`SUPABASE_JWKS_URL`).

## Supabase — tabelle
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

create table if not exists trades (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  ts timestamptz not null,
  side text check (side in ('BUY','SELL')) not null,
  price numeric not null,
  qty numeric,
  equity numeric,
  reason text,
  created_at timestamptz default now()
);
alter table trades enable row level security;
create policy "read own trades" on trades for select using (auth.uid() = user_id);
create policy "insert own trades" on trades for insert with check (auth.uid() = user_id);
```

## Build/Run locale
```bash
pip install -r requirements.txt
export SUPABASE_URL=...
export SUPABASE_ANON_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=...
export SUPABASE_JWT_SECRET=...
export ENC_KEY=...
python -m uvicorn app.main:app --reload
```

Vai su `http://127.0.0.1:8000/`

