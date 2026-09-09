// Reemplaza este valor por el WhatsApp real, en formato internacional sin + ni espacios.
const WHATSAPP_NUMBER = "56968083233";
const API_BASE_URL = (window.INSOMNIO_API_BASE_URL || "").replace(/\/$/, "");

const fallbackTickets = [
  {
    id: "general",
    name: "Entrada General",
    price: 8000,
    max: 50,
    salesLimit: 50,
    sold: 0,
    remaining: 50,
  },
  {
    id: "cover1",
    name: "Entrada + un cover",
    price: 10000,
    max: 50,
    salesLimit: 50,
    sold: 0,
    remaining: 50,
  },
  {
    id: "cover2",
    name: "Entrada + dos cover",
    price: 12000,
    max: 50,
    salesLimit: 50,
    sold: 0,
    remaining: 50,
  },
];

let tickets = [];
let quantities = {};

const currencyFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const ticketList = document.querySelector("#ticketList");
const goToTicketsButton = document.querySelector("#goToTickets");
const ticketsSection = document.querySelector("#ticketsSection");
const totalAmount = document.querySelector("#totalAmount");
const openBuyerFormButton = document.querySelector("#openBuyerForm");
const closeBuyerFormButton = document.querySelector("#closeBuyerForm");
const buyerModal = document.querySelector("#buyerModal");
const buyerForm = document.querySelector("#buyerForm");
const orderSummary = document.querySelector("#orderSummary");
const attendeesSection = document.querySelector("#attendeesSection");
const attendeesList = document.querySelector("#attendeesList");
const attendeesError = document.querySelector("#attendeesError");
const fullNameInput = document.querySelector("#fullName");
const rutInput = document.querySelector("#rut");
const phoneInput = document.querySelector("#phone");
const payWithMercadoPagoButton = document.querySelector("#payWithMercadoPago");
const checkoutError = document.querySelector("#checkoutError");

const errors = {
  fullName: document.querySelector("#nameError"),
  rut: document.querySelector("#rutError"),
  phone: document.querySelector("#phoneError"),
};

function ticketIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3Z"></path>
      <path d="M9 5v14"></path>
    </svg>
  `;
}

function deadlineLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric" }).format(date);
  const time = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `Fecha límite: ${day}, hasta las ${time} HRS.`;
}

function availabilityLabel(ticket) {
  if (ticket.available) return `DISPONIBLES: ${ticket.remaining}`;
  if (ticket.unavailableReason === "deadline") return "NO DISPONIBLE";
  return "AGOTADA";
}

function renderTickets() {
  ticketList.innerHTML = tickets
    .map(
      (ticket) => `
        <article class="ticket-card ${ticket.available ? "" : "is-sold-out"}" data-ticket-id="${ticket.id}">
          <div class="ticket-art">${ticketIcon()}</div>
          <div class="ticket-info">
            <h2>${ticket.name}</h2>
            <strong class="ticket-price">${currencyFormatter.format(ticket.price)}</strong>
            <span class="ticket-limit">${availabilityLabel(ticket)}</span>
            ${ticket.saleEndAt ? `<span class="ticket-deadline">${deadlineLabel(ticket.saleEndAt)}</span>` : ""}
          </div>
          <div class="ticket-controls">
            <button class="qty-button decrease" type="button" aria-label="Quitar ${ticket.name}" data-action="decrease">-</button>
            <span class="quantity-pill" data-quantity>${quantities[ticket.id]}</span>
            <button class="qty-button increase" type="button" aria-label="Agregar ${ticket.name}" data-action="increase" ${ticket.available ? "" : "disabled"}>+</button>
          </div>
        </article>
      `,
    )
    .join("");
}

async function loadTickets() {
  ticketList.innerHTML = '<p class="loading-tickets">Cargando entradas disponibles...</p>';
  try {
    const response = await fetch(`${API_BASE_URL}/api/ticket-types`);
    const data = await response.json();
    if (!response.ok || !Array.isArray(data)) throw new Error("No se pudo cargar el catalogo.");
    tickets = data;
  } catch {
    tickets = fallbackTickets;
  }
  quantities = Object.fromEntries(tickets.map((ticket) => [ticket.id, 0]));
  renderTickets();
  updateTotals();
}

function selectedItems() {
  return tickets
    .map((ticket) => ({
      ...ticket,
      quantity: quantities[ticket.id],
      subtotal: quantities[ticket.id] * ticket.price,
    }))
    .filter((ticket) => ticket.quantity > 0);
}

function cartTotal() {
  return selectedItems().reduce((total, ticket) => total + ticket.subtotal, 0);
}

function selectedTicketUnits() {
  return selectedItems().flatMap((ticket) =>
    Array.from({ length: ticket.quantity }, (_, index) => ({
      id: `${ticket.id}-${index + 1}`,
      ticketName: ticket.name,
    })),
  );
}

function updateTotals() {
  const total = cartTotal();

  totalAmount.textContent = currencyFormatter.format(total);
  openBuyerFormButton.disabled = total === 0;

  tickets.forEach((ticket) => {
    const card = ticketList.querySelector(`[data-ticket-id="${ticket.id}"]`);
    if (!card) {
      return;
    }

    card.classList.toggle("is-selected", quantities[ticket.id] > 0);
    card.querySelector("[data-quantity]").textContent = quantities[ticket.id];
    card.querySelector('[data-action="decrease"]').disabled = quantities[ticket.id] === 0;
    card.querySelector('[data-action="increase"]').disabled = !ticket.available || quantities[ticket.id] >= Math.min(ticket.max, ticket.remaining);
  });
}

function renderOrderSummary() {
  const items = selectedItems();
  const itemLines = items
    .map(
      (item) => `
        <div class="summary-line">
          <span>${item.quantity} x ${item.name}</span>
          <strong>${currencyFormatter.format(item.subtotal)}</strong>
        </div>
      `,
    )
    .join("");

  orderSummary.innerHTML = `
    ${itemLines}
    <div class="summary-line total">
      <span>Total</span>
      <strong>${currencyFormatter.format(cartTotal())} CLP</strong>
    </div>
  `;
}

function renderAttendeeFields() {
  const additionalTickets = selectedTicketUnits().slice(1);

  attendeesSection.hidden = additionalTickets.length === 0;
  attendeesError.textContent = "";

  if (additionalTickets.length === 0) {
    attendeesList.innerHTML = "";
    return;
  }

  attendeesList.innerHTML = additionalTickets
    .map(
      (ticket, index) => `
        <label class="field attendee-field">
          <span class="attendee-ticket">${ticket.ticketName}</span>
          <input
            type="text"
            data-attendee-name
            data-ticket-name="${ticket.ticketName}"
            autocomplete="name"
            placeholder="Nombre de persona ${index + 2}"
            required
          />
        </label>
      `,
    )
    .join("");
}

function openBuyerModal() {
  renderOrderSummary();
  renderAttendeeFields();
  buyerModal.hidden = false;
  fullNameInput.focus();
}

function closeBuyerModal() {
  buyerModal.hidden = true;
}

function cleanRut(value) {
  return value.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
}

function formatRut(value) {
  const cleaned = cleanRut(value);

  if (cleaned.length < 2) {
    return cleaned;
  }

  const body = cleaned.slice(0, -1);
  const verifier = cleaned.slice(-1);

  return `${body}-${verifier}`;
}

function isValidRut(value) {
  const rut = cleanRut(value);
  const body = rut.slice(0, -1);
  const verifier = rut.slice(-1);

  if (!/^\d{7,8}[0-9K]$/.test(rut)) {
    return false;
  }

  let sum = 0;
  let multiplier = 2;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const expected = 11 - (sum % 11);
  const calculatedVerifier = expected === 11 ? "0" : expected === 10 ? "K" : String(expected);

  return calculatedVerifier === verifier;
}

function setError(input, errorElement, message) {
  input.classList.toggle("invalid", Boolean(message));
  errorElement.textContent = message;
}

function validateBuyerForm() {
  const fullName = fullNameInput.value.trim();
  const rut = rutInput.value.trim();
  const phone = phoneInput.value.replace(/\D/g, "");
  const attendeeInputs = [...attendeesList.querySelectorAll("[data-attendee-name]")];
  let isValid = true;

  if (fullName.split(/\s+/).length < 2) {
    setError(fullNameInput, errors.fullName, "Ingresa nombre y apellido.");
    isValid = false;
  } else {
    setError(fullNameInput, errors.fullName, "");
  }

  if (!isValidRut(rut)) {
    setError(rutInput, errors.rut, "Ingresa un RUT válido.");
    isValid = false;
  } else {
    setError(rutInput, errors.rut, "");
  }

  if (!/^9\d{8}$/.test(phone)) {
    setError(phoneInput, errors.phone, "Ingresa los 9 números. Ej: 912345678.");
    isValid = false;
  } else {
    setError(phoneInput, errors.phone, "");
  }

  const missingAttendees = attendeeInputs.filter((input) => input.value.trim().split(/\s+/).length < 2);
  attendeeInputs.forEach((input) => input.classList.toggle("invalid", missingAttendees.includes(input)));

  if (missingAttendees.length > 0) {
    attendeesError.textContent = "Ingresa nombre y apellido de cada persona adicional.";
    isValid = false;
  } else {
    attendeesError.textContent = "";
  }

  return isValid;
}

function ticketHolders() {
  const units = selectedTicketUnits();
  const attendeeInputs = [...attendeesList.querySelectorAll("[data-attendee-name]")];

  return units.map((unit, index) => {
    const name = index === 0 ? fullNameInput.value.trim() : attendeeInputs[index - 1]?.value.trim();
    return { ticketType: unit.ticketName, name };
  });
}

ticketList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const card = button.closest("[data-ticket-id]");
  const ticket = tickets.find((item) => item.id === card.dataset.ticketId);
  const action = button.dataset.action;

  if (action === "increase" && ticket.available && quantities[ticket.id] < Math.min(ticket.max, ticket.remaining)) {
    quantities[ticket.id] += 1;
  }

  if (action === "decrease" && quantities[ticket.id] > 0) {
    quantities[ticket.id] -= 1;
  }

  updateTotals();
});

goToTicketsButton.addEventListener("click", () => {
  ticketsSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

openBuyerFormButton.addEventListener("click", openBuyerModal);
closeBuyerFormButton.addEventListener("click", closeBuyerModal);

buyerModal.addEventListener("click", (event) => {
  if (event.target === buyerModal) {
    closeBuyerModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !buyerModal.hidden) {
    closeBuyerModal();
  }
});

rutInput.addEventListener("blur", () => {
  rutInput.value = formatRut(rutInput.value);
});

phoneInput.addEventListener("input", () => {
  phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 9);
});

buyerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  checkoutError.textContent = "";

  if (!validateBuyerForm()) {
    return;
  }

  const originalLabel = payWithMercadoPagoButton.textContent;
  payWithMercadoPagoButton.disabled = true;
  payWithMercadoPagoButton.textContent = "Preparando pago...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyer: {
          fullName: fullNameInput.value.trim(),
          rut: formatRut(rutInput.value),
          phone: phoneInput.value.replace(/\D/g, ""),
        },
        cart: selectedItems().map((item) => ({ id: item.id, quantity: item.quantity })),
        ticketHolders: ticketHolders(),
      }),
    });
    const result = await response.json();

    if (!response.ok || !result.checkoutUrl) {
      throw new Error(result.error || "No fue posible iniciar el pago.");
    }

    window.location.assign(result.checkoutUrl);
  } catch (error) {
    checkoutError.textContent = error.message || "No fue posible iniciar el pago. Intenta nuevamente.";
    payWithMercadoPagoButton.disabled = false;
    payWithMercadoPagoButton.textContent = originalLabel;
  }
});

loadTickets();
