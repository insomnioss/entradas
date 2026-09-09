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
const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
let sales = [];

function headers() {
  return { "Content-Type": "application/json", "x-admin-key": keyInput.value };
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
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
      <label>Máximo<input data-max type="number" min="1" max="500" value="${ticket.max}" required /></label>
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
  const query = salesSearch.value.trim().toLowerCase();
  const filtered = sales.filter((sale) => `${sale.holder_name} ${sale.buyer_name} ${sale.type}`.toLowerCase().includes(query));
  salesList.innerHTML = filtered.length ? filtered.map((sale) => {
    const status = statusInfo(sale);
    return `
    <article class="sale-row">
      <div><span class="sale-type">${sale.type}</span><h3>${sale.holder_name}</h3><p>Comprador: ${sale.buyer_name}</p></div>
      <div class="sale-price"><strong>${money.format(sale.price)}</strong><span>${new Date(sale.created_at).toLocaleDateString("es-CL")}</span></div>
      <div class="sale-actions"><span class="sale-status ${status.className}">${status.label}</span><button class="remove-sale" type="button" data-delete-sale="${sale.ticket_id}">Eliminar</button></div>
    </article>`;
  }).join("") : '<p class="empty-sales">No hay entradas que coincidan con la búsqueda.</p>';
}

async function loadDashboard() {
  const [catalog, data] = await Promise.all([api("/api/admin/ticket-types"), api("/api/admin/sales")]);
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
    await api(`/api/admin/ticket-types/${form.dataset.ticketId}`, { method: "PUT", body: JSON.stringify({ name: form.querySelector("[data-name]").value, price: Number(form.querySelector("[data-price]").value), max: Number(form.querySelector("[data-max]").value), active: form.querySelector("[data-active]").checked }) });
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
    await api("/api/admin/ticket-types", { method: "POST", body: JSON.stringify({ name: document.querySelector("#newTicketName").value, price: Number(document.querySelector("#newTicketPrice").value), max: Number(document.querySelector("#newTicketMax").value) }) });
    addTicketForm.reset();
    document.querySelector("#newTicketMax").value = 50;
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
  button.disabled = true;
  button.textContent = "Quitando...";
  try {
    await api(`/api/admin/ticket-types/${form.dataset.ticketId}`, { method: "DELETE" });
    await loadDashboard();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Quitar de venta";
    form.querySelector("[data-feedback]").textContent = error.message;
  }
});

salesSearch.addEventListener("input", renderSales);
document.querySelector("#refreshAdmin").addEventListener("click", () => { loadDashboard(); });

salesList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-sale]");
  if (!button) return;
  if (!window.confirm("¿Eliminar este registro de entrada? Esta acción no se puede deshacer.")) return;
  button.disabled = true;
  button.textContent = "Eliminando...";
  try {
    await api(`/api/admin/tickets/${button.dataset.deleteSale}`, { method: "DELETE" });
    await loadDashboard();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Eliminar";
    window.alert(error.message);
  }
});
