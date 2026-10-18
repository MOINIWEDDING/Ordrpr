-- Estadísticas por día
-- Ejecuta este archivo una vez en Supabase → SQL Editor.
--
-- El panel de estadísticas ahora filtra pedidos y gift cards por día (columna created_at)
-- y suma lo vendido en tarjeta y en efectivo (columna payment_method). Esas columnas ya
-- existen, así que no hace falta crear ninguna nueva; estos índices hacen que la consulta
-- de un día sea rápida aunque el restaurante acumule muchos pedidos con el tiempo.

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists orders_branch_created_at_idx
  on public.orders (branch, created_at desc);

create index if not exists gift_cards_created_at_idx
  on public.gift_cards (created_at desc);
