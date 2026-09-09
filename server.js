require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const QRCode = require("qrcode");

const app = express();
const port = Number(process.env.PORT || 8090);
const dataDirectory = path.join(__dirname, "data");
const ordersFile = path.join(dataDirectory, "orders.json");
const tickets = [
  { id: "general", name: "Entrada General", price: 8000, max: 50 },
  { id: "cover1", name: "Entrada + un cover", price: 10000, max: 50 },
  { id: "cover2", name: "Entrada + dos cover", price: 12000, max: 50 },
];

let writeQueue = Promise.resolve();

function ensureStore() {
  if (!fs.existsSync(dataDirectory)) fs.mkdirSync(dataDirectory, { recursive: true });
  if (!fs.existsSync(ordersFile)) fs.writeFileSync(ordersFile, JSON.stringify({ orders: {} }, null, 2));
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(ordersFile, "utf8"));
}

function updateStore(callback) {
  writeQueue = writeQueue.then(async () => {
    const store = readStore();
    const result = await callback(store);
    fs.writeFileSync(ordersFile, JSON.stringify(store, null, 2));
    return result;
  });
  return writeQueue;
}

function cleanRut(value) {
  return String(value || "").replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
}

function isValidRut(value) {
  const rut = cleanRut(value);
  if (!/^\d{7,8}[0-9K]$/.test(rut)) return false;
  const body = rut.slice(0, -1);
  const verifier = rut.slice(-1);
  let sum = 0;
  let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const expected = 11 - (sum % 11);
  const calculated = expected === 11 ? "0" : expected === 10 ? "K" : String(expected);
  return calculated === verifier;
}

function formatRut(value) {
  const clean = cleanRut(value);
  return clean.length > 1 ? `${clean.slice(0, -1)}-${clean.slice(-1)}` : clean;
}

function isFullName(value) {
  return typeof value === "string" && value.trim().split(/\s+/).filter(Boolean).length >= 2;
}

function baseUrl() {
  return String(process.env.APP_BASE_URL || `http://localhost:${port}`).replace(/\/$/, "");
}

function paymentApi(pathname, options = {}) {
  return fetch(`https://api.mercadopago.com${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

function normalizeCart(cart) {
  if (!Array.isArray(cart)) throw new Error("El carrito no es válido.");
  const entries = cart.map((entry) => {
    const ticket = tickets.find((item) => item.id === entry.id);
    const quantity = Number(entry.quantity);
    if (!ticket || !Number.isInteger(quantity) || quantity < 1 || quantity > ticket.max) {
      throw new Error("Hay una entrada o cantidad no válida.");
    }
    return { ...ticket, quantity };
  });
  if (entries.length === 0 || new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new Error("Selecciona al menos una entrada válida.");
  }
  return entries;
}

function publicOrder(order) {
  return {
    id: order.id,
    status: order.status,
    total: order.total,
    paymentStatus: order.payment?.status || null,
    tickets: order.status === "paid" ? order.tickets.map((ticket) => ({
      id: ticket.id,
      type: ticket.type,
      holderName: ticket.holderName,
      status: ticket.status,
      qrPayload: ticket.qrPayload,
    })) : [],
  };
}

async function syncPayment(payment) {
  const orderId = payment.external_reference;
  if (!orderId) return null;
  return updateStore((store) => {
    const order = store.orders[orderId];
    if (!order) return null;
    const matchesTotal = Number(payment.transaction_amount) === Number(order.total);
    order.payment = { id: String(payment.id), status: payment.status, statusDetail: payment.status_detail, updatedAt: new Date().toISOString() };
    if (payment.status === "approved" && matchesTotal) {
      order.status = "paid";
      order.paidAt = order.paidAt || new Date().toISOString();
      order.tickets.forEach((ticket) => { if (ticket.status === "pending") ticket.status = "active"; });
    } else if (["rejected", "cancelled"].includes(payment.status)) {
      order.status = "failed";
    }
    return order;
  });
}

async function getPayment(paymentId) {
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) return null;
  const response = await paymentApi(`/v1/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
  if (!response.ok) throw new Error("No se pudo verificar el pago con Mercado Pago.");
  return response.json();
}

app.use(express.json({ limit: "100kb" }));

app.post("/api/checkout", async (req, res) => {
  try {
    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
      return res.status(503).json({ error: "Mercado Pago aún no está configurado. Agrega MERCADOPAGO_ACCESS_TOKEN al archivo .env." });
    }

    const buyer = req.body?.buyer || {};
    const cart = normalizeCart(req.body?.cart);
    const holderNames = Array.isArray(req.body?.ticketHolders) ? req.body.ticketHolders.map((holder) => holder?.name?.trim()) : [];
    const units = cart.flatMap((ticket) => Array.from({ length: ticket.quantity }, () => ticket));
    const phone = String(buyer.phone || "").replace(/\D/g, "");

    if (!isFullName(buyer.fullName) || !isValidRut(buyer.rut) || !/^9\d{8}$/.test(phone)) {
      return res.status(400).json({ error: "Revisa el nombre, RUT y teléfono del comprador." });
    }
    if (holderNames.length !== units.length || holderNames.some((name) => !isFullName(name))) {
      return res.status(400).json({ error: "Completa el nombre y apellido de cada persona asistente." });
    }

    const order = {
      id: crypto.randomUUID(),
      status: "pending",
      createdAt: new Date().toISOString(),
      buyer: { fullName: buyer.fullName.trim(), rut: formatRut(buyer.rut), phone: `+56${phone}` },
      items: cart.map(({ id, name, price, quantity }) => ({ id, name, price, quantity })),
      total: cart.reduce((sum, ticket) => sum + ticket.price * ticket.quantity, 0),
      tickets: units.map((ticket, index) => {
        const id = crypto.randomUUID();
        const token = crypto.randomBytes(24).toString("base64url");
        return { id, type: ticket.name, price: ticket.price, holderName: holderNames[index], token, qrPayload: `INSOMNIO:${id}:${token}`, status: "pending" };
      }),
    };

    const appBaseUrl = baseUrl();
    const preference = {
      items: order.items.map((item) => ({ id: item.id, title: item.name, quantity: item.quantity, unit_price: item.price, currency_id: "CLP" })),
      payer: { name: order.buyer.fullName, phone: { area_code: "56", number: phone }, identification: { type: "RUT", number: cleanRut(order.buyer.rut).slice(0, -1) } },
      external_reference: order.id,
      back_urls: {
        success: `${appBaseUrl}/success.html?order_id=${order.id}`,
        failure: `${appBaseUrl}/success.html?order_id=${order.id}`,
        pending: `${appBaseUrl}/success.html?order_id=${order.id}`,
      },
      auto_return: "approved",
      notification_url: process.env.MERCADOPAGO_WEBHOOK_URL || `${appBaseUrl}/api/mercadopago/webhook`,
      metadata: { order_id: order.id },
    };

    const response = await paymentApi("/checkout/preferences", { method: "POST", body: JSON.stringify(preference) });
    const payload = await response.json();
    if (!response.ok) {
      console.error("Mercado Pago preference error:", payload);
      return res.status(502).json({ error: "Mercado Pago no pudo preparar el pago. Intenta nuevamente." });
    }

    order.preferenceId = payload.id;
    await updateStore((store) => { store.orders[order.id] = order; });
    const checkoutUrl = process.env.MERCADOPAGO_USE_SANDBOX === "true" ? payload.sandbox_init_point : payload.init_point;
    return res.status(201).json({ checkoutUrl, orderId: order.id });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ error: error.message || "No fue posible iniciar el pago." });
  }
});

