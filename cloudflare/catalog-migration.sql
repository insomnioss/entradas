CREATE TABLE IF NOT EXISTS ticket_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  max_per_order INTEGER NOT NULL DEFAULT 50,
  active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO ticket_types (id, name, price, max_per_order, active, display_order) VALUES
  ('general', 'Entrada General', 8000, 50, 1, 1),
  ('cover1', 'Entrada + un cover', 10000, 50, 1, 2),
  ('cover2', 'Entrada + dos cover', 12000, 50, 1, 3);
