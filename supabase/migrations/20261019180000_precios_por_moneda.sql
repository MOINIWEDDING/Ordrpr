-- Precio especial de un producto según la moneda con que se paga.
-- { "USD": 350 } = si el cliente paga en dólares, el producto se cobra como RD$350 (convertido a
-- dólares con la tasa del día) en vez de su precio normal. Los montos van en la moneda principal.
alter table public.menu_items add column if not exists currency_prices jsonb not null default '{}'::jsonb;
