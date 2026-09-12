const STOCK_POLL_MS = 15000;
const MANDI_POLL_MS = 60000;

let lastStockPrices = {};   // symbol -> price, to know when to flash
let lastMandiPrices = {};   // key -> modal_price
let sparkHistory = [];      // Nifty 50 price history for the spotlight sparkline
let sensexHistory = [];     // Sensex price history for the dashboard line
let activeFilters = { state: "", commodity: "" };

// ---------- helpers ----------

function fmtINR(n) {
  if (n === null || n === undefined) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtMandiPrice(n) {
  if (n === null || n === undefined) return "—";
  return fmtINR(n);
}

function flashEl(el, direction) {
  const cls = direction > 0 ? "flash-up" : "flash-down";
  el.classList.remove("flash-up", "flash-down");
  // force reflow so the animation can retrigger if same class
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 900);
}

function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent = now.toLocaleTimeString("en-IN", { hour12: false });
  updateMarketStatus(now);
}

function applySavedTheme() {
  const theme = localStorage.getItem("market-theme") || "1";
  document.body.classList.add(`theme-${theme}`);
}

function wireFeedback() {
  const form = document.getElementById("feedbackForm");
  if (!form) return;
  form.addEventListener("submit", event => {
    event.preventDefault();
    const feedback = { rating: document.getElementById("feedbackRating").value, text: document.getElementById("feedbackText").value.trim(), submittedAt: new Date().toISOString() };
    const saved = JSON.parse(localStorage.getItem("market-feedback") || "[]");
    saved.push(feedback);
    localStorage.setItem("market-feedback", JSON.stringify(saved));
    document.getElementById("feedbackText").value = "";
    document.getElementById("feedbackMessage").textContent = "Thanks, your feedback was saved.";
  });
}

function updateMarketStatus(now) {
  const day = document.getElementById("marketDay");
  const status = document.getElementById("marketStatus");
  if (!day || !status) return;
  const indiaFormatter = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const parts = Object.fromEntries(indiaFormatter.formatToParts(now).map(part => [part.type, part.value]));
  day.textContent = `${parts.weekday}, ${parts.day} ${parts.month}`;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const open = weekday >= 1 && weekday <= 5 && minutes >= 555 && minutes < 930;
  status.textContent = open ? "NSE/BSE open" : "NSE/BSE closed";
  status.classList.toggle("is-open", open);
  status.classList.toggle("is-closed", !open);
}

// ---------- stocks ----------

async function loadStocks() {
  try {
    const res = await fetch("/api/stocks");
    const stocks = await res.json();
    renderStocks(stocks);
    renderTicker(stocks);
    updateSpotlight(stocks);
    loadIndexHistory("^NSEI", "spotlightSpark");
    loadIndexHistory("^BSESN", "sensexSpark");
  } catch (e) {
    console.error("stock load failed", e);
  }
}

async function loadIndexHistory(symbol, elementId) {
  try {
    const response = await fetch(`/api/stocks/history?symbol=${encodeURIComponent(symbol)}&period=1mo`);
    const history = await response.json();
    const values = history.map(item => item.close);
    if (symbol === "^NSEI") sparkHistory = values.slice(-40);
    if (symbol === "^BSESN") sensexHistory = values.slice(-40);
    const rising = values.length > 1 ? values[values.length - 1] >= values[0] : true;
    drawIndexSpark(values.slice(-40), rising, elementId);
  } catch (error) {
    console.error(`${symbol} history load failed`, error);
  }
}

function renderStocks(stocks) {
  const grid = document.getElementById("stockGrid");
  if (!stocks.length) {
    grid.innerHTML = `<p style="color:var(--ink-dim)">No stock data yet — the first fetch may still be running on the server.</p>`;
    return;
  }
  grid.innerHTML = "";
  stocks.forEach(s => {
    const isUp = s.change_pct >= 0;
    const card = document.createElement("div");
    card.className = `price-card price-card--stock ${isUp ? "is-up" : "is-down"}`;
    card.innerHTML = `
      <div class="pc-name">${s.name}</div>
      <div class="pc-sub">${s.symbol}</div>
      <span class="pc-price" data-symbol="${s.symbol}">${fmtINR(s.price)}</span>
      <div class="pc-change ${isUp ? "is-up" : "is-down"}">${isUp ? "▲" : "▼"} ${Math.abs(s.change_pct).toFixed(2)}%</div>
      <div class="pc-range">Day range ${fmtINR(s.day_low)} – ${fmtINR(s.day_high)}</div>
    `;
    grid.appendChild(card);

    const prev = lastStockPrices[s.symbol];
    if (prev !== undefined && prev !== s.price) {
      flashEl(card.querySelector(".pc-price"), s.price - prev);
    }
    lastStockPrices[s.symbol] = s.price;
  });
}

function renderTicker(stocks) {
  const track = document.getElementById("tickerTrack");
  const items = stocks.map(s => {
    const isUp = s.change_pct >= 0;
    return `<a class="ticker-item" href="/stocks?symbol=${encodeURIComponent(s.symbol)}" aria-label="Open ${s.name} stock details">
      <span class="t-name">${s.name}</span>
      <span class="${isUp ? "t-up" : "t-down"}">${fmtINR(s.price)} ${isUp ? "▲" : "▼"} ${Math.abs(s.change_pct).toFixed(2)}%</span>
    </a>`;
  });
  // duplicate the list so the marquee loops seamlessly
  track.innerHTML = items.join("") + items.join("");
}

