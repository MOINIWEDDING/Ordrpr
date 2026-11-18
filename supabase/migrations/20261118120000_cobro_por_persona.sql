-- Cada quien paga su parte de la cuenta desde su teléfono, y al cobrar una cuenta sus pedidos quedan servidos.
-- (Va aparte del punto de venta porque esa migración ya se aplicó en los restaurantes.)

-- ---------- Pagos por persona ----------
-- Cada persona de la mesa paga su parte desde su teléfono. Hoy: gift card (se descuenta al instante) o aviso
-- de efectivo/tarjeta que el camarero o la caja confirman. Mañana: pasarela en línea (method 'en_linea'),
-- que queda 'pending' hasta que el aviso de la pasarela llame a tab_payment_settle; `gateway` guarda su referencia.
create table if not exists public.tab_payments (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs(id) on delete cascade,
  person text not null default '' check (length(person) <= 60),
  order_ids uuid[] not null default '{}',
  subtotal numeric not null default 0,
  tax_lines jsonb not null default '[]'::jsonb,
  tax_total numeric not null default 0,
  tip numeric not null default 0,
  amount numeric not null default 0,
  method text not null check (method in ('efectivo', 'tarjeta', 'transferencia', 'gift_card', 'en_linea')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  fiscal jsonb not null default '{}'::jsonb,
  gateway jsonb not null default '{}'::jsonb,
  user_id uuid references auth.users(id) on delete set null,
  invoice_id uuid,
  settled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists tab_payments_tab_idx on public.tab_payments (tab_id);
-- el pedido ya pagado por su dueño: la caja ya no lo cobra
alter table public.orders add column if not exists tab_payment_id uuid references public.tab_payments(id) on delete set null;

-- una cuenta puede tener varias facturas: la de cada persona que pagó su parte y la del resto
alter table public.invoices drop constraint if exists invoices_tab_id_key;
create index if not exists invoices_tab_idx on public.invoices (tab_id) where tab_id is not null;

create or replace function public.tab_json(t public.tabs, with_code boolean)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', t.id, 'number', t.number, 'branch', t.branch, 'table_id', t.table_id, 'table_label', t.table_label,
    'status', t.status, 'opened_name', t.opened_name, 'guests', t.guests, 'waiter_id', t.waiter_id,
    'waiter_name', (select name from public.profiles where id = t.waiter_id),
    'call_waiter_at', t.call_waiter_at, 'bill_requested_at', t.bill_requested_at,
    'created_at', t.created_at, 'closed_at', t.closed_at, 'invoice_id', t.invoice_id,
    'code', case when with_code then t.code end,
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'customer_name', o.customer_name, 'items', o.items, 'subtotal', o.subtotal, 'tax_amount', o.tax_amount,
        'status', o.status, 'station_status', o.station_status, 'created_at', o.created_at, 'waiter_id', o.waiter_id,
        'paid', o.tab_payment_id is not null
      ) order by o.created_at)
      from public.orders o where o.tab_id = t.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'person', p.person, 'amount', p.amount, 'subtotal', p.subtotal, 'tax_lines', p.tax_lines, 'tip', p.tip,
        'method', p.method, 'status', p.status, 'invoice_id', p.invoice_id, 'created_at', p.created_at, 'paid_at', p.paid_at
      ) order by p.created_at)
      from public.tab_payments p where p.tab_id = t.id and p.status <> 'cancelled'
    ), '[]'::jsonb)
  );
$function$;

