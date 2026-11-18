-- Equipo sin correo (entrar con PIN en los aparatos del local), tiempos del camarero con strikes
-- y el rol de contador con sus reportes.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Roles: se suma el contador ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('cliente', 'staff', 'comensal', 'cajero', 'camarero', 'cocina', 'contador'));
alter table public.team_invites drop constraint if exists team_invites_role_check;
alter table public.team_invites add constraint team_invites_role_check
  check (role in ('staff', 'comensal', 'cajero', 'camarero', 'cocina', 'contador'));

-- El dueño o el contador: ven la contabilidad (el contador no toca pedidos ni cuentas).
create or replace function public.is_accounting()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('staff', 'contador'));
$function$;

-- ---------- Entrar con PIN ----------
-- Personas del equipo sin correo: Supabase les da un usuario interno (lo crea el servidor con la clave de
-- servicio) y aquí se guarda su PIN cifrado. Solo sirve en un aparato que el dueño activó.
create table if not exists public.staff_pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  pin_only boolean not null default true,   -- entró sin correo (su usuario es interno)
  failed integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_devices (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  name text not null default '' check (length(name) <= 40),
  branch text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.staff_pins enable row level security;
alter table public.staff_devices enable row level security;
-- sin políticas: solo se leen con las funciones de abajo

create or replace function public.staff_device_valid(token_input text)
returns uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select id from public.staff_devices
  where token_hash = encode(extensions.digest(coalesce(token_input, ''), 'sha256'), 'hex') and revoked_at is null;
$function$;

-- El dueño activa el aparato donde está: devuelve el token (solo se ve esta vez; se guarda cifrado).
create or replace function public.staff_device_add(name_input text, branch_input text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  tok text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not public.is_staff() then raise exception 'Solo el dueño puede activar aparatos'; end if;
  insert into public.staff_devices (token_hash, name, branch, created_by)
  values (encode(extensions.digest(tok, 'sha256'), 'hex'), left(coalesce(btrim(name_input), ''), 40), nullif(branch_input, ''), auth.uid());
  return tok;
end;
$function$;

create or replace function public.staff_device_list()
returns table (id uuid, name text, branch text, created_at timestamptz, last_used_at timestamptz)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_staff() then raise exception 'Solo el dueño'; end if;
  return query select d.id, d.name, d.branch, d.created_at, d.last_used_at from public.staff_devices d where d.revoked_at is null order by d.created_at;
end;
$function$;

create or replace function public.staff_device_revoke(device_input uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_staff() then raise exception 'Solo el dueño'; end if;
  update public.staff_devices set revoked_at = now() where id = device_input and revoked_at is null;
  return found;
end;
$function$;

-- Los nombres que salen en la pantalla del equipo de ese aparato.
create or replace function public.staff_roster(device_input text)
returns table (user_id uuid, name text, role text, locked boolean)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if public.staff_device_valid(device_input) is null then return; end if;
  return query
  select p.id, p.name, p.role, coalesce(s.locked_until > now(), false)
  from public.staff_pins s join public.profiles p on p.id = s.user_id
  where p.role in ('cajero', 'camarero', 'cocina', 'comensal', 'contador')
  order by p.name;
end;
$function$;

-- El dueño pone o cambia el PIN de alguien del equipo (también desbloquea).
create or replace function public.staff_pin_set(user_input uuid, pin_input text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_staff() and current_user <> 'service_role' then raise exception 'Solo el dueño puede poner PIN'; end if;
  if coalesce(pin_input, '') !~ '^[0-9]{4}$' then raise exception 'El PIN son 4 números'; end if;
  if not exists (select 1 from public.profiles where id = user_input and role in ('cajero', 'camarero', 'cocina', 'comensal', 'contador')) then
    raise exception 'Esa persona no está en el equipo';
  end if;
  insert into public.staff_pins (user_id, pin_hash, pin_only)
  values (user_input, extensions.crypt(pin_input, extensions.gen_salt('bf', 8)), false)
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, failed = 0, locked_until = null, updated_at = now();
  return true;
end;
$function$;

create or replace function public.staff_pin_remove(user_input uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_staff() then raise exception 'Solo el dueño'; end if;
  delete from public.staff_pins where user_id = user_input and not pin_only;
  return found;
end;
$function$;

-- Revisa el PIN en un aparato activado. 5 errores seguidos bloquean a esa persona 15 minutos.
-- Solo la llama el servidor (clave de servicio), que después abre la sesión.
create or replace function public.staff_pin_check(device_input text, user_input uuid, pin_input text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  dev uuid := public.staff_device_valid(device_input);
  s public.staff_pins;
begin
  if dev is null then return jsonb_build_object('ok', false, 'reason', 'device'); end if;
  select * into s from public.staff_pins where user_id = user_input for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'user'); end if;
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'until', s.locked_until);
  end if;
  if s.pin_hash <> extensions.crypt(coalesce(pin_input, ''), s.pin_hash) then
    update public.staff_pins set failed = failed + 1,
      locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' end
    where user_id = s.user_id;
    return jsonb_build_object('ok', false, 'reason', 'pin', 'left', greatest(0, 4 - s.failed));
  end if;
  update public.staff_pins set failed = 0, locked_until = null where user_id = s.user_id;
  update public.staff_devices set last_used_at = now() where id = dev;
  return jsonb_build_object('ok', true, 'email', (select email from auth.users where id = s.user_id));
end;
$function$;

-- El servidor deja lista a una persona nueva sin correo (su usuario interno ya existe).
create or replace function public.staff_pin_member_setup(user_input uuid, name_input text, role_input text, pin_input text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if role_input not in ('cajero', 'camarero', 'cocina', 'comensal', 'contador') then raise exception 'Rol no válido'; end if;
  if coalesce(pin_input, '') !~ '^[0-9]{4}$' then raise exception 'El PIN son 4 números'; end if;
  update public.profiles set name = left(btrim(name_input), 60), role = role_input where id = user_input;
  insert into public.staff_pins (user_id, pin_hash, pin_only)
  values (user_input, extensions.crypt(pin_input, extensions.gen_salt('bf', 8)), true)
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, pin_only = true, failed = 0, locked_until = null;
  return true;
end;
$function$;

-- ---------- Equipo: con el contador, el PIN y los strikes ----------
create or replace function public.team_add(p_email text, p_role text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_uid uuid;
begin
  if not public.is_staff() then raise exception 'Solo el dueño puede agregar personal'; end if;
  if p_role not in ('staff', 'comensal', 'cajero', 'camarero', 'cocina', 'contador') then raise exception 'Rol no válido'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Escribe un correo válido'; end if;
  select id into v_uid from auth.users where lower(email) = v_email limit 1;
  if v_uid is not null then
    if v_uid = auth.uid() then raise exception 'Esa es tu propia cuenta'; end if;
    update public.profiles set role = p_role where id = v_uid;
    delete from public.team_invites where email = v_email;
    return 'updated';
  end if;
  insert into public.team_invites (email, role, invited_by)
  values (v_email, p_role, auth.uid())
  on conflict (email) do update
  set role = excluded.role, invited_by = excluded.invited_by,
      created_at = now(), expires_at = now() + interval '14 days';
  return 'invited';
end;
$function$;

create or replace function public.team_remove(p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_staff() then raise exception 'Solo el dueño puede quitar personal'; end if;
  if p_user = auth.uid() then raise exception 'No puedes quitarte a ti mismo'; end if;
  update public.profiles set role = 'cliente'
  where id = p_user and role in ('staff', 'comensal', 'cajero', 'camarero', 'cocina', 'contador');
  if not found then raise exception 'Esa persona no está en el equipo'; end if;
  delete from public.staff_pins where user_id = p_user;
end;
$function$;

create or replace function public.team_set_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_staff() then raise exception 'Solo el dueño puede cambiar roles'; end if;
  if p_role not in ('staff', 'comensal', 'cajero', 'camarero', 'cocina', 'contador') then raise exception 'Rol no válido'; end if;
  if p_user = auth.uid() then raise exception 'No puedes cambiar tu propio rol'; end if;
  -- alguien que solo entra con PIN no puede ser dueño (no tiene correo para entrar fuera del local)
  if p_role = 'staff' and exists (select 1 from public.staff_pins where user_id = p_user and pin_only) then
    raise exception 'Para ser dueño necesita una cuenta con correo';
  end if;
  update public.profiles set role = p_role
  where id = p_user and role in ('staff', 'comensal', 'cajero', 'camarero', 'cocina', 'contador');
  if not found then raise exception 'Esa persona no está en el equipo'; end if;
end;
$function$;

-- ---------- Tiempos del camarero ----------
-- El camarero dice en cuánto llega a atender el llamado o a llevar la cuenta. Si se le vence el tiempo
-- sin marcarlo como hecho, se le anota un strike que ve el dueño.
alter table public.tabs add column if not exists eta_at timestamptz;
alter table public.tabs add column if not exists eta_kind text check (eta_kind is null or eta_kind in ('call', 'bill'));
alter table public.tabs add column if not exists eta_by uuid references auth.users(id) on delete set null;
alter table public.tabs add column if not exists eta_set_at timestamptz;

create table if not exists public.waiter_strikes (
  id uuid primary key default gen_random_uuid(),
  waiter_id uuid not null references auth.users(id) on delete cascade,
  tab_id uuid references public.tabs(id) on delete set null,
  table_label text not null default '',
  kind text not null check (kind in ('call', 'bill')),
  promised_minutes integer not null default 0,
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null
);
create index if not exists waiter_strikes_waiter_idx on public.waiter_strikes (waiter_id, created_at desc);
alter table public.waiter_strikes enable row level security;
drop policy if exists "Owner or own waiter read strikes" on public.waiter_strikes;
create policy "Owner or own waiter read strikes" on public.waiter_strikes for select using (public.is_staff() or waiter_id = auth.uid());

-- Anota el strike si el tiempo prometido ya pasó (10 s de gracia) y limpia el tiempo.
create or replace function public.tab_eta_settle(t public.tabs)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  late boolean := t.eta_at is not null and t.eta_by is not null and now() > t.eta_at + interval '10 seconds';
begin
  if t.eta_at is null then return false; end if;
  if late then
    insert into public.waiter_strikes (waiter_id, tab_id, table_label, kind, promised_minutes, due_at)
    values (t.eta_by, t.id, t.table_label, t.eta_kind, greatest(0, round(extract(epoch from (t.eta_at - coalesce(t.eta_set_at, t.eta_at))) / 60)), t.eta_at);
  end if;
  update public.tabs set eta_at = null, eta_kind = null, eta_by = null, eta_set_at = null, updated_at = now() where id = t.id;
  return late;
end;
$function$;

-- "Voy en N minutos" para el llamado o la cuenta.
create or replace function public.tab_eta_set(tab_input uuid, minutes_input integer, kind_input text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
begin
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

-- Más tiempo desde el aviso (hasta 30 minutos más de lo prometido al principio).
create or replace function public.tab_eta_extend(tab_input uuid, minutes_input integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
begin
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

-- Ya atendió: el llamado se marca atendido o la cuenta, entregada. Si llegó tarde, cuenta el strike.
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

-- Revisa los tiempos vencidos de una sucursal (lo llaman la caja, los camareros y el dueño al cargar).
create or replace function public.tab_eta_sweep(branch_input text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
  n integer := 0;
begin
  if not public.is_order_staff() then return 0; end if;
  for t in select * from public.tabs where eta_at is not null and now() > eta_at + interval '10 seconds'
    and (branch_input is null or branch = branch_input) for update skip locked loop
    if public.tab_eta_settle(t) then n := n + 1; end if;
  end loop;
  return n;
end;
$function$;

create or replace function public.waiter_strike_void(strike_input uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_staff() then raise exception 'Solo el dueño'; end if;
  update public.waiter_strikes set voided_at = now(), voided_by = auth.uid() where id = strike_input and voided_at is null;
  return found;
end;
$function$;

-- Al cerrar la cuenta, un tiempo pendiente se resuelve (con strike si ya estaba vencido).
create or replace function public.tab_finish(tab_input uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
begin
  select * into t from public.tabs where id = tab_input;
  if found and t.eta_at is not null then perform public.tab_eta_settle(t); end if;
  update public.tabs set status = 'closed', closed_at = now(), closed_by = coalesce(auth.uid(), closed_by),
    call_waiter_at = null, updated_at = now()
  where id = tab_input and status in ('open', 'bill');
  update public.orders set status = 'entregada' where tab_id = tab_input and status <> 'entregada';
end;
$function$;

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
    'eta_at', t.eta_at, 'eta_kind', t.eta_kind, 'eta_name', (select name from public.profiles where id = t.eta_by),
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

drop function if exists public.team_list();
create or replace function public.team_list()
returns table(user_id uuid, email text, name text, role text, pending boolean, is_me boolean, created_at timestamptz,
  has_pin boolean, pin_only boolean, locked boolean, strikes integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_staff() then raise exception 'Solo el dueño puede ver el equipo'; end if;
  return query
  select p.id, case when s.pin_only then null else u.email::text end, p.name, p.role, false, (p.id = auth.uid()), p.created_at,
    s.user_id is not null, coalesce(s.pin_only, false), coalesce(s.locked_until > now(), false),
    (select count(*)::integer from public.waiter_strikes w where w.waiter_id = p.id and w.voided_at is null)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.staff_pins s on s.user_id = p.id
  where p.role in ('staff', 'comensal', 'cajero', 'camarero', 'cocina', 'contador')
  union all
  select null::uuid, i.email, ''::text, i.role, true, false, i.created_at, false, false, false, 0
  from public.team_invites i
  where i.expires_at > now()
  order by 4, 7;
end;
$function$;

-- ---------- Permisos ----------
revoke execute on function public.staff_device_valid(text), public.staff_pin_check(text, uuid, text),
  public.staff_pin_member_setup(uuid, text, text, text), public.tab_eta_settle(public.tabs) from public, anon, authenticated;
grant execute on function public.staff_pin_check(text, uuid, text), public.staff_pin_member_setup(uuid, text, text, text) to service_role;
revoke execute on function public.staff_roster(text) from public;
grant execute on function public.staff_roster(text) to anon, authenticated;
revoke execute on function public.staff_device_add(text, text), public.staff_device_list(), public.staff_device_revoke(uuid),
  public.staff_pin_set(uuid, text), public.staff_pin_remove(uuid), public.is_accounting(),
  public.tab_eta_set(uuid, integer, text), public.tab_eta_extend(uuid, integer), public.tab_eta_done(uuid),
  public.tab_eta_sweep(text), public.waiter_strike_void(uuid), public.team_list() from public, anon;
grant execute on function public.staff_device_add(text, text), public.staff_device_list(), public.staff_device_revoke(uuid),
  public.staff_pin_set(uuid, text), public.staff_pin_remove(uuid), public.is_accounting(),
  public.tab_eta_set(uuid, integer, text), public.tab_eta_extend(uuid, integer), public.tab_eta_done(uuid),
  public.tab_eta_sweep(text), public.waiter_strike_void(uuid), public.team_list() to authenticated;
grant execute on function public.staff_pin_set(uuid, text) to service_role;
