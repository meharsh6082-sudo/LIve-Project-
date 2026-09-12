function moneyDetail(value) { return value == null ? "-" : "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
async function loadStockDetailPage() {
  applyPageTheme(); updatePageClock(); setInterval(updatePageClock, 1000);
  const symbol = decodeURIComponent(location.pathname.split("/").pop()).toUpperCase();
  const period = document.getElementById("historyPeriod");
  async function load() {
    try {
      const [quote, history] = await Promise.all([getJson(`/api/stocks/quote?symbol=${encodeURIComponent(symbol)}`), getJson(`/api/stocks/history?symbol=${encodeURIComponent(symbol)}&period=${period.value}`)]);
      document.getElementById("stockName").textContent = quote.name || symbol; document.getElementById("stockSymbol").textContent = symbol;
      document.getElementById("stockDetailStats").innerHTML = `<div class="stat-card"><div class="stat-label">Price</div><div class="stat-value">${moneyDetail(quote.price)}</div></div><div class="stat-card"><div class="stat-label">Change</div><div class="stat-value ${changeClass(quote.change_pct)}">${Number(quote.change_pct).toFixed(2)}%</div></div><div class="stat-card"><div class="stat-label">Day range</div><div class="stat-value">${moneyDetail(quote.day_low)} - ${moneyDetail(quote.day_high)}</div></div><div class="stat-card"><div class="stat-label">Volume</div><div class="stat-value">${Number(quote.volume || 0).toLocaleString("en-IN")}</div></div>`;
      drawDetailChart(history.map(item => Number(item.close ?? item.price ?? item)));
    } catch (error) { document.getElementById("stockDetailMessage").textContent = "Quote or history is unavailable for this symbol."; }
  }
  period.addEventListener("change", load); await load();
}
function drawDetailChart(values) { const canvas = document.getElementById("detailChart"), context = canvas.getContext("2d"), width = canvas.clientWidth || 700, height = canvas.height; canvas.width = width * devicePixelRatio; canvas.height = height * devicePixelRatio; context.scale(devicePixelRatio, devicePixelRatio); context.clearRect(0, 0, width, height); if (values.length < 2) { context.fillStyle = "#8d8ea6"; context.fillText("Not enough history", 12, 30); return; } const min = Math.min(...values), range = Math.max(...values) - min || 1; context.strokeStyle = values.at(-1) >= values[0] ? "#3ecf8e" : "#e8583f"; context.lineWidth = 3; context.beginPath(); values.forEach((value, index) => { const x = 12 + index / (values.length - 1) * (width - 24), y = height - 18 - (value - min) / range * (height - 36); index ? context.lineTo(x, y) : context.moveTo(x, y); }); context.stroke(); }
