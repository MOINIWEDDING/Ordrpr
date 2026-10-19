-- Código ISO de la moneda principal (DOP, USD, EUR…). Con él se buscan cada día las tasas de
-- cambio de las otras monedas que acepta el restaurante (site_settings.extra_currencies, que
-- ahora guarda { code, name, symbol, position } sin tasa: la tasa ya no la escribe el dueño).
alter table public.site_settings add column if not exists currency_code text not null default 'DOP';
