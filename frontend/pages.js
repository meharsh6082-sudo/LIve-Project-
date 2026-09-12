function updatePageClock() {
  const clock = document.getElementById("clock");
  if (clock) clock.textContent = new Date().toLocaleTimeString("en-IN", { hour12: false });
}

function applyPageTheme() {
  document.body.classList.add(`theme-${localStorage.getItem("market-theme") || "1"}`);
}

function money(value) {
  if (value === null || value === undefined) return "-";
  return "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function mandiMoney(value) {
  if (value === null || value === undefined) return "-";
  return "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function changeClass(value) {
  return Number(value) >= 0 ? "positive" : "negative";
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Request failed: " + response.status);
  return response.json();
}

const stockPageState = { stocks: [], view: "all", watchlist: JSON.parse(localStorage.getItem("market-watchlist") || "[]"), history: {} };
let stockLinkHandled = false;

function stockCategory(stock) {
  const symbol = stock.symbol;
  if (["^NSEI", "^BSESN"].includes(symbol)) return "index";
  if (/BANK|FIN|BAJAJ|HDFC|ICICI|KOTAK|SBIN|AXIS|INDUS/.test(symbol)) return "banking";
  if (/TCS|INFY|HCL|TECHM|WIPRO/.test(symbol)) return "technology";
  if (/POWER|NTPC|ONGC|COAL|BPCL|RELIANCE|SUZLON|ADANI/.test(symbol)) return "energy";
  if (/AUTO|M&M|MARUTI|EICHER|HERO/.test(symbol)) return "auto";
  if (/ITC|HINDUNILVR|BRITANNIA|NESTLE|TITAN|TRENT|TATA.CONSUM/.test(symbol)) return "consumer";
  return "industrial";
}

