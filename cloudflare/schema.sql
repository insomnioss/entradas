CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_rut TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  total INTEGER NOT NULL,
  preference_id TEXT,
  payment_id TEXT,
  payment_status TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  type TEXT NOT NULL,
  price INTEGER NOT NULL,
  holder_name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  checked_in_at TEXT,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON tickets(order_id);