function updateSpotlight(stocks) {
  const nifty = stocks.find(s => s.symbol === "^NSEI");
  if (!nifty) return;
  const priceEl = document.getElementById("spotlightPrice");
  const changeEl = document.getElementById("spotlightChange");
  const prev = lastStockPrices["^NSEI"];

  priceEl.textContent = fmtINR(nifty.price);
  const isUp = nifty.change_pct >= 0;
  changeEl.textContent = `${isUp ? "▲" : "▼"} ${Math.abs(nifty.change_pct).toFixed(2)}% today`;
  changeEl.style.color = isUp ? "var(--mint)" : "var(--crimson)";

  if (prev !== undefined && prev !== nifty.price) {
    flashEl(priceEl, nifty.price - prev);
  }

  sparkHistory.push(nifty.price);
  if (sparkHistory.length > 40) sparkHistory.shift();
  drawSpark(sparkHistory, isUp);

  const sensex = stocks.find(s => s.symbol === "^BSESN");
  if (!sensex) return;
  const sensexPrice = document.getElementById("sensexPrice");
  const sensexChange = document.getElementById("sensexChange");
  const sensexUp = sensex.change_pct >= 0;
  sensexPrice.textContent = fmtINR(sensex.price);
  sensexChange.textContent = `${sensexUp ? "▲" : "▼"} ${Math.abs(sensex.change_pct).toFixed(2)}% today`;
  sensexChange.style.color = sensexUp ? "var(--mint)" : "var(--crimson)";
  sensexHistory.push(sensex.price);
  if (sensexHistory.length > 40) sensexHistory.shift();
  drawIndexSpark(sensexHistory, sensexUp, "sensexSpark");
}

function drawSpark(values, isUp) {
  const svg = document.getElementById("spotlightSpark");
  if (!values.length) { svg.innerHTML = ""; return; }
  if (values.length === 1) values = [values[0], values[0]];
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const w = 300, h = 60, pad = 4;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const color = isUp ? "#3ecf8e" : "#e8583f";
  svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
}

function drawIndexSpark(values, isUp, elementId) {
  const svg = document.getElementById(elementId);
  if (!svg || !values.length) return;
  if (values.length === 1) values = [values[0], values[0]];
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1) * 300).toFixed(1)},${(60 - 4 - ((value - min) / range) * 52).toFixed(1)}`).join(" ");
  svg.innerHTML = `<polyline points="${points}" fill="none" stroke="${isUp ? "#3ecf8e" : "#e8583f"}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
}

// ---------- mandi ----------

async function loadMandiMeta() {
  try {
    const res = await fetch("/api/mandi/meta");
    const meta = await res.json();
    const stateSel = document.getElementById("stateFilter");
    const commSel = document.getElementById("commodityFilter");
    meta.states.forEach(s => {
      if (!s) return;
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      stateSel.appendChild(opt);
    });
    meta.commodities.forEach(c => {
      if (!c) return;
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      commSel.appendChild(opt);
    });
  } catch (e) {
    console.error("mandi meta failed", e);
  }
}

async function loadMandi() {
  try {
    const params = new URLSearchParams();
    if (activeFilters.state) params.set("state", activeFilters.state);
    if (activeFilters.commodity) params.set("commodity", activeFilters.commodity);
    const res = await fetch("/api/mandi?" + params.toString());
    const rows = await res.json();
    renderMandi(rows);
  } catch (e) {
    console.error("mandi load failed", e);
  }
}

function renderMandi(rows) {
  const grid = document.getElementById("mandiGrid");
  if (!rows.length) {
    grid.innerHTML = `<p style="color:var(--ink-dim)">No mandi data yet — the server fetches this on startup, give it a moment and refresh.</p>`;
    return;
  }
  grid.innerHTML = "";
  rows.slice(0, 60).forEach(r => {
    const key = `${r.market}|${r.commodity}|${r.variety}`;
    const card = document.createElement("div");
    card.className = "price-card price-card--mandi";
    card.innerHTML = `
      <div class="pc-name">${r.commodity}${r.variety && r.variety !== "-" ? " · " + r.variety : ""}</div>
      <div class="pc-sub">${r.market}, ${r.state}</div>
      <span class="pc-price" data-key="${key}">${fmtMandiPrice(r.modal_price)}</span>
      <div class="pc-range">Exact range ${fmtINR(r.min_price)} – ${fmtINR(r.max_price)}</div>
    `;
    grid.appendChild(card);

    const prev = lastMandiPrices[key];
    if (prev !== undefined && prev !== r.modal_price) {
      flashEl(card.querySelector(".pc-price"), r.modal_price - prev);
    }
    lastMandiPrices[key] = r.modal_price;
  });
}

// ---------- wire up ----------

document.getElementById("stateFilter").addEventListener("change", e => {
  activeFilters.state = e.target.value;
  loadMandi();
});
document.getElementById("commodityFilter").addEventListener("change", e => {
  activeFilters.commodity = e.target.value;
  loadMandi();
});

updateClock();
applySavedTheme();
wireFeedback();
setInterval(updateClock, 1000);

loadStocks();
loadMandiMeta().then(loadMandi);

setInterval(loadStocks, STOCK_POLL_MS);
setInterval(loadMandi, MANDI_POLL_MS);
