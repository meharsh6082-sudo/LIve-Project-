function fundClock() {
  const clock = document.getElementById("clock");
  if (clock) clock.textContent = new Date().toLocaleTimeString("en-IN", { hour12: false });
}

function applyFundTheme() {
  document.body.classList.add(`theme-${localStorage.getItem("market-theme") || "1"}`);
}

function fundMoney(value) {
  return "Rs " + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

async function fundJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Request failed");
  return response.json();
}

function drawFundChart(history) {
  const canvas = document.getElementById("fundChart");
  if (!canvas || history.length < 2) return;
  const context = canvas.getContext("2d");
  const width = canvas.clientWidth || 700;
  const height = canvas.height;
  canvas.width = width;
  const values = history.slice().reverse().map(item => item.nav);
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  context.clearRect(0, 0, width, height);
  context.strokeStyle = "#e8a33d";
  context.lineWidth = 2;
  context.beginPath();
  values.forEach((value, index) => {
    const x = index / (values.length - 1) * (width - 20) + 10;
    const y = height - 15 - ((value - min) / range) * (height - 30);
    index ? context.lineTo(x, y) : context.moveTo(x, y);
  });
  context.stroke();
}

async function showFund(code, name) {
  const detail = document.getElementById("fundDetail");
  const url = new URL(window.location.href);
  url.searchParams.set("scheme", code);
  window.history.replaceState({}, "", url);
  detail.innerHTML = '<p class="empty-state">Loading NAV, returns, and fund details...</p>';
  try {
    const data = await fundJson(`/api/mutual-funds/${code}`);
    const meta = data.meta;
    const history = data.history;
    const latest = data.latest;
    const old = history[Math.min(history.length - 1, 251)];
    const yearReturn = old ? ((latest.nav - old.nav) / old.nav * 100) : 0;
    detail.innerHTML = `
      <div class="fund-header"><div><h2>${meta.scheme_name || name}</h2><p>${meta.fund_house || "Fund house unavailable"} · ${meta.scheme_category || "Category unavailable"}</p></div><button class="tool-button" id="saveFund">Save fund</button></div>
      <div class="stat-row">
        <div class="stat-card"><div class="stat-label">Latest NAV</div><div class="stat-value">${fundMoney(latest.nav)}</div></div>
        <div class="stat-card"><div class="stat-label">Latest NAV movement</div><div class="stat-value ${latest.change_pct >= 0 ? "positive" : "negative"}">${latest.change_pct.toFixed(2)}%</div></div>
        <div class="stat-card"><div class="stat-label">Approx. 1-year NAV return</div><div class="stat-value ${yearReturn >= 0 ? "positive" : "negative"}">${yearReturn.toFixed(2)}%</div></div>
      </div>
      <div class="fund-facts"><span>Fund house: ${meta.fund_house || "Not supplied"}</span><span>Category: ${meta.scheme_category || "Not supplied"}</span><span>Plan: ${meta.scheme_type || "Not supplied"}</span><span>Scheme code: ${meta.scheme_code || code}</span><span>NAV date: ${latest.date}</span><span>Expense ratio/AUM: Not supplied by NAV provider</span></div>
      <div class="chart-panel"><div class="panel-heading"><h2>NAV history</h2><span class="board-sub">${history.length} provider records</span></div><canvas id="fundChart" height="220"></canvas></div>`;
    drawFundChart(history);
    document.getElementById("saveFund").onclick = () => {
      const saved = JSON.parse(localStorage.getItem("saved-funds") || "[]");
      if (!saved.some(item => item.code === code)) saved.push({ code, name: meta.scheme_name || name });
      localStorage.setItem("saved-funds", JSON.stringify(saved));
      document.getElementById("saveFund").textContent = "Saved";
    };
  } catch (error) {
    detail.innerHTML = '<p class="empty-state">Fund details are temporarily unavailable. Try selecting the result again.</p>';
  }
}

async function searchFunds(query) {
  const results = document.getElementById("fundResults");
  if (query.length < 2) { results.innerHTML = '<p class="empty-state">Type at least two letters to search.</p>'; return; }
  results.innerHTML = '<p class="empty-state">Searching schemes...</p>';
  try {
    const funds = await fundJson(`/api/mutual-funds/search?q=${encodeURIComponent(query)}`);
    results.innerHTML = funds.map(fund => `<a class="fund-result" href="/mutual-funds/${fund.scheme_code}"><strong>${fund.scheme_name}</strong><span>Open NAV details →</span></a>`).join("") || '<p class="empty-state">No matching mutual funds found.</p>';
    const buttons = results.querySelectorAll("[data-code]");
    buttons.forEach(button => button.addEventListener("click", () => showFund(button.dataset.code, button.dataset.name)));
    if (buttons.length) {
      const requestedCode = new URLSearchParams(window.location.search).get("scheme");
      const selected = [...buttons].find(button => button.dataset.code === requestedCode) || buttons[0];
      showFund(selected.dataset.code, selected.dataset.name);
    }
  } catch (error) {
    results.innerHTML = '<p class="empty-state">Mutual-fund search is unavailable.</p>';
  }
}

function loadFundsPage() {
  applyFundTheme();
  fundClock();
  setInterval(fundClock, 1000);
  const input = document.getElementById("fundQuery");
  document.getElementById("fundSearchButton").onclick = () => searchFunds(input.value.trim());
  input.addEventListener("keydown", event => { if (event.key === "Enter") searchFunds(input.value.trim()); });
  searchFunds("SBI");
}
