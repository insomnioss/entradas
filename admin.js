const API_BASE_URL = (window.INSOMNIO_API_BASE_URL || "").replace(/\/$/, "");
const login = document.querySelector("#adminLogin");
const dashboard = document.querySelector("#adminDashboard");
const loginForm = document.querySelector("#adminLoginForm");
const keyInput = document.querySelector("#adminKey");
const loginResult = document.querySelector("#adminLoginResult");
const catalogEditor = document.querySelector("#catalogEditor");
const addTicketForm = document.querySelector("#addTicketForm");
const newTicketFeedback = document.querySelector("#newTicketFeedback");
const salesList = document.querySelector("#salesList");
const salesSearch = document.querySelector("#salesSearch");
const salesPerPage = document.querySelector("#salesPerPage");
const previousSalesPage = document.querySelector("#previousSalesPage");
const nextSalesPage = document.querySelector("#nextSalesPage");
const salesPageInfo = document.querySelector("#salesPageInfo");
const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
let sales = [];
let currentSalesPage = 1;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[character]));
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function dateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function deadlineValue(input) {
  return input.value ? new Date(input.value).toISOString() : null;
}

async function api(path, options = {}) {
  const payload = options.body ? JSON.parse(options.body) : {};
  payload.adminKey = keyInput.value;
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, method: options.method || "POST", body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No fue posible cargar la información.");
  return data;
}

function renderCatalog(catalog) {
  catalogEditor.innerHTML = catalog.map((ticket) => `
    <form class="catalog-row" data-ticket-id="${ticket.id}">
      <div><strong>${ticket.name}</strong><span>${ticket.id}</span></div>
      <label>Nombre<input data-name type="text" value="${ticket.name}" required /></label>
      <label>Precio CLP<input data-price type="number" min="0" step="500" value="${ticket.price}" required /></label>
      <label>Máx. por compra<input data-max type="number" min="1" max="500" value="${ticket.max}" required /></label>
      <label>Límite total<input data-sales-limit type="number" min="0" max="100000" value="${ticket.salesLimit}" required /></label>
      <label>Fecha límite<input data-sale-end-at type="datetime-local" value="${dateInputValue(ticket.saleEndAt)}" /></label>
      <div class="catalog-stock"><span>Vendidas / reservadas</span><strong>${ticket.sold} / ${ticket.salesLimit}</strong><small>${ticket.remaining === 0 ? "AGOTADA" : `${ticket.remaining} disponibles`}</small></div>
      <label class="switch-label"><input data-active type="checkbox" ${ticket.active ? "checked" : ""} /> Disponible</label>
      <button class="secondary-button" type="submit">Guardar</button>
      <button class="remove-ticket" type="button" data-remove ${ticket.active ? "" : "disabled"}>Quitar de venta</button>
      <p class="catalog-feedback" data-feedback></p>
    </form>`).join("");
}

function statusInfo(sale) {
  if (sale.order_status === "failed") return { label: "Pago rechazado", className: "rejected" };
  if (sale.order_status !== "paid") return { label: "Pago pendiente", className: "payment-pending" };
  if (sale.ticket_status === "used") return { label: "Validada", className: "used" };
  return { label: "Por validar", className: "active" };
}

function renderSales() {
  const query = normalizeText(salesSearch.value);
  const filtered = sales.filter((sale) => normalizeText(`${sale.holder_name} ${sale.buyer_name} ${sale.type}`).includes(query));
  const perPage = Number(salesPerPage.value);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  currentSalesPage = Math.min(currentSalesPage, totalPages);
  const visibleSales = filtered.slice((currentSalesPage - 1) * perPage, currentSalesPage * perPage);
  salesList.innerHTML = visibleSales.length ? visibleSales.map((sale) => {
    const status = statusInfo(sale);
    const qrDetails = sale.qrPayload ? `
      <div class="sale-qr" data-qr-payload="${escapeHtml(sale.qrPayload)}"></div>
      <p class="manual-code"><span>Código manual</span><code>${escapeHtml(sale.qrPayload)}</code></p>
      <button class="secondary-button qr-download" type="button" data-download-qr="${sale.ticket_id}">Guardar QR</button>` :
      '<p class="sale-no-qr">El QR estará disponible cuando Mercado Pago confirme el pago.</p>';
    return `
    <article class="sale-row">
      <div><span class="sale-type">${escapeHtml(sale.type)}</span><h3>${escapeHtml(normalizeText(sale.holder_name))}</h3><p>Comprador: ${escapeHtml(normalizeText(sale.buyer_name))}</p></div>
      <div class="sale-price"><strong>${money.format(sale.price)}</strong><span>${new Date(sale.created_at).toLocaleDateString("es-CL")}</span></div>
      <div class="sale-actions"><span class="sale-status ${status.className}">${status.label}</span><button class="remove-sale" type="button" data-delete-sale="${sale.ticket_id}">Eliminar</button></div>
      <details class="sale-details"><summary>Ver datos y QR</summary><div class="sale-detail-grid"><p><span>Contacto</span>${escapeHtml(sale.buyer_phone)}</p><p><span>RUT comprador</span>${escapeHtml(sale.buyer_rut)}</p><p><span>Titular de esta entrada</span>${escapeHtml(normalizeText(sale.holder_name))}</p></div><div class="sale-qr-area">${qrDetails}</div></details>
    </article>`;
  }).join("") : '<p class="empty-sales">No hay entradas que coincidan con la búsqueda.</p>';
  document.querySelectorAll(".sale-qr[data-qr-payload]").forEach((element) => {
    new QRCode(element, { text: element.dataset.qrPayload, width: 156, height: 156, correctLevel: QRCode.CorrectLevel.M });
  });
  salesPageInfo.textContent = filtered.length ? `Página ${currentSalesPage} de ${totalPages} · ${filtered.length} entradas` : "Sin resultados";
  previousSalesPage.disabled = currentSalesPage <= 1;
  nextSalesPage.disabled = currentSalesPage >= totalPages;
}

