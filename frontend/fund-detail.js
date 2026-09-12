function detailMoney(value) { return "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 4 }); }
function drawDetailChart(history) {
  const canvas = document.getElementById("fundChart"); if (!canvas || history.length < 2) return;
  const context = canvas.getContext("2d"); const width = canvas.clientWidth || 800; const height = canvas.height; canvas.width = width;
  const values = history.slice().reverse().map(item => item.nav); const min = Math.min(...values); const range = Math.max(...values) - min || 1;
  context.clearRect(0, 0, width, height); context.strokeStyle = "#e8a33d"; context.lineWidth = 2; context.beginPath();
  values.forEach((value, index) => { const x = index / (values.length - 1) * (width - 20) + 10; const y = height - 15 - ((value - min) / range) * (height - 30); index ? context.lineTo(x, y) : context.moveTo(x, y); }); context.stroke();
}
async function loadFundDetail() {
  const code = window.location.pathname.split("/").pop(); const target = document.getElementById("fundDetail");
  try {
    const response = await fetch(`/api/mutual-funds/${code}`); if (!response.ok) throw new Error();
    const data = await response.json(); const meta = data.meta; const latest = data.latest; const history = data.history; const old = history[Math.min(history.length - 1, 251)]; const yearReturn = old ? (latest.nav - old.nav) / old.nav * 100 : 0;
    document.title = `${meta.scheme_name} NAV - Mandi & Market`;
    target.innerHTML = `<div class="page-heading"><div><h1>Fund NAV details</h1><p>${meta.scheme_name}</p></div><a class="tool-button" href="/mutual-funds">Back to fund search</a></div><div class="fund-header"><div><h2>${meta.scheme_name}</h2><p>${meta.fund_house || "Fund house unavailable"} · ${meta.scheme_category || "Category unavailable"}</p></div><button class="tool-button" id="saveFund">Save fund</button></div><div class="stat-row"><div class="stat-card"><div class="stat-label">Latest NAV</div><div class="stat-value">${detailMoney(latest.nav)}</div></div><div class="stat-card"><div class="stat-label">NAV movement</div><div class="stat-value ${latest.change_pct >= 0 ? "positive" : "negative"}">${latest.change_pct.toFixed(2)}%</div></div><div class="stat-card"><div class="stat-label">Approx. 1-year return</div><div class="stat-value ${yearReturn >= 0 ? "positive" : "negative"}">${yearReturn.toFixed(2)}%</div></div></div><div class="fund-facts"><span>Fund house: ${meta.fund_house || "Not supplied"}</span><span>Category: ${meta.scheme_category || "Not supplied"}</span><span>Plan: ${meta.scheme_type || "Not supplied"}</span><span>Scheme code: ${meta.scheme_code || code}</span><span>NAV date: ${latest.date}</span><span>Expense ratio/AUM: Not supplied by NAV provider</span></div><div class="chart-panel"><div class="panel-heading"><h2>NAV history</h2><span class="board-sub">${history.length} provider records</span></div><canvas id="fundChart" height="240"></canvas></div>`;
    drawDetailChart(history); document.getElementById("saveFund").onclick = () => { const saved = JSON.parse(localStorage.getItem("saved-funds") || "[]"); if (!saved.some(item => item.code === code)) saved.push({ code, name: meta.scheme_name }); localStorage.setItem("saved-funds", JSON.stringify(saved)); document.getElementById("saveFund").textContent = "Saved"; };
  } catch (error) { target.innerHTML = '<p class="empty-state">This fund NAV could not be loaded. Return to search and choose another scheme.</p>'; }
}
loadFundDetail();
