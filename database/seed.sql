-- Dados de exemplo equivalentes ao seed automatico executado pelo backend.
-- O seed real usa bcrypt para criar senhas seguras em runtime.
-- Login demo:
-- admin@lanchonete.local / admin123
-- caixa@lanchonete.local / caixa123

INSERT OR IGNORE INTO products
  (name, category, cost_price, sale_price, stock_quantity, min_stock, supplier, internal_code, unit)
VALUES
  ('X-Burger', 'Lanches', 8.50, 18.90, 32, 10, 'Cozinha interna', 'LAN-001', 'unidade'),
  ('Coca-Cola 350ml', 'Bebidas', 3.80, 7.50, 72, 24, 'Distribuidora Nova', 'BEB-001', 'lata'),
  ('Batata frita', 'Porcoes', 4.20, 12.00, 28, 12, 'Cozinha interna', 'POR-001', 'porcao'),
  ('Molho cheddar', 'Insumos', 18.00, 0.00, 6, 4, 'Laticinios Sul', 'INS-001', 'kg');
