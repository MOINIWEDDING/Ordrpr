-- Precio propio de un producto en otra moneda.
-- { "USD": 6 } = si el cliente paga en dólares, el producto cuesta US$6 en vez de su precio normal
-- convertido con la tasa del día. Cada monto va en la moneda de su código.
alter table public.menu_items add column if not exists currency_prices jsonb not null default '{}'::jsonb;
