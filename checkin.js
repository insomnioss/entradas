const form = document.querySelector("#checkinForm");
const result = document.querySelector("#checkinResult");
const API_BASE_URL = (window.INSOMNIO_API_BASE_URL || "").replace(/\/$/, "");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.textContent = "Validando...";
  result.className = "checkin-result";
  try {
    const response = await fetch(`${API_BASE_URL}/api/checkin/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-checkin-key": document.querySelector("#checkinKey").value },
      body: JSON.stringify({ code: document.querySelector("#qrCode").value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    result.classList.add(data.status === "approved" ? "success" : "warning");
    result.textContent = data.status === "approved"
      ? `Entrada válida: ${data.ticket.holderName} (${data.ticket.type}). Ingreso registrado.`
      : `Esta entrada ya fue utilizada por ${data.ticket.holderName}.`;
  } catch (error) {
    result.classList.add("error-state");
    result.textContent = error.message || "No fue posible validar la entrada.";
  }
});
