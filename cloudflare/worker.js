const TICKETS = [
  { id: "general", name: "Entrada General", price: 8000, max: 50 },
  { id: "cover1", name: "Entrada + un cover", price: 10000, max: 50 },
  { id: "cover2", name: "Entrada + dos cover", price: 12000, max: 50 },
];

function cors(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": allowed === "*" ? "*" : origin === allowed ? origin : allowed,
    "Access-Control-Allow-Headers": "Content-Type, x-checkin-key, x-admin-key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(data, request, env, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors(request, env) } });
}

function cleanRut(value) {
  return String(value || "").replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
}

function validRut(value) {
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
  const rut = cleanRut(value);
  return `${rut.slice(0, -1)}-${rut.slice(-1)}`;
}

function fullName(value) {
  return typeof value === "string" && value.trim().split(/\s+/).filter(Boolean).length >= 2;
}

function normalizeCart(cart, catalog) {
  if (!Array.isArray(cart)) throw new Error("El carrito no es válido.");
  const items = cart.map((entry) => {
    const ticket = catalog.find((item) => item.id === entry.id);
    const quantity = Number(entry.quantity);
    if (!ticket || !Number.isInteger(quantity) || quantity < 1 || quantity > ticket.max) throw new Error("Hay una entrada o cantidad no válida.");
    return { ...ticket, quantity };
  });
  if (!items.length || new Set(items.map((item) => item.id)).size !== items.length) throw new Error("Selecciona al menos una entrada válida.");
  return items;
}

async function getCatalog(env, includeInactive = false) {
  const query = includeInactive
    ? "SELECT id, name, price, max_per_order AS max, active, display_order FROM ticket_types ORDER BY display_order"
    : "SELECT id, name, price, max_per_order AS max FROM ticket_types WHERE active = 1 ORDER BY display_order";
  try {
    const result = await env.DB.prepare(query).all();
    return result.results;
  } catch (error) {
    if (!String(error.message).includes("ticket_types")) throw error;
    return TICKETS.map((ticket, index) => ({ ...ticket, max: ticket.max, active: 1, display_order: index + 1 }));
  }
}

function isAdmin(request, env) {
  return Boolean(env.ADMIN_SECRET) && request.headers.get("x-admin-key") === env.ADMIN_SECRET;
}

async function mpFetch(env, path, options = {}) {
  return fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

async function applyPayment(env, payment) {
  const orderId = payment.external_reference;
  if (!orderId) return;
  const order = await env.DB.prepare("SELECT id, total FROM orders WHERE id = ?").bind(orderId).first();
  if (!order) return;
  const paid = payment.status === "approved" && Number(payment.transaction_amount) === Number(order.total);
  const status = paid ? "paid" : ["rejected", "cancelled"].includes(payment.status) ? "failed" : "pending";
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = ?, payment_id = ?, payment_status = ?, paid_at = CASE WHEN ? = 'paid' THEN COALESCE(paid_at, ?) ELSE paid_at END WHERE id = ?").bind(status, String(payment.id), payment.status, status, new Date().toISOString(), orderId),
    env.DB.prepare("UPDATE tickets SET status = 'active' WHERE order_id = ? AND status = 'pending'").bind(orderId),
  ]);
}

