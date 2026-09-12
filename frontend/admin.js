async function loadAdminPage() {
  document.body.classList.add(`theme-${localStorage.getItem("market-theme") || "1"}`);
  const refresh = document.getElementById("adminRefresh"); const ticker = document.getElementById("adminTicker"); refresh.value = localStorage.getItem("stock-refresh-seconds") || "15"; ticker.value = localStorage.getItem("ticker-duration") || "120";
  refresh.onchange = () => { localStorage.setItem("stock-refresh-seconds", refresh.value); document.getElementById("adminMessage").textContent = "Saved locally. Restart the server to change backend polling."; };
  ticker.onchange = () => { localStorage.setItem("ticker-duration", ticker.value); document.documentElement.style.setProperty("--ticker-duration", `${ticker.value}s`); document.getElementById("adminMessage").textContent = "Ticker preference saved for this browser."; };
  document.getElementById("resetAdmin").onclick = () => { localStorage.removeItem("stock-refresh-seconds"); localStorage.removeItem("ticker-duration"); location.reload(); };
  const logoutButton = document.getElementById("adminLogout");
  if (logoutButton) logoutButton.addEventListener("click", async event => {
    event.preventDefault();
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out...";
    try {
      const response = await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw new Error("Logout failed");
      window.location.replace("/admin?logged_out=1");
    } catch (error) {
      logoutButton.disabled = false;
      logoutButton.textContent = "Log out";
      document.getElementById("adminMessage").textContent = "Logout failed. Please try again.";
    }
  });
  try { const stocks = await (await fetch("/api/stocks")).json(); document.getElementById("adminStockCount").textContent = stocks.length; } catch (error) { document.getElementById("adminStockCount").textContent = "Unavailable"; }
  if (typeof loadAdminTools === "function") loadAdminTools();
}
