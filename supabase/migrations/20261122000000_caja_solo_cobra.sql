-- La caja solo cobra y factura (y vende en el mostrador): no abre cuentas, no agrega pedidos, no atiende
-- llamados ni cambia pedidos. Lo demás del personal sigue igual.

create or replace function public.is_cashier()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'cajero');
$function$;
revoke execute on function public.is_cashier() from public, anon;
grant execute on function public.is_cashier() to authenticated;

create or replace function public.tab_open(table_input uuid, name_input text, guests_input integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  dt record;
  t public.tabs;
begin
  if public.is_cashier() then raise exception 'La caja solo cobra y factura'; end if;
  select * into dt from public.dining_tables where id = table_input;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_table'); end if;
  select * into t from public.tabs where table_id = dt.id and status in ('open', 'bill');
  if found then
    if public.tab_can_access(t, null) then return jsonb_build_object('ok', true, 'tab', public.tab_json(t, true)); end if;
    return jsonb_build_object('ok', false, 'reason', 'exists', 'tab_id', t.id, 'opened_name', t.opened_name);
  end if;
  begin
    insert into public.tabs (branch, table_id, table_label, opened_by, opened_name, guests, waiter_id)
    values (dt.branch, dt.id, dt.label, auth.uid(), left(coalesce(btrim(name_input), ''), 60), greatest(1, least(50, coalesce(guests_input, 1))),
      case when exists (select 1 from public.profiles where id = auth.uid() and role = 'camarero') then auth.uid() end)
    returning * into t;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'exists');
  end;
  return jsonb_build_object('ok', true, 'tab', public.tab_json(t, true));
end;
$function$;