async function checkout(request, env) {
  if (!env.MERCADOPAGO_ACCESS_TOKEN || !env.SITE_URL) return json({ error: "El pago aún no está configurado." }, request, env, 503);
  const body = await request.json();
  const buyer = body?.buyer || {};
  const phone = String(buyer.phone || "").replace(/\D/g, "");
  const cart = normalizeCart(body?.cart, await getCatalog(env));
  const units = cart.flatMap((item) => Array.from({ length: item.quantity }, () => item));
  const holders = Array.isArray(body?.ticketHolders) ? body.ticketHolders.map((holder) => holder?.name?.trim()) : [];
  if (!fullName(buyer.fullName) || !validRut(buyer.rut) || !/^9\d{8}$/.test(phone)) return json({ error: "Revisa el nombre, RUT y teléfono del comprador." }, request, env, 400);
  if (holders.length !== units.length || holders.some((name) => !fullName(name))) return json({ error: "Completa el nombre y apellido de cada persona asistente." }, request, env, 400);

  const orderId = crypto.randomUUID();
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const now = new Date().toISOString();
  const ticketRows = units.map((item, index) => ({ id: crypto.randomUUID(), orderId, type: item.name, price: item.price, holderName: holders[index], token: crypto.randomUUID().replace(/-/g, ""), status: "pending" }));
  const siteUrl = env.SITE_URL.replace(/\/$/, "");
  const preference = {
    items: cart.map((item) => ({ id: item.id, title: item.name, quantity: item.quantity, unit_price: item.price, currency_id: "CLP" })),
    external_reference: orderId,
    back_urls: { success: `${siteUrl}/success.html?order_id=${orderId}`, pending: `${siteUrl}/success.html?order_id=${orderId}`, failure: `${siteUrl}/success.html?order_id=${orderId}` },
    auto_return: "approved",
    notification_url: `${new URL(request.url).origin}/api/mercadopago/webhook`,
  };
  const mpResponse = await mpFetch(env, "/checkout/preferences", { method: "POST", body: JSON.stringify(preference) });
  const mp = await mpResponse.json();
  if (!mpResponse.ok) return json({ error: "Mercado Pago no pudo preparar el pago." }, request, env, 502);

  await env.DB.batch([
    env.DB.prepare("INSERT INTO orders (id, status, buyer_name, buyer_rut, buyer_phone, total, preference_id, created_at) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?)").bind(orderId, buyer.fullName.trim(), formatRut(buyer.rut), `+56${phone}`, total, mp.id, now),
    ...ticketRows.map((ticket) => env.DB.prepare("INSERT INTO tickets (id, order_id, type, price, holder_name, token, status) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(ticket.id, ticket.orderId, ticket.type, ticket.price, ticket.holderName, ticket.token, ticket.status)),
  ]);
  return json({ checkoutUrl: env.MERCADOPAGO_USE_SANDBOX === "true" ? mp.sandbox_init_point : mp.init_point }, request, env, 201);
}

async function orderStatus(request, env, orderId) {
  const url = new URL(request.url);
  const paymentId = url.searchParams.get("payment_id") || url.searchParams.get("collection_id");
  if (paymentId && env.MERCADOPAGO_ACCESS_TOKEN) {
    const response = await mpFetch(env, `/v1/payments/${encodeURIComponent(paymentId)}`);
    if (response.ok) await applyPayment(env, await response.json());
  }
  const order = await env.DB.prepare("SELECT id, status, total, payment_status FROM orders WHERE id = ?").bind(orderId).first();
  if (!order) return json({ error: "No encontramos esta orden." }, request, env, 404);
  const tickets = order.status === "paid" ? await env.DB.prepare("SELECT id, type, holder_name AS holderName, token, status FROM tickets WHERE order_id = ?").bind(orderId).all() : { results: [] };
  return json({ ...order, tickets: tickets.results.map((ticket) => ({ ...ticket, qrPayload: `INSOMNIO:${ticket.id}:${ticket.token}` })) }, request, env);
}

async function validate(request, env) {
  if (!env.CHECKIN_SECRET || request.headers.get("x-checkin-key") !== env.CHECKIN_SECRET) return json({ error: "Clave de validación inválida." }, request, env, 401);
  const { code } = await request.json();
  const match = /^INSOMNIO:([\w-]+):([\w-]+)$/.exec(String(code || "").trim());
  if (!match) return json({ error: "Este QR no corresponde a una entrada INSOMNIO." }, request, env, 400);
  const [, id, token] = match;
  const ticket = await env.DB.prepare("SELECT t.id, t.type, t.holder_name AS holderName, t.token, t.status, o.status AS orderStatus FROM tickets t JOIN orders o ON o.id = t.order_id WHERE t.id = ?").bind(id).first();
  if (!ticket || ticket.token !== token || ticket.orderStatus !== "paid") return json({ error: "Entrada inválida o no pagada." }, request, env, 400);
  if (ticket.status === "used") return json({ status: "used", ticket }, request, env);
  const update = await env.DB.prepare("UPDATE tickets SET status = 'used', checked_in_at = ? WHERE id = ? AND status = 'active'").bind(new Date().toISOString(), id).run();
  if (!update.meta.changes) return json({ error: "La entrada no está disponible." }, request, env, 400);
  return json({ status: "approved", ticket }, request, env);
}

async function checkinStats(request, env) {
  if (!env.CHECKIN_SECRET || request.headers.get("x-checkin-key") !== env.CHECKIN_SECRET) return json({ error: "Clave de validacion invalida." }, request, env, 401);
  const row = await env.DB.prepare("SELECT COUNT(*) AS validated FROM tickets WHERE status = 'used'").first();
  return json({ validated: Number(row.validated || 0) }, request, env);
}

async function adminCatalog(request, env) {
  if (!isAdmin(request, env)) return json({ error: "Clave de administracion invalida." }, request, env, 401);
  return json(await getCatalog(env, true), request, env);
}

async function updateTicketType(request, env, id) {
  if (!isAdmin(request, env)) return json({ error: "Clave de administracion invalida." }, request, env, 401);
  const current = await env.DB.prepare("SELECT id FROM ticket_types WHERE id = ?").bind(id).first();
  if (!current) return json({ error: "Tipo de entrada no encontrado." }, request, env, 404);
  const body = await request.json();
  const name = String(body.name || "").trim();
  const price = Number(body.price);
  const max = Number(body.max);
  const active = body.active ? 1 : 0;
  if (!name || !Number.isInteger(price) || price < 0 || !Number.isInteger(max) || max < 1 || max > 500) {
    return json({ error: "Revisa el nombre, precio y maximo por compra." }, request, env, 400);
  }
  await env.DB.prepare("UPDATE ticket_types SET name = ?, price = ?, max_per_order = ?, active = ? WHERE id = ?")
    .bind(name, price, max, active, id).run();
  return json({ ok: true }, request, env);
}

async function createTicketType(request, env) {
  if (!isAdmin(request, env)) return json({ error: "Clave de administracion invalida." }, request, env, 401);
  const body = await request.json();
  const name = String(body.name || "").trim();
  const price = Number(body.price);
  const max = Number(body.max);
  if (!name || !Number.isInteger(price) || price < 0 || !Number.isInteger(max) || max < 1 || max > 500) {
    return json({ error: "Revisa el nombre, precio y maximo por compra." }, request, env, 400);
  }
  const last = await env.DB.prepare("SELECT COALESCE(MAX(display_order), 0) AS current FROM ticket_types").first();
  const id = `ticket-${crypto.randomUUID().slice(0, 8)}`;
  await env.DB.prepare("INSERT INTO ticket_types (id, name, price, max_per_order, active, display_order) VALUES (?, ?, ?, ?, 1, ?)")
    .bind(id, name, price, max, Number(last.current || 0) + 1).run();
  return json({ ok: true, id }, request, env, 201);
}

async function removeTicketType(request, env, id) {
  if (!isAdmin(request, env)) return json({ error: "Clave de administracion invalida." }, request, env, 401);
  const updated = await env.DB.prepare("UPDATE ticket_types SET active = 0 WHERE id = ?").bind(id).run();
  if (!updated.meta.changes) return json({ error: "Tipo de entrada no encontrado." }, request, env, 404);
  return json({ ok: true }, request, env);
}

async function adminSales(request, env) {
  if (!isAdmin(request, env)) return json({ error: "Clave de administracion invalida." }, request, env, 401);
  const sales = await env.DB.prepare(`SELECT
      t.id AS ticket_id, t.type, t.price, t.holder_name, t.status AS ticket_status, t.checked_in_at,
      o.id AS order_id, o.buyer_name, o.status AS order_status, o.created_at, o.paid_at
    FROM tickets t JOIN orders o ON o.id = t.order_id
    ORDER BY o.created_at DESC, t.holder_name ASC`).all();
  const summary = await env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN o.status = 'paid' THEN 1 ELSE 0 END), 0) AS tickets,
      COALESCE(SUM(CASE WHEN o.status = 'paid' THEN t.price ELSE 0 END), 0) AS revenue
    FROM tickets t JOIN orders o ON o.id = t.order_id`).first();
  return json({ sales: sales.results, summary: { tickets: Number(summary.tickets || 0), revenue: Number(summary.revenue || 0) } }, request, env);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(request, env) });
    const path = new URL(request.url).pathname;
    try {
      if (path === "/api/checkout" && request.method === "POST") return checkout(request, env);
      if (path === "/api/ticket-types" && request.method === "GET") return json(await getCatalog(env), request, env);
      if (path === "/api/mercadopago/webhook" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const paymentId = body?.data?.id || new URL(request.url).searchParams.get("data.id");
        if (paymentId && env.MERCADOPAGO_ACCESS_TOKEN) {
          const response = await mpFetch(env, `/v1/payments/${encodeURIComponent(paymentId)}`);
          if (response.ok) await applyPayment(env, await response.json());
        }
        return json({ received: true }, request, env);
      }
      const orderMatch = /^\/api\/orders\/([\w-]+)$/.exec(path);
      if (orderMatch && request.method === "GET") return orderStatus(request, env, orderMatch[1]);
      if (path === "/api/checkin/stats" && request.method === "GET") return checkinStats(request, env);
      if (path === "/api/checkin/validate" && request.method === "POST") return validate(request, env);
      if (path === "/api/admin/ticket-types" && request.method === "GET") return adminCatalog(request, env);
      if (path === "/api/admin/ticket-types" && request.method === "POST") return createTicketType(request, env);
      const ticketTypeMatch = /^\/api\/admin\/ticket-types\/([\w-]+)$/.exec(path);
      if (ticketTypeMatch && request.method === "PUT") return updateTicketType(request, env, ticketTypeMatch[1]);
      if (ticketTypeMatch && request.method === "DELETE") return removeTicketType(request, env, ticketTypeMatch[1]);
      if (path === "/api/admin/sales" && request.method === "GET") return adminSales(request, env);
      return json({ error: "Ruta no encontrada." }, request, env, 404);
    } catch (error) {
      return json({ error: error.message || "Error interno." }, request, env, 500);
    }
  },
};