-- Cobrar y cerrar: crea la factura con todo lo que se pidió en la cuenta.
-- Cierra la cuenta cuando ya está todo pagado: todo lo de la cuenta queda servido aunque cocina no lo haya marcado.
create or replace function public.tab_finish(tab_input uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.tabs set status = 'closed', closed_at = now(), closed_by = coalesce(auth.uid(), closed_by),
    call_waiter_at = null, updated_at = now()
  where id = tab_input and status in ('open', 'bill');
  update public.orders set status = 'entregada' where tab_id = tab_input and status <> 'entregada';
end;
$function$;

create or replace function public.tab_close(tab_input uuid, payments_input jsonb, tip_input numeric, discount_input numeric, fiscal_input jsonb, name_input text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
  gross numeric;
  net numeric;
  tax_lines jsonb;
  tax numeric;
  total numeric;
  paid numeric;
  items jsonb;
  methods text[];
  inv uuid;
  disc numeric := greatest(0, coalesce(discount_input, 0));
  tip numeric := greatest(0, coalesce(tip_input, 0));
begin
  if not public.is_pos_staff() then raise exception 'no autorizado'; end if;
  select * into t from public.tabs where id = tab_input for update;
  if not found then raise exception 'Cuenta no encontrada'; end if;
  if t.status not in ('open', 'bill') then raise exception 'Esta cuenta ya está cerrada'; end if;
  if not exists (select 1 from public.orders where tab_id = t.id) then raise exception 'La cuenta no tiene pedidos'; end if;
  -- los avisos de pago que nadie confirmó se descartan: la caja cobra todo lo que falta
  update public.tab_payments set status = 'cancelled' where tab_id = t.id and status = 'pending';
  if not exists (select 1 from public.orders where tab_id = t.id and tab_payment_id is null) then
    perform public.tab_finish(t.id);
    return null;
  end if;

  select coalesce(sum(subtotal), 0) into gross from public.orders where tab_id = t.id and tab_payment_id is null;
  if disc > gross then raise exception 'El descuento es mayor que el consumo'; end if;
  net := gross - disc;
  tax_lines := public.invoice_tax_lines(t.branch, net, null);
  select coalesce(sum((l->>'amount')::numeric), 0) into tax from jsonb_array_elements(tax_lines) l;
  total := net + tax + tip;

  if jsonb_typeof(coalesce(payments_input, '[]'::jsonb)) <> 'array' or jsonb_array_length(payments_input) = 0 then raise exception 'Falta el pago'; end if;
  select coalesce(sum((p->>'amount')::numeric), 0), array_agg(distinct p->>'method') into paid, methods from jsonb_array_elements(payments_input) p;
  if paid + 0.5 < total then raise exception 'El pago (%) no cubre el total (%)', paid, total; end if;

  select coalesce(jsonb_agg(it || jsonb_build_object('person', o.customer_name) order by o.created_at), '[]'::jsonb) into items
  from public.orders o, jsonb_array_elements(o.items) it where o.tab_id = t.id and o.tab_payment_id is null;

  insert into public.invoices (kind, tab_id, branch, table_label, user_id, customer_name, fiscal, items, subtotal, discount,
    tax_lines, tax_total, tip, total, payments, waiter_id, cashier_id, business)
  values ('tab', t.id, t.branch, t.table_label, t.opened_by,
    left(coalesce(nullif(btrim(name_input), ''), t.opened_name), 80),
    coalesce(fiscal_input, '{}'::jsonb), items, gross, disc, tax_lines, tax, tip, total, payments_input,
    t.waiter_id, auth.uid(), coalesce(public.invoice_business(), '{}'::jsonb))
  returning id into inv;

  update public.orders set payment_method = case when array_length(methods, 1) = 1 then methods[1] else 'mixto' end
  where tab_id = t.id and tab_payment_id is null;
  update public.tabs set invoice_id = inv where id = t.id;
  perform public.tab_finish(t.id);
  return inv;
end;
$function$;

-- ---------- Cada quien paga su parte ----------
-- Registra el pago como hecho: factura de esa persona, sus pedidos quedan pagados y, si ya no falta nada, la
-- cuenta se cierra. No se da a los clientes: la llaman tab_pay_part (gift card), tab_payment_confirm (personal)
-- y, cuando haya pasarela, su aviso de pago desde el servidor (service_role) con method 'en_linea'.
create or replace function public.tab_payment_settle(payment_input uuid, method_input text, gateway_input jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p public.tab_payments;
  t public.tabs;
  m text;
  items jsonb;
  inv uuid;
begin
  select * into p from public.tab_payments where id = payment_input for update;
  if not found or p.status <> 'pending' then raise exception 'Ese pago ya no está pendiente'; end if;
  select * into t from public.tabs where id = p.tab_id for update;
  if exists (select 1 from public.orders where id = any(p.order_ids) and tab_payment_id is not null) then
    update public.tab_payments set status = 'cancelled' where id = p.id;
    raise exception 'Parte de esos pedidos ya se cobró';
  end if;
  m := coalesce(nullif(method_input, ''), p.method);
  if m not in ('efectivo', 'tarjeta', 'transferencia', 'gift_card', 'en_linea') then raise exception 'Forma de pago no válida'; end if;

  select coalesce(jsonb_agg(it || jsonb_build_object('person', o.customer_name) order by o.created_at), '[]'::jsonb) into items
  from public.orders o, jsonb_array_elements(o.items) it where o.id = any(p.order_ids);

  insert into public.invoices (kind, tab_id, branch, table_label, user_id, customer_name, fiscal, items, subtotal, discount,
    tax_lines, tax_total, tip, total, payments, waiter_id, cashier_id, business)
  values ('tab', t.id, t.branch, t.table_label, p.user_id, p.person, p.fiscal, items, p.subtotal, 0,
    p.tax_lines, p.tax_total, p.tip, p.amount, jsonb_build_array(jsonb_build_object('method', m, 'amount', p.amount)),
    t.waiter_id, auth.uid(), coalesce(public.invoice_business(), '{}'::jsonb))
  returning id into inv;

  update public.tab_payments set status = 'paid', method = m, paid_at = now(), invoice_id = inv, settled_by = auth.uid(),
    gateway = case when gateway_input is null then gateway else gateway || gateway_input end
  where id = p.id;
  update public.orders set tab_payment_id = p.id, payment_method = m where id = any(p.order_ids);
  update public.tabs set updated_at = now() where id = t.id;
  if not exists (select 1 from public.orders where tab_id = t.id and tab_payment_id is null) then
    perform public.tab_finish(t.id);
  end if;
  return inv;
end;
$function$;

-- El cliente paga lo suyo: sus pedidos que aún no se pagaron. Con gift card queda pagado al momento; con
-- efectivo, tarjeta o transferencia queda como aviso para que el camarero o la caja lo cobren y confirmen.
create or replace function public.tab_pay_part(tab_input uuid, code_input text, person_input text, method_input text, tip_input numeric, fiscal_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
  who text := left(btrim(coalesce(person_input, '')), 60);
  ids uuid[];
  gross numeric;
  tlines jsonb;
  tax numeric;
  tip numeric := round(greatest(0, coalesce(tip_input, 0)));
  pid uuid;
  inv uuid;
begin
  select * into t from public.tabs where id = tab_input for update;
  if not found or not public.tab_can_access(t, code_input) then raise exception 'Cuenta no encontrada'; end if;
  if t.status not in ('open', 'bill') then raise exception 'Esta cuenta ya está cerrada'; end if;
  if method_input not in ('efectivo', 'tarjeta', 'transferencia', 'gift_card') then raise exception 'Forma de pago no válida'; end if;
  if method_input = 'gift_card' and auth.uid() is null then raise exception 'Debes iniciar sesión para pagar con gift card.'; end if;

  -- si ya había avisado, el aviso nuevo reemplaza al anterior
  update public.tab_payments set status = 'cancelled' where tab_id = t.id and person = who and status = 'pending';

  select coalesce(array_agg(o.id order by o.created_at), '{}'), coalesce(sum(o.subtotal), 0) into ids, gross
  from public.orders o
  where o.tab_id = t.id and o.customer_name = who and o.tab_payment_id is null
    and not exists (select 1 from public.tab_payments x where x.tab_id = t.id and x.status = 'pending' and o.id = any(x.order_ids));
  if gross <= 0 then raise exception 'No hay nada pendiente a nombre de %', who; end if;
  if tip > gross then raise exception 'La propina no puede ser mayor que el consumo'; end if;
  tlines := public.invoice_tax_lines(t.branch, gross, null);
  select coalesce(sum((l->>'amount')::numeric), 0) into tax from jsonb_array_elements(tlines) l;

  insert into public.tab_payments (tab_id, person, order_ids, subtotal, tax_lines, tax_total, tip, amount, method, fiscal, user_id)
  values (t.id, who, ids, gross, tlines, tax, tip, gross + tax + tip, method_input, coalesce(fiscal_input, '{}'::jsonb), auth.uid())
  returning id into pid;
  update public.tabs set updated_at = now() where id = t.id;

  if method_input = 'gift_card' then
    perform public.pay_with_gift_card(gross + tax + tip);
    inv := public.tab_payment_settle(pid, 'gift_card', null);
  end if;
  return jsonb_build_object('payment_id', pid, 'status', case when inv is null then 'pending' else 'paid' end, 'invoice_id', inv, 'amount', gross + tax + tip);
end;
$function$;

-- El camarero o la caja confirman que cobraron (pueden corregir la forma de pago).
create or replace function public.tab_payment_confirm(payment_input uuid, method_input text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_pos_staff() then raise exception 'no autorizado'; end if;
  if method_input = 'en_linea' or method_input = 'gift_card' then raise exception 'Forma de pago no válida'; end if;
  return public.tab_payment_settle(payment_input, method_input, null);
end;
$function$;

-- Quitar un aviso de pago: el personal o quien tenga la cuenta.
create or replace function public.tab_payment_cancel(payment_input uuid, code_input text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p public.tab_payments;
  t public.tabs;
begin
  select * into p from public.tab_payments where id = payment_input for update;
  if not found or p.status <> 'pending' then return false; end if;
  select * into t from public.tabs where id = p.tab_id;
  if not public.tab_can_access(t, code_input) then return false; end if;
  update public.tab_payments set status = 'cancelled' where id = p.id;
  update public.tabs set updated_at = now() where id = t.id;
  return true;
end;
$function$;

alter table public.tab_payments enable row level security;
drop policy if exists "Staff read tab payments" on public.tab_payments;
create policy "Staff read tab payments" on public.tab_payments for select using (public.is_order_staff());

revoke execute on function public.tab_finish(uuid), public.tab_payment_settle(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.tab_payment_settle(uuid, text, jsonb) to service_role;
revoke execute on function public.tab_pay_part(uuid, text, text, text, numeric, jsonb), public.tab_payment_cancel(uuid, text) from public;
grant execute on function public.tab_pay_part(uuid, text, text, text, numeric, jsonb), public.tab_payment_cancel(uuid, text) to anon, authenticated;
revoke execute on function public.tab_payment_confirm(uuid, text) from public, anon;
grant execute on function public.tab_payment_confirm(uuid, text) to authenticated;
