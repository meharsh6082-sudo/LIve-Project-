const loginForm = document.getElementById("adminLoginForm");
loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const message = document.getElementById("adminLoginMessage");
  message.textContent = "Checking password...";
  try {
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: document.getElementById("adminPassword").value }) });
    if (!response.ok) throw new Error();
    window.location.href = "/admin";
  } catch (error) {
    message.textContent = "Incorrect password.";
  }
});
