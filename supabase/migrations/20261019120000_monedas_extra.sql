-- Otras monedas para pagar.
--
-- site_settings.extra_currencies: las monedas que el dueño agrega además de la principal,
--   [{ "name": "Dólar", "symbol": "US$", "position": "before", "rate": 60 }]
--   rate = cuántas unidades de la moneda principal vale 1 unidad de esta.
-- orders.payment_currency: la moneda que eligió el cliente al pagar, con el tipo de cambio y el
--   total ya convertido. Vacío cuando paga en la moneda principal. Los montos del pedido
--   (subtotal, tax_amount) siguen siempre en la moneda principal.

alter table public.site_settings add column if not exists extra_currencies jsonb not null default '[]'::jsonb;
alter table public.orders add column if not exists payment_currency jsonb;