function downloadQr(button) {
  const sale = sales.find((item) => item.ticket_id === button.dataset.downloadQr);
  const qrCanvas = button.closest(".sale-qr-area").querySelector("canvas");
  if (!sale || !qrCanvas) return;
  const link = document.createElement("a");
  link.href = qrCanvas.toDataURL("image/png");
  link.download = `entrada-insomnio-${sale.holder_name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || sale.ticket_id}.png`;
  link.click();
}

async function loadDashboard() {
  const [catalog, data] = await Promise.all([api("/api/admin/catalog"), api("/api/admin/sales")]);
  renderCatalog(catalog);
  sales = data.sales;
  document.querySelector("#soldTickets").textContent = data.summary.tickets;
  document.querySelector("#revenue").textContent = money.format(data.summary.revenue);
  document.querySelector("#usedTickets").textContent = sales.filter((sale) => sale.ticket_status === "used").length;
  renderSales();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginResult.className = "checkin-result";
  loginResult.textContent = "Cargando panel...";
  try {
    await loadDashboard();
    login.hidden = true;
    dashboard.hidden = false;
  } catch (error) {
    loginResult.className = "checkin-result error-state";
    loginResult.textContent = error.message;
  }
});

catalogEditor.addEventListener("submit", async (event) => {
  const form = event.target.closest(".catalog-row");
  if (!form) return;
  event.preventDefault();
  const feedback = form.querySelector("[data-feedback]");
  feedback.textContent = "Guardando...";
  try {
    await api(`/api/admin/ticket-types/${form.dataset.ticketId}/update`, { method: "POST", body: JSON.stringify({ name: form.querySelector("[data-name]").value, price: Number(form.querySelector("[data-price]").value), max: Number(form.querySelector("[data-max]").value), salesLimit: Number(form.querySelector("[data-sales-limit]").value), saleEndAt: deadlineValue(form.querySelector("[data-sale-end-at]")), active: form.querySelector("[data-active]").checked }) });
    feedback.textContent = "Guardado";
    feedback.className = "catalog-feedback saved";
  } catch (error) {
    feedback.textContent = error.message;
    feedback.className = "catalog-feedback error-state";
  }
});

addTicketForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  newTicketFeedback.className = "catalog-feedback";
  newTicketFeedback.textContent = "Agregando entrada...";
  try {
    await api("/api/admin/ticket-types", { method: "POST", body: JSON.stringify({ name: document.querySelector("#newTicketName").value, price: Number(document.querySelector("#newTicketPrice").value), max: Number(document.querySelector("#newTicketMax").value), salesLimit: Number(document.querySelector("#newTicketSalesLimit").value), saleEndAt: deadlineValue(document.querySelector("#newTicketSaleEndAt")) }) });
    addTicketForm.reset();
    document.querySelector("#newTicketMax").value = 50;
    document.querySelector("#newTicketSalesLimit").value = 50;
    document.querySelector("#newTicketSaleEndAt").value = "";
    newTicketFeedback.className = "catalog-feedback saved";
    newTicketFeedback.textContent = "Entrada agregada y disponible para comprar.";
    await loadDashboard();
  } catch (error) {
    newTicketFeedback.className = "catalog-feedback error-state";
    newTicketFeedback.textContent = error.message;
  }
});

catalogEditor.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button || button.disabled) return;
  const form = button.closest(".catalog-row");
  if (!window.confirm("¿Quitar esta entrada de las nuevas ventas? El historial se conservará.")) return;
  button.disabled = true;
  button.textContent = "Quitando...";
  try {
    await api(`/api/admin/ticket-types/${form.dataset.ticketId}/remove`, { method: "POST" });
    await loadDashboard();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Quitar de venta";
    form.querySelector("[data-feedback]").textContent = error.message;
  }
});

salesSearch.addEventListener("input", () => { currentSalesPage = 1; renderSales(); });
salesPerPage.addEventListener("change", () => { currentSalesPage = 1; renderSales(); });
previousSalesPage.addEventListener("click", () => { currentSalesPage -= 1; renderSales(); });
nextSalesPage.addEventListener("click", () => { currentSalesPage += 1; renderSales(); });
document.querySelector("#refreshAdmin").addEventListener("click", () => { loadDashboard(); });

salesList.addEventListener("click", async (event) => {
  const downloadButton = event.target.closest("[data-download-qr]");
  if (downloadButton) {
    downloadQr(downloadButton);
    return;
  }
  const button = event.target.closest("[data-delete-sale]");
  if (!button) return;
  if (!window.confirm("¿Eliminar este registro de entrada? Esta acción no se puede deshacer.")) return;
  button.disabled = true;
  button.textContent = "Eliminando...";
  try {
    await api(`/api/admin/tickets/${button.dataset.deleteSale}/remove`, { method: "POST" });
    await loadDashboard();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Eliminar";
    window.alert(error.message);
  }
});