app.post("/api/mercadopago/webhook", async (req, res) => {
  res.sendStatus(200);
  const paymentId = req.body?.data?.id || req.query["data.id"] || req.query.id;
  const type = req.body?.type || req.query.type || req.query.topic;
  if (!paymentId || (type && type !== "payment")) return;
  try {
    const payment = await getPayment(paymentId);
    if (payment) await syncPayment(payment);
  } catch (error) {
    console.error("Mercado Pago webhook error:", error.message);
  }
});

app.get("/api/orders/:orderId", async (req, res) => {
  try {
    const paymentId = req.query.payment_id || req.query.collection_id;
    if (paymentId) {
      const payment = await getPayment(paymentId);
      if (payment?.external_reference === req.params.orderId) await syncPayment(payment);
    }
    const store = readStore();
    const order = store.orders[req.params.orderId];
    if (!order) return res.status(404).json({ error: "No encontramos esta orden." });
    const result = publicOrder(order);
    if (result.status === "paid") {
      result.tickets = await Promise.all(result.tickets.map(async (ticket) => ({
        ...ticket,
        qrImage: await QRCode.toDataURL(ticket.qrPayload, { width: 360, margin: 1, color: { dark: "#101215", light: "#ffffff" } }),
      })));
    }
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || "No fue posible consultar la orden." });
  }
});

app.post("/api/checkin/validate", async (req, res) => {
  if (!process.env.CHECKIN_SECRET || req.get("x-checkin-key") !== process.env.CHECKIN_SECRET) {
    return res.status(401).json({ error: "Clave de validación inválida." });
  }
  const match = /^INSOMNIO:([\w-]+):([\w-]+)$/.exec(String(req.body?.code || "").trim());
  if (!match) return res.status(400).json({ error: "Este QR no corresponde a una entrada INSOMNIO." });
  const [, ticketId, token] = match;
  const result = await updateStore((store) => {
    const order = Object.values(store.orders).find((item) => item.tickets.some((ticket) => ticket.id === ticketId));
    const ticket = order?.tickets.find((item) => item.id === ticketId);
    if (!ticket || ticket.token !== token || order.status !== "paid") return { status: "invalid" };
    if (ticket.status === "used") return { status: "used", ticket };
    if (ticket.status !== "active") return { status: "invalid" };
    ticket.status = "used";
    ticket.checkedInAt = new Date().toISOString();
    return { status: "approved", ticket };
  });
  if (result.status === "invalid") return res.status(400).json({ error: "Entrada inválida o no pagada." });
  return res.json(result);
});

app.get("/api/checkin/stats", (req, res) => {
  if (!process.env.CHECKIN_SECRET || req.get("x-checkin-key") !== process.env.CHECKIN_SECRET) {
    return res.status(401).json({ error: "Clave de validación inválida." });
  }
  const store = readStore();
  const validated = Object.values(store.orders).flatMap((order) => order.tickets).filter((ticket) => ticket.status === "used").length;
  return res.json({ validated });
});

app.use(express.static(__dirname, { extensions: ["html"] }));

ensureStore();
app.listen(port, () => console.log(`INSOMNIO listo en http://localhost:${port}`));