create or replace function public.tab_add_order(tab_input uuid, code_input text, order_input jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
  me record;
  oid uuid;
  items jsonb := coalesce(order_input->'items', '[]'::jsonb);
begin
  if public.is_cashier() then raise exception 'La caja solo cobra y factura'; end if;
  select * into t from public.tabs where id = tab_input for update;
  if not found or not public.tab_can_access(t, code_input) then raise exception 'Cuenta no encontrada'; end if;
  if t.status not in ('open', 'bill') then raise exception 'Esta cuenta ya está cerrada'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 or jsonb_array_length(items) > 60 then raise exception 'Pedido vacío'; end if;
  select id, role, gender, age into me from public.profiles where id = auth.uid();
  insert into public.orders (customer_name, table_number, items, subtotal, tax_amount, payment_method, user_id, branch,
    customer_gender, customer_age, party_size, status, tab_id, waiter_id, push_ref)
  values (
    left(coalesce(nullif(btrim(order_input->>'customer_name'), ''), t.opened_name, ''), 60), t.table_label, items,
    greatest(0, coalesce((order_input->>'subtotal')::numeric, 0)), greatest(0, coalesce((order_input->>'tax_amount')::numeric, 0)),
    'cuenta',
    case when me.role = 'cliente' then auth.uid() end,
    t.branch,
    case when me.role = 'cliente' then me.gender end, case when me.role = 'cliente' then me.age end,
    t.guests, 'nueva', t.id,
    case when me.role in ('camarero', 'staff', 'cajero', 'comensal') then auth.uid() end,
    case when auth.uid() is null and (order_input->>'push_ref') ~ '^guest_[0-9a-f-]{36}$' then order_input->>'push_ref' end
  )
  returning id into oid;
  update public.tabs
    set status = 'open', updated_at = now(),
        waiter_id = coalesce(waiter_id, case when me.role = 'camarero' then auth.uid() end)
    where id = t.id;
  return oid;
end;
$function$;

create or replace function public.tab_staff_update(tab_input uuid, action_input text, value_input text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
  dt record;
begin
  if public.is_cashier() then raise exception 'La caja solo cobra y factura'; end if;
  if not public.is_pos_staff() then raise exception 'no autorizado'; end if;
  select * into t from public.tabs where id = tab_input for update;
  if not found then raise exception 'Cuenta no encontrada'; end if;
  if action_input = 'clear_call' then
    update public.tabs set call_waiter_at = null, updated_at = now() where id = t.id;
  elsif action_input = 'assign_waiter' then
    if value_input is not null and not exists (select 1 from public.profiles where id = value_input::uuid and role in ('camarero', 'staff', 'cajero', 'comensal')) then
      raise exception 'Ese usuario no es del equipo';
    end if;
    update public.tabs set waiter_id = value_input::uuid, updated_at = now() where id = t.id;
  elsif action_input = 'move' then
    select * into dt from public.dining_tables where id = value_input::uuid;
    if not found then raise exception 'Mesa no encontrada'; end if;
    update public.tabs set table_id = dt.id, table_label = dt.label, branch = dt.branch, updated_at = now() where id = t.id;
    update public.orders set table_number = dt.label where tab_id = t.id;
  elsif action_input = 'reopen' then
    if t.status <> 'bill' then raise exception 'La cuenta no está pidiendo cierre'; end if;
    update public.tabs set status = 'open', updated_at = now() where id = t.id;
  elsif action_input = 'cancel' then
    if exists (select 1 from public.orders where tab_id = t.id) then raise exception 'La cuenta tiene pedidos: cóbrala o elimina los pedidos primero'; end if;
    update public.tabs set status = 'cancelled', closed_at = now(), closed_by = auth.uid(), updated_at = now() where id = t.id;
  else
    raise exception 'Acción no válida';
  end if;
  select * into t from public.tabs where id = tab_input;
  return public.tab_json(t, true);
end;
$function$;

create or replace function public.set_item_available(item_input uuid, available_input boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.is_cashier() then raise exception 'La caja solo cobra y factura'; end if;
  if not public.is_pos_staff() then raise exception 'no autorizado'; end if;
  update public.menu_items set available = available_input where id = item_input;
  return found;
end;
$function$;

create or replace function public.tab_eta_set(tab_input uuid, minutes_input integer, kind_input text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
begin
  if public.is_cashier() then raise exception 'La caja solo cobra y factura'; end if;
  if not public.is_pos_staff() then raise exception 'no autorizado'; end if;
  if minutes_input not between 1 and 30 then raise exception 'Elige entre 1 y 30 minutos'; end if;
  if kind_input not in ('call', 'bill') then raise exception 'Tipo no válido'; end if;
  select * into t from public.tabs where id = tab_input for update;
  if not found or t.status not in ('open', 'bill') then raise exception 'Cuenta no encontrada'; end if;
  if kind_input = 'call' and t.call_waiter_at is null then raise exception 'La mesa ya no está llamando'; end if;
  if kind_input = 'bill' and t.status <> 'bill' then raise exception 'La mesa no pidió la cuenta'; end if;
  if t.eta_at is not null and t.eta_by is distinct from auth.uid() then raise exception 'Otro camarero ya va para esa mesa'; end if;
  update public.tabs set eta_at = now() + make_interval(mins => minutes_input), eta_kind = kind_input, eta_by = auth.uid(),
    eta_set_at = now(), waiter_id = coalesce(waiter_id, auth.uid()), updated_at = now()
  where id = t.id
  returning * into t;
  return public.tab_json(t, true);
end;
$function$;

create or replace function public.tab_eta_extend(tab_input uuid, minutes_input integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
begin
  if public.is_cashier() then raise exception 'La caja solo cobra y factura'; end if;
  if not public.is_pos_staff() then raise exception 'no autorizado'; end if;
  if minutes_input not between 1 and 10 then raise exception 'Elige entre 1 y 10 minutos'; end if;
  select * into t from public.tabs where id = tab_input for update;
  if not found or t.eta_at is null then raise exception 'Esa mesa no tiene un tiempo en curso'; end if;
  if t.eta_by is distinct from auth.uid() and not public.is_staff() then raise exception 'Ese tiempo es de otro camarero'; end if;
  if now() > t.eta_at + interval '10 seconds' then
    perform public.tab_eta_settle(t);
    raise exception 'Se venció el tiempo';
  end if;
  if t.eta_at + make_interval(mins => minutes_input) > t.eta_set_at + interval '60 minutes' then raise exception 'Ya no se puede alargar más'; end if;
  update public.tabs set eta_at = eta_at + make_interval(mins => minutes_input), updated_at = now() where id = t.id returning * into t;
  return public.tab_json(t, true);
end;
$function$;

create or replace function public.tab_eta_done(tab_input uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
  late boolean := false;
begin
  if public.is_cashier() then raise exception 'La caja solo cobra y factura'; end if;
  if not public.is_pos_staff() then raise exception 'no autorizado'; end if;
  select * into t from public.tabs where id = tab_input for update;
  if not found then raise exception 'Cuenta no encontrada'; end if;
  if t.eta_at is not null then late := public.tab_eta_settle(t); end if;
  if t.eta_kind = 'call' or t.eta_kind is null then
    update public.tabs set call_waiter_at = null, updated_at = now() where id = t.id;
  end if;
  select * into t from public.tabs where id = tab_input;
  return public.tab_json(t, true) || jsonb_build_object('late', late);
end;
$function$;

-- Pedidos: los cambian la cocina, los camareros, el comensal y el dueño; la caja no.
drop policy if exists "Order staff can update orders" on public.orders;
create policy "Order staff can update orders" on public.orders for update using (public.is_order_staff() and not public.is_cashier());
drop policy if exists "Order staff can delete orders" on public.orders;
create policy "Order staff can delete orders" on public.orders for delete using (public.is_order_staff() and not public.is_cashier());
