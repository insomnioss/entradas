const orderId = new URLSearchParams(window.location.search).get("order_id");
const paymentId = new URLSearchParams(window.location.search).get("payment_id") || new URLSearchParams(window.location.search).get("collection_id");
const API_BASE_URL = (window.INSOMNIO_API_BASE_URL || "").replace(/\/$/, "");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");
const ticketResults = document.querySelector("#ticketResults");

const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function renderTickets(tickets, total) {
  resultTitle.textContent = "Tus entradas están listas";
  resultText.textContent = `Pago confirmado. Total pagado: ${money.format(total)} CLP.`;
  ticketResults.innerHTML = tickets.map((ticket) => `
    <article class="qr-ticket">
      <div class="qr-code" data-qr-payload="${ticket.qrPayload}"></div>
      <div><span>${ticket.type}</span><h2>${ticket.holderName}</h2><p>Presenta este QR en el acceso. Es personal y se valida una sola vez.</p></div>
    </article>`).join("");
  document.querySelectorAll("[data-qr-payload]").forEach((element) => {
    new QRCode(element, { text: element.dataset.qrPayload, width: 148, height: 148, correctLevel: QRCode.CorrectLevel.M });
  });
}

async function loadOrder(attempt = 0) {
  if (!orderId) {
    resultTitle.textContent = "No encontramos la compra";
    resultText.textContent = "Vuelve a la página de entradas o contáctanos por WhatsApp.";
    return;
  }
  try {
    const suffix = paymentId ? `?payment_id=${encodeURIComponent(paymentId)}` : "";
    const response = await fetch(`${API_BASE_URL}/api/orders/${encodeURIComponent(orderId)}${suffix}`);
    const order = await response.json();
    if (!response.ok) throw new Error(order.error);
    if (order.status === "paid") return renderTickets(order.tickets, order.total);
    if (order.status === "failed") {
      resultTitle.textContent = "El pago no fue aprobado";
      resultText.textContent = "No se generaron entradas. Puedes intentar nuevamente desde la página principal.";
      return;
    }
    resultTitle.textContent = "Pago pendiente de confirmación";
    resultText.textContent = "Cuando Mercado Pago confirme el pago, tus códigos QR aparecerán aquí automáticamente.";
    if (attempt < 12) setTimeout(() => loadOrder(attempt + 1), 3000);
  } catch (error) {
    resultTitle.textContent = "No pudimos consultar la compra";
    resultText.textContent = error.message || "Intenta recargar la página en unos instantes.";
  }
}

loadOrder();
