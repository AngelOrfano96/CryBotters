// Globals
let supa = null
let token = null
let chart, candleSeries, emaFSeries, emaSSeries

function createChartContainer() {
  const el = document.getElementById('chart')
  el.innerHTML = ''
  chart = LightweightCharts.createChart(el, {
    layout: { background: { type: 0, color: '#0e1117' }, textColor: '#e6edf3' },
    grid: { vertLines: { color: '#222' }, horzLines: { color: '#222' } },
    rightPriceScale: { borderVisible:false },
    timeScale: { borderVisible:false, timeVisible: true, secondsVisible: false }
  })
  candleSeries = chart.addCandlestickSeries()
  emaFSeries = chart.addLineSeries({ lineWidth: 1 })
  emaSSeries = chart.addLineSeries({ lineWidth: 1 })
  new ResizeObserver(()=> chart.applyOptions({ width: el.clientWidth, height: el.clientHeight })).observe(el)
}

function ema(values, period){
  const k = 2/(period+1); let arr=[]; let prev
  for(let i=0;i<values.length;i++){ const p=values[i]; prev = prev===undefined? p : (p-prev)*k + prev; arr.push(prev) }
  return arr
}

async function fetchOHLCV(symbol, interval, limit){
  const r = await fetch(`/ohlcv?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`)
  const data = await r.json()
  return data.map(k => ({ time: Math.floor(k[0]/1000), open:+k[1], high:+k[2], low:+k[3], close:+k[4], volume:+k[5] }))
}

function setHistoryRow(t, side, price, qty, eq, reason){
  const tb = document.querySelector('#history tbody')
  const tr = document.createElement('tr')
  tr.innerHTML = `<td>${new Date(t).toLocaleString()}</td><td>${side}</td><td>${price.toLocaleString('it-IT')}</td><td>${qty||''}</td><td>${eq? eq.toFixed(2):''}</td><td>${reason||''}</td>`
  tb.prepend(tr)
}

async function loop(){
  const pair = document.getElementById('pair').value
  const tf = document.getElementById('tf').value
  const candlesN = +document.getElementById('candles').value
  const symbol = pair.replace('/','').toUpperCase()
  const data = await fetchOHLCV(symbol, tf, candlesN)
  candleSeries.setData(data)
  const closes = data.map(d=>d.close)
  const ef = ema(closes, +document.getElementById('emaF').value)
  const es = ema(closes, +document.getElementById('emaS').value)
  emaFSeries.setData(data.map((d,i)=>({ time:d.time, value: ef[i] })))
  emaSSeries.setData(data.map((d,i)=>({ time:d.time, value: es[i] })))

  // Simple sim equity (mark-to-market, no stateful trades here to keep it lean)
  document.getElementById('equity').textContent = closes.length? closes[closes.length-1].toFixed(2): '0.00'

  setTimeout(loop, 30000)
}

async function upsertKeys(){
  const api_key = (document.getElementById('api_key').value||'').trim()
  const api_secret = (document.getElementById('api_secret').value||'').trim()
  if(!api_key || !api_secret){ alert('Inserisci API key e secret'); return }
  const r = await fetch('/keys', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization: 'Bearer '+token }, body: JSON.stringify({ api_key, api_secret }) })
  if(!r.ok){ alert('Errore salvataggio chiavi'); return }
  document.getElementById('keys-status').textContent = 'Chiavi salvate ✔'
}

async function keysStatus(){
  const r = await fetch('/keys', { headers:{ Authorization: 'Bearer '+token } })
  if(r.ok){
    const j = await r.json()
    document.getElementById('keys-status').textContent = j.exists? 'Chiavi presenti ✔' : 'Chiavi non salvate'
  }
}

async function buyQuote(){
  const pair = document.getElementById('pair').value
  const symbol = pair.replace('/','').toUpperCase()
  const r = await fetch('/order/buy-quote', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization: 'Bearer '+token }, body: JSON.stringify({ symbol, quote_amount: 25, testnet: true }) })
  const j = await r.json()
  alert('BUY result: '+ JSON.stringify(j).slice(0, 200) + '...')
}

async function sellAll(){
  const pair = document.getElementById('pair').value
  const symbol = pair.replace('/','').toUpperCase()
  const r = await fetch('/order/sell-all', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization: 'Bearer '+token }, body: JSON.stringify({ symbol, testnet: true }) })
  const j = await r.json()
  alert('SELL result: '+ JSON.stringify(j).slice(0, 200) + '...')
}

async function main(){
  // init supabase
  supa = window.supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY)
  createChartContainer()

  // auth UI
  const { data } = await supa.auth.getSession()
  if(data.session){
    token = data.session.access_token
    document.getElementById('auth').classList.add('hidden')
    document.getElementById('app-ui').classList.remove('hidden')
    loop()
    keysStatus()
  }
  document.getElementById('btn-login').onclick = async () => {
    const email = document.getElementById('email').value
    const password = document.getElementById('password').value
    let res = await supa.auth.signInWithPassword({ email, password })
    if(res.error){
      const reg = await supa.auth.signUp({ email, password })
      if(reg.error){ alert('Login/Signup error: '+ (reg.error.message||'unknown')); return }
      res = await supa.auth.signInWithPassword({ email, password })
    }
    token = res.data.session?.access_token
    if(!token){ alert('Auth fallita'); return }
    document.getElementById('auth').classList.add('hidden')
    document.getElementById('app-ui').classList.remove('hidden')
    loop()
    keysStatus()
  }
  document.getElementById('btn-logout').onclick = async () => {
    await supa.auth.signOut()
    location.reload()
  }

  // actions
  document.getElementById('btn-keys').onclick = upsertKeys
  document.getElementById('btn-buy').onclick = buyQuote
  document.getElementById('btn-sell').onclick = sellAll
}

main()