function stockSize(stock) {
  return ["^NSEI", "^BSESN", "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "BHARTIARTL.NS"].includes(stock.symbol) ? "large" : "mid";
}

function drawStockChart() {
  const canvas = document.getElementById("stockChart");
  if (!canvas) return;
  const symbol = document.getElementById("chartSymbol")?.value || stockPageState.watchlist[0] || stockPageState.stocks[0]?.symbol;
  const values = (stockPageState.history[symbol] || []).slice(-(Number(document.getElementById("chartWindow").value) || 20));
  const selectedStock = stockPageState.stocks.find(stock => stock.symbol === symbol);
  const title = document.getElementById("chartTitle");
  if (title) title.textContent = selectedStock ? `${selectedStock.name} (${selectedStock.symbol})` : "Stock price line";
  const context = canvas.getContext("2d");
  const width = canvas.clientWidth || 600;
  const height = canvas.height;
  canvas.width = width * (window.devicePixelRatio || 1);
  canvas.height = height * (window.devicePixelRatio || 1);
  context.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  context.clearRect(0, 0, width, height);
  if (values.length < 2) { context.fillStyle = "#8d8ea6"; context.fillText("Select a watched stock or wait for another update", 12, 30); return; }
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  context.strokeStyle = values[values.length - 1] >= values[0] ? "#3ecf8e" : "#e8583f";
  context.lineWidth = 2; context.beginPath();
  values.forEach((value, index) => { const x = index / (values.length - 1) * (width - 20) + 10; const y = height - 15 - ((value - min) / range) * (height - 30); index ? context.lineTo(x, y) : context.moveTo(x, y); });
  context.stroke();
}

function renderStockPage() {
  const search = document.getElementById("stockSearch").value.trim().toLowerCase();
  const category = document.getElementById("stockCategory").value;
  const size = document.getElementById("stockSize").value;
  const sort = document.getElementById("stockSort").value;
  const chartSymbol = document.getElementById("chartSymbol");
  const currentChartSymbol = chartSymbol.value;
  chartSymbol.innerHTML = stockPageState.stocks.map(stock => `<option value="${stock.symbol}">${stock.name} (${stock.symbol})</option>`).join("");
  chartSymbol.value = stockPageState.stocks.some(stock => stock.symbol === currentChartSymbol) ? currentChartSymbol : (stockPageState.watchlist[0] || stockPageState.stocks[0]?.symbol || "");
  let stocks = stockPageState.stocks.filter(stock => {
    const matchesSearch = !search || `${stock.name} ${stock.symbol}`.toLowerCase().includes(search);
    const matchesCategory = category === "all" || stockCategory(stock) === category;
    const matchesSize = size === "all" || stockSize(stock) === size;
    const matchesView = stockPageState.view === "all" || (stockPageState.view === "gainers" && stock.change_pct >= 0) || (stockPageState.view === "losers" && stock.change_pct < 0) || (stockPageState.view === "watchlist" && stockPageState.watchlist.includes(stock.symbol));
    return matchesSearch && matchesCategory && matchesSize && matchesView;
  });
  stocks.sort((a, b) => sort === "change" ? b.change_pct - a.change_pct : sort === "price" ? b.price - a.price : sort === "active" ? (b.volume || 0) - (a.volume || 0) : a.symbol.localeCompare(b.symbol));
  const gainers = stockPageState.stocks.filter(stock => stock.change_pct >= 0).length;
  document.getElementById("stockStats").innerHTML = `<div class="stat-card"><div class="stat-label">Tracked instruments</div><div class="stat-value">${stockPageState.stocks.length}</div></div><div class="stat-card"><div class="stat-label">Advancing</div><div class="stat-value positive">${gainers}</div></div><div class="stat-card"><div class="stat-label">Declining</div><div class="stat-value negative">${stockPageState.stocks.length - gainers}</div></div>`;
  document.getElementById("stockRows").innerHTML = stocks.map(stock => `<tr id="stock-${encodeURIComponent(stock.symbol)}"><td><button class="watch-button ${stockPageState.watchlist.includes(stock.symbol) ? "is-watched" : ""}" data-watch="${stock.symbol}" aria-label="Toggle watchlist">${stockPageState.watchlist.includes(stock.symbol) ? "★" : "☆"}</button></td><td><a href="/stocks/${encodeURIComponent(stock.symbol)}">${stock.name}</a></td><td>${stock.symbol}</td><td>${money(stock.price)}</td><td class="${changeClass(stock.change_pct)}">${Number(stock.change_pct).toFixed(2)}%</td><td>${money(stock.day_low)} - ${money(stock.day_high)}</td><td>${new Date((stock.fetched_at || Date.now() / 1000) * 1000).toLocaleTimeString("en-IN", { hour12: false })}</td></tr>`).join("") || '<tr><td colspan="7" class="empty-state">No stocks match these filters.</td></tr>';
  document.querySelectorAll("[data-watch]").forEach(button => button.addEventListener("click", () => { const symbol = button.dataset.watch; stockPageState.watchlist = stockPageState.watchlist.includes(symbol) ? stockPageState.watchlist.filter(item => item !== symbol) : [...stockPageState.watchlist, symbol]; localStorage.setItem("market-watchlist", JSON.stringify(stockPageState.watchlist)); renderStockPage(); drawStockChart(); }));
  drawStockChart();
  const requestedSymbol = new URLSearchParams(window.location.search).get("symbol");
  if (requestedSymbol && !stockLinkHandled) {
    const row = document.getElementById(`stock-${encodeURIComponent(requestedSymbol)}`);
    if (row) { stockLinkHandled = true; row.classList.add("stock-row-highlight"); row.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }
}

async function loadStocksPage() {
  applyPageTheme();
  updatePageClock(); setInterval(updatePageClock, 1000);
  ["stockSearch", "stockCategory", "stockSize", "stockSort", "chartWindow", "chartSymbol"].forEach(id => document.getElementById(id).addEventListener("input", renderStockPage));
  document.querySelectorAll("[data-stock-view]").forEach(button => button.addEventListener("click", () => { stockPageState.view = button.dataset.stockView; document.querySelectorAll("[data-stock-view]").forEach(item => item.classList.toggle("is-active", item === button)); renderStockPage(); }));
  document.getElementById("addStock").addEventListener("click", async () => { const input = document.getElementById("newStockSymbol"); const message = document.getElementById("stockMessage"); const symbol = input.value.trim().toUpperCase(); if (!symbol) return; message.textContent = "Checking Yahoo Finance..."; try { await getJson(`/api/stocks/quote?symbol=${encodeURIComponent(symbol)}`); input.value = ""; message.textContent = `${symbol} added`; await refreshStockData(); } catch (error) { message.textContent = "Symbol not found on Yahoo Finance"; } });
  await refreshStockData();
  setInterval(refreshStockData, 15000);
  window.addEventListener("resize", drawStockChart);
}

async function refreshStockData() {
  try { stockPageState.stocks = await getJson("/api/stocks"); stockPageState.stocks.forEach(stock => { stockPageState.history[stock.symbol] = [...(stockPageState.history[stock.symbol] || []), stock.price].slice(-120); }); renderStockPage(); } catch (error) { document.getElementById("stockRows").innerHTML = '<tr><td colspan="7" class="empty-state">Stock data is temporarily unavailable.</td></tr>'; }
}

async function loadMandiPage() {
  applyPageTheme();
  updatePageClock();
  setInterval(updatePageClock, 1000);
  const stateFilter = document.getElementById("stateFilter");
  const commodityFilter = document.getElementById("commodityFilter");
  try {
    const meta = await getJson("/api/mandi/meta");
    meta.states.filter(Boolean).forEach(state => stateFilter.add(new Option(state, state)));
    meta.commodities.filter(Boolean).forEach(commodity => commodityFilter.add(new Option(commodity, commodity)));
  } catch (error) {}
  async function refresh() {
    const params = new URLSearchParams();
    if (stateFilter.value) params.set("state", stateFilter.value);
    if (commodityFilter.value) params.set("commodity", commodityFilter.value);
    try {
      const rows = await getJson("/api/mandi?" + params);
      document.getElementById("mandiRows").innerHTML = rows.map(row => `
        <tr><td><a href="/commodities/${encodeURIComponent(row.commodity)}">${row.commodity}</a>${row.variety && row.variety !== "-" ? " - " + row.variety : ""}</td>
        <td>${row.market || "-"}</td><td>${row.state || "-"}</td><td>${mandiMoney(row.modal_price)}</td>
        <td>${mandiMoney(row.min_price)} - ${mandiMoney(row.max_price)}</td><td>${row.arrival_date || "-"}</td></tr>`).join("") || '<tr><td colspan="6" class="empty-state">No mandi records match these filters.</td></tr>';
    } catch (error) {
      document.getElementById("mandiRows").innerHTML = '<tr><td colspan="6" class="empty-state">Mandi data is unavailable. Check the API key and server log.</td></tr>';
    }
  }
  stateFilter.addEventListener("change", refresh);
  commodityFilter.addEventListener("change", refresh);
  refresh();
}

async function loadAnalyticsPage() {
  applyPageTheme();
  updatePageClock();
  setInterval(updatePageClock, 1000);
  try {
    const [stocks, mandi] = await Promise.all([getJson("/api/stocks"), getJson("/api/mandi")]);
    const avgChange = stocks.length ? stocks.reduce((sum, stock) => sum + Number(stock.change_pct), 0) / stocks.length : 0;
    const commodities = new Set(mandi.map(row => row.commodity).filter(Boolean));
    document.getElementById("analyticsStats").innerHTML = `
      <div class="stat-card"><div class="stat-label">Stock average move</div><div class="stat-value ${changeClass(avgChange)}">${avgChange.toFixed(2)}%</div></div>
      <div class="stat-card"><div class="stat-label">Mandi records</div><div class="stat-value">${mandi.length}</div></div>
      <div class="stat-card"><div class="stat-label">Commodities tracked</div><div class="stat-value">${commodities.size}</div></div>`;
    const maxMove = Math.max(...stocks.map(stock => Math.abs(Number(stock.change_pct))), 1);
    document.getElementById("stockBars").innerHTML = stocks.map(stock => `
      <div class="bar-item"><span>${stock.name}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.min(Math.abs(stock.change_pct) / maxMove * 100, 100)}%;background:${Number(stock.change_pct) >= 0 ? "var(--mint)" : "var(--crimson)"}"></div></div><strong class="${changeClass(stock.change_pct)}">${Number(stock.change_pct).toFixed(2)}%</strong></div>`).join("");
    const counts = {};
    mandi.forEach(row => { counts[row.commodity] = (counts[row.commodity] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxCount = Math.max(...top.map(item => item[1]), 1);
    document.getElementById("commodityBars").innerHTML = top.map(([name, count]) => `<div class="bar-item"><span>${name}</span><div class="bar-track"><div class="bar-fill" style="width:${count / maxCount * 100}%"></div></div><strong>${count}</strong></div>`).join("") || '<p class="empty-state">No mandi data available.</p>';
  } catch (error) {
    document.getElementById("analyticsStats").innerHTML = '<p class="empty-state">Analytics data is temporarily unavailable.</p>';
  }
}

async function loadSettingsPage() {
  applyPageTheme();
  updatePageClock();
  setInterval(updatePageClock, 1000);
  const themeSelect = document.getElementById("themeSelect");
  if (themeSelect) {
    themeSelect.value = localStorage.getItem("market-theme") || "1";
    themeSelect.addEventListener("change", event => {
      localStorage.setItem("market-theme", event.target.value);
      document.body.className = document.body.className.replace(/\btheme-\d+\b/g, "");
      applyPageTheme();
    });
  }
  try {
    const result = await getJson("/api/health");
    const status = document.getElementById("healthStatus");
    status.textContent = result.status === "ok" ? "Online" : "Unavailable";
    status.className = result.status === "ok" ? "positive" : "negative";
  } catch (error) {
    document.getElementById("healthStatus").textContent = "Unavailable";
  }
}
