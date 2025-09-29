// Globals
let supa = null
let token = null
let user = null
let chart, candleSeries, emaFSeries, emaSSeries, volumeSeries

// Simulation state
let simOn = true
let simEUR = 1000
let simBTC = 0
let entry = null
let baseline = 1000
let fee = 0.001

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

  // Volume histogram
  volumeSeries = chart.addHistogramSeries({ priceScaleId: 'volume', priceFormat: { type: 'volume' } })
  chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

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

function toSymbol(pair){ return pair.replace('/','').toUpperCase() }

function setHistoryRow(t, side, price, qty, eq, reason){
  const tb = document.querySelector('#history tbody')
  const tr = document.createElement('tr')
  tr.innerHTML = `<td>${new Date(t).toLocaleString()}</td><td>${side}</td><td>${price.toLocaleString('it-IT')}</td><td>${qty||''}</td><td>${eq? (+eq).toFixed(2):''}</td><td>${reason||''}</td>`
  tb.prepend(tr)
}

async function saveTrade(t, side, price, qty, eq, reason){
  if(!user) return
  try{
    await supa.from('trades').insert({ user_id: user.id, ts: new Date(t).toISOString(), side, price, qty, equity: eq, reason })
  }catch(e){ console.warn('Supabase insert trades failed', e) }
}

async function loadTrades(){
  if(!user) return
  const { data, error } = await supa.from('trades').select('*').eq('user_id', user.id).order('ts', { ascending: false }).limit(200)
  if(error){ console.warn('loadTrades error', error); return }
  const tb = document.querySelector('#history tbody'); tb.innerHTML = ''
  for(const r of (data||[])){
    setHistoryRow(r.ts, r.side, +r.price, r.qty, r.equity, r.reason)
  }
}

function updatePnL(lastPrice){
  const equity = simEUR + simBTC * (lastPrice||0)
  if(baseline === null || baseline === undefined) baseline = simEUR
  const pnl = equity - baseline
  const roi = baseline ? (equity / baseline - 1) * 100 : 0
  document.getElementById('equity').textContent = equity.toFixed(2)
  document.getElementById('pnl').textContent = (pnl>=0?'+':'') + pnl.toFixed(2)
  document.getElementById('roi').textContent = (roi>=0?'+':'') + roi.toFixed(2)
}

function resetSim(){
  simEUR = +document.getElementById('start').value || 1000
  baseline = simEUR
  simBTC = 0
  entry = null
  document.querySelector('#history tbody').innerHTML = ''
}

async function loop(){
  const pair = document.getElementById('pair').value
  const tf = document.getElementById('tf').value
  const candlesN = +document.getElementById('candles').value
  fee = +document.getElementById('fee').value || 0.001
  const symbol = toSymbol(pair)

  const data = await fetchOHLCV(symbol, tf, candlesN)
  candleSeries.setData(data)
  const closes = data.map(d=>d.close)
  const ef = ema(closes, +document.getElementById('emaF').value)
  const es = ema(closes, +document.getElementById('emaS').value)
  emaFSeries.setData(data.map((d,i)=>({ time:d.time, value: ef[i] })))
  emaSSeries.setData(data.map((d,i)=>({ time:d.time, value: es[i] })))

  volumeSeries.setData(data.map((d,i)=>{
    const up = d.close >= d.open
    return { time: d.time, value: d.volume, color: up ? 'rgba(38,166,154,0.6)' : 'rgba(239,83,80,0.6)' }
  }))

  if (simOn && data.length >= 3){
    const prev = data[data.length-2]
    const last = data[data.length-1]
    const fPrev = ef[ef.length-2]
    const sPrev = es[es.length-2]
    const signal = fPrev > sPrev ? 1 : 0

    // SL/TP checks
    const slPct = +document.getElementById('sl').value || 0
    const tpPct = +document.getElementById('tp').value || 0
    if(simBTC > 0 && entry != null){
      if(slPct > 0 && last.close <= entry * (1 - slPct/100)){
        const eur = (simBTC * prev.close) * (1 - fee)
        const qty = simBTC
        simEUR = eur; simBTC = 0; entry = null
        setHistoryRow(prev.time*1000, 'SELL', prev.close, qty, eur, 'SL')
        saveTrade(prev.time*1000, 'SELL', prev.close, qty, eur, 'SL')
      } else if(tpPct > 0 && last.close >= entry * (1 + tpPct/100)){
        const eur = (simBTC * prev.close) * (1 - fee)
        const qty = simBTC
        simEUR = eur; simBTC = 0; entry = null
        setHistoryRow(prev.time*1000, 'SELL', prev.close, qty, eur, 'TP')
        saveTrade(prev.time*1000, 'SELL', prev.close, qty, eur, 'TP')
      }
    }

    // Crossovers
    if(signal === 1 && simEUR > 0){
      const btc = (simEUR / prev.close) * (1 - fee)
      simBTC = btc; simEUR = 0; entry = prev.close
      setHistoryRow(prev.time*1000, 'BUY', prev.close, btc, btc*last.close, 'EMA+')
      saveTrade(prev.time*1000, 'BUY', prev.close, btc, btc*last.close, 'EMA+')
    } else if(signal === 0 && simBTC > 0){
      const eur = (simBTC * prev.close) * (1 - fee)
      const qty = simBTC
      simEUR = eur; simBTC = 0; entry = null
      setHistoryRow(prev.time*1000, 'SELL', prev.close, qty, eur, 'EMA-')
      saveTrade(prev.time*1000, 'SELL', prev.close, qty, eur, 'EMA-')
    }
  }

  updatePnL(closes[closes.length-1])
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
  const symbol = toSymbol(pair)
  const r = await fetch('/order/buy-quote', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization: 'Bearer '+token }, body: JSON.stringify({ symbol, quote_amount: 25, testnet: true }) })
  const j = await r.json()
  alert('BUY result: '+ JSON.stringify(j).slice(0, 200) + '...')
}

async function sellAll(){
  const pair = document.getElementById('pair').value
  const symbol = toSymbol(pair)
  const r = await fetch('/order/sell-all', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization: 'Bearer '+token }, body: JSON.stringify({ symbol, testnet: true }) })
  const j = await r.json()
  alert('SELL result: '+ JSON.stringify(j).slice(0, 200) + '...')
}

async function main(){
  // init supabase
  supa = window.supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY)
  createChartContainer()

  // wire reset & sim toggle
  document.getElementById('btn-reset').onclick = () => { resetSim() }
  const simChk = document.getElementById('simOn'); if (simChk) simChk.onchange = () => { simOn = simChk.checked }

  // init sim params
  simEUR = +document.getElementById('start').value || 1000
  baseline = simEUR
  fee = +document.getElementById('fee').value || 0.001

  // auth UI
  const { data } = await supa.auth.getSession()
  if(data.session){
    token = data.session.access_token
    user = data.session.user
    document.getElementById('auth').classList.add('hidden')
    document.getElementById('app-ui').classList.remove('hidden')
    loadTrades()
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
    user = res.data.session?.user
    if(!token){ alert('Auth fallita'); return }
    document.getElementById('auth').classList.add('hidden')
    document.getElementById('app-ui').classList.remove('hidden')
    loadTrades()
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
