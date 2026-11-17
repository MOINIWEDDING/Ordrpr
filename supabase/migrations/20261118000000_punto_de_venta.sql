-- Punto de venta: roles del personal (cajero, camarero, cocina), cuentas abiertas por mesa,
-- facturas, estrellas a los camareros, impresoras por internet y lo que necesitan los productos
-- (ingredientes, estación y agotado).

-- ---------- Roles ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('cliente', 'staff', 'comensal', 'cajero', 'camarero', 'cocina'));
alter table public.team_invites drop constraint if exists team_invites_role_check;
alter table public.team_invites add constraint team_invites_role_check
  check (role in ('staff', 'comensal', 'cajero', 'camarero', 'cocina'));

-- Todo el personal que atiende pedidos (antes: dueño y comensal).
create or replace function public.is_order_staff()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('staff', 'comensal', 'cajero', 'camarero', 'cocina'));
$function$;

-- Quien cobra y maneja cuentas (la cocina no).
create or replace function public.is_pos_staff()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('staff', 'comensal', 'cajero', 'camarero'));
$function$;

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
  if p_role not in ('staff', 'comensal', 'cajero', 'camarero', 'cocina') then raise exception 'Rol no válido'; end if;
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

create or replace function public.team_list()
returns table(user_id uuid, email text, name text, role text, pending boolean, is_me boolean, created_at timestamptz)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_staff() then raise exception 'Solo el dueño puede ver el equipo'; end if;
  return query
  select p.id, u.email::text, p.name, p.role, false, (p.id = auth.uid()), p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role in ('staff', 'comensal', 'cajero', 'camarero', 'cocina')
  union all
  select null::uuid, i.email, ''::text, i.role, true, false, i.created_at
  from public.team_invites i
  where i.expires_at > now()
  order by 4, 7;
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
  where id = p_user and role in ('staff', 'comensal', 'cajero', 'camarero', 'cocina');
  if not found then raise exception 'Esa persona no está en el equipo'; end if;
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
  if p_role not in ('staff', 'comensal', 'cajero', 'camarero', 'cocina') then raise exception 'Rol no válido'; end if;
  if p_user = auth.uid() then raise exception 'No puedes cambiar tu propio rol'; end if;
  update public.profiles set role = p_role
  where id = p_user and role in ('staff', 'comensal', 'cajero', 'camarero', 'cocina');
  if not found then raise exception 'Esa persona no está en el equipo'; end if;
end;
$function$;

-- ---------- Productos y negocio ----------
alter table public.menu_items add column if not exists ingredients text not null default '';
alter table public.menu_items add column if not exists available boolean not null default true;
alter table public.menu_items add column if not exists station text check (station is null or station in ('cocina', 'bar'));
alter table public.categories add column if not exists station text not null default 'cocina' check (station in ('cocina', 'bar'));

-- Datos fiscales del negocio que salen en las facturas.
alter table public.site_settings add column if not exists business_legal_name text not null default '';
alter table public.site_settings add column if not exists business_rnc text not null default '';
alter table public.site_settings add column if not exists invoice_footer text not null default '';

-- ---------- Cuentas abiertas ----------
create table if not exists public.tabs (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  branch text not null,
  table_id uuid references public.dining_tables(id) on delete set null,
  table_label text not null default '',
  code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  status text not null default 'open' check (status in ('open', 'bill', 'closed', 'cancelled')),
  opened_by uuid references auth.users(id) on delete set null,
  opened_name text not null default '' check (length(opened_name) <= 60),
  waiter_id uuid references auth.users(id) on delete set null,
  guests integer not null default 1 check (guests between 1 and 50),
  call_waiter_at timestamptz,
  bill_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  invoice_id uuid
);
create unique index if not exists tabs_one_open_per_table on public.tabs (table_id) where status in ('open', 'bill') and table_id is not null;
create index if not exists tabs_branch_status_idx on public.tabs (branch, status);

alter table public.orders add column if not exists tab_id uuid references public.tabs(id) on delete set null;
alter table public.orders add column if not exists waiter_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists station_status jsonb not null default '{}'::jsonb;
create index if not exists orders_tab_idx on public.orders (tab_id) where tab_id is not null;

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

-- ---------- Facturas ----------
create sequence if not exists public.invoice_number_seq;
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.invoice_number_seq'),
  kind text not null check (kind in ('order', 'tab')),
  order_id uuid unique references public.orders(id) on delete set null,
  tab_id uuid references public.tabs(id) on delete set null,
  branch text,
  table_label text not null default '',
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null default '',
  fiscal jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  tax_lines jsonb not null default '[]'::jsonb,
  tax_total numeric not null default 0,
  tip numeric not null default 0,
  total numeric not null default 0,
  payments jsonb not null default '[]'::jsonb,
  currency jsonb,
  waiter_id uuid references auth.users(id) on delete set null,
  cashier_id uuid references auth.users(id) on delete set null,
  business jsonb not null default '{}'::jsonb,
  ncf text,
  status text not null default 'emitida' check (status in ('emitida', 'anulada')),
  issued_at timestamptz not null default now()
);
create index if not exists invoices_issued_idx on public.invoices (issued_at desc);
-- una cuenta puede tener varias facturas: la de cada persona que pagó su parte y la del resto
alter table public.invoices drop constraint if exists invoices_tab_id_key;
create index if not exists invoices_tab_idx on public.invoices (tab_id) where tab_id is not null;

-- Los datos del negocio al momento de facturar (si después cambian, la factura no cambia).
create or replace function public.invoice_business()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'brand_name', s.brand_name, 'legal_name', s.business_legal_name, 'rnc', s.business_rnc,
    'address', s.address, 'phone', s.phone, 'email', s.email, 'logo_url', s.logo_url, 'footer', s.invoice_footer,
    'currency_symbol', s.currency_symbol, 'currency_position', s.currency_position
  )
  from public.site_settings s where s.id = 1;
$function$;

-- Impuestos de la sucursal aplicados a una base: [{ label, percent, amount }]; la última línea
-- absorbe el redondeo para que sumen exactamente `total_input` (si se da).
create or replace function public.invoice_tax_lines(branch_input text, base_input numeric, total_input numeric)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  charges jsonb;
  out_lines jsonb := '[]'::jsonb;
  c jsonb;
  amt numeric;
  acc numeric := 0;
  n integer;
  i integer := 0;
begin
  select t.charges into charges from public.tax_settings t where t.branch = branch_input;
  charges := coalesce(charges, '[]'::jsonb);
  n := jsonb_array_length(charges);
  for c in select * from jsonb_array_elements(charges) loop
    i := i + 1;
    amt := round(base_input * coalesce((c->>'percent')::numeric, 0) / 100);
    if i = n and total_input is not null then amt := total_input - acc; end if;
    acc := acc + amt;
    out_lines := out_lines || jsonb_build_object('label', c->>'label', 'percent', (c->>'percent')::numeric, 'amount', amt);
  end loop;
  return out_lines;
end;
$function$;

-- Cada pedido suelto (sin cuenta abierta) queda facturado al hacerlo.
create or replace function public.invoice_for_new_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  inv_id uuid;
begin
  if new.tab_id is not null then return new; end if;
  insert into public.invoices (kind, order_id, branch, table_label, user_id, customer_name, items, subtotal, discount,
    tax_lines, tax_total, total, payments, currency, waiter_id, business)
  -- el subtotal del pedido ya trae restado el código promocional: la factura muestra el subtotal antes del descuento
  values ('order', new.id, new.branch, coalesce(new.table_number, ''), new.user_id, new.customer_name, new.items,
    new.subtotal + coalesce((new.promo->>'discount')::numeric, 0),
    coalesce((new.promo->>'discount')::numeric, 0),
    public.invoice_tax_lines(new.branch, new.subtotal, new.tax_amount), new.tax_amount, new.subtotal + new.tax_amount,
    jsonb_build_array(jsonb_build_object('method', coalesce(new.payment_method, ''), 'amount', new.subtotal + new.tax_amount)),
    new.payment_currency, new.waiter_id, coalesce(public.invoice_business(), '{}'::jsonb))
  returning id into inv_id;
  return new;
end;
$function$;
drop trigger if exists orders_invoice on public.orders;
create trigger orders_invoice after insert on public.orders for each row execute function public.invoice_for_new_order();

-- ---------- Estrellas a los camareros ----------
create table if not exists public.waiter_ratings (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid references public.tabs(id) on delete set null,
  waiter_id uuid not null references auth.users(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text not null default '' check (length(comment) <= 300),
  rater text not null,
  created_at timestamptz not null default now(),
  unique (tab_id, rater)
);

-- ---------- Impresoras por internet ----------
create table if not exists public.printers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 40),
  branch text,
  role text not null default 'cocina' check (role in ('cocina', 'bar', 'caja')),
  kind text not null default 'virtual' check (kind in ('virtual', 'star', 'epson')),
  paper integer not null default 80 check (paper in (58, 80)),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  enabled boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  printer_id uuid not null references public.printers(id) on delete cascade,
  kind text not null check (kind in ('comanda', 'prefactura', 'factura', 'prueba')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'done', 'error')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  done_at timestamptz
);
create index if not exists print_jobs_queue_idx on public.print_jobs (printer_id, status, created_at);

-- Comandas: al entrar un pedido, cada impresora de cocina o bar recibe lo que le toca.
create or replace function public.print_order_tickets()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p record;
  lines jsonb;
  waiter text;
begin
  if not exists (select 1 from public.printers where enabled and role in ('cocina', 'bar')) then return new; end if;
  select name into waiter from public.profiles where id = new.waiter_id;
  for p in select * from public.printers where enabled and role in ('cocina', 'bar') and (branch is null or branch = new.branch) loop
    select coalesce(jsonb_agg(it), '[]'::jsonb) into lines
    from jsonb_array_elements(new.items) it
    where coalesce(
      (select m.station from public.menu_items m where m.id::text = it->>'id'),
      (select c.station from public.menu_items m join public.categories c on c.name = m.category where m.id::text = it->>'id'),
      'cocina'
    ) = p.role;
    if jsonb_array_length(lines) > 0 then
      insert into public.print_jobs (printer_id, kind, payload)
      values (p.id, 'comanda', jsonb_build_object(
        'order_id', new.id, 'station', p.role, 'table', coalesce(new.table_number, ''), 'customer', new.customer_name,
        'waiter', coalesce(waiter, ''), 'items', lines, 'created_at', new.created_at
      ));
    end if;
  end loop;
  return new;
end;
$function$;
drop trigger if exists orders_print_tickets on public.orders;
create trigger orders_print_tickets after insert on public.orders for each row execute function public.print_order_tickets();

-- Lo que usan las impresoras (sin sesión: entran con el token de su dirección).
create or replace function public.print_take(token_input text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p record;
  j record;
begin
  select * into p from public.printers where token = token_input and enabled;
  if not found then return null; end if;
  update public.printers set last_seen_at = now() where id = p.id;
  -- un trabajo enviado hace más de 2 minutos sin confirmar se vuelve a mandar
  select * into j from public.print_jobs
    where printer_id = p.id and (status = 'pending' or (status = 'sent' and sent_at < now() - interval '2 minutes'))
    order by created_at limit 1 for update skip locked;
  if not found then return jsonb_build_object('printer', jsonb_build_object('id', p.id, 'paper', p.paper, 'name', p.name)); end if;
  update public.print_jobs set status = 'sent', sent_at = now() where id = j.id;
  return jsonb_build_object('printer', jsonb_build_object('id', p.id, 'paper', p.paper, 'name', p.name),
    'job', jsonb_build_object('id', j.id, 'kind', j.kind, 'payload', j.payload, 'created_at', j.created_at));
end;
$function$;

create or replace function public.print_peek(token_input text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p record;
begin
  select * into p from public.printers where token = token_input and enabled;
  if not found then return false; end if;
  update public.printers set last_seen_at = now() where id = p.id;
  return exists (select 1 from public.print_jobs where printer_id = p.id
    and (status = 'pending' or (status = 'sent' and sent_at < now() - interval '2 minutes')));
end;
$function$;

-- Confirma el trabajo (o el último enviado, si la impresora no dice cuál).
create or replace function public.print_ack(token_input text, job_input uuid, ok_input boolean, error_input text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p record;
  target uuid;
begin
  select * into p from public.printers where token = token_input;
  if not found then return false; end if;
  target := coalesce(job_input, (select id from public.print_jobs where printer_id = p.id and status = 'sent' order by sent_at desc limit 1));
  update public.print_jobs
    set status = case when ok_input then 'done' else 'error' end, done_at = now(), error = left(error_input, 300)
    where id = target and printer_id = p.id;
  return found;
end;
$function$;

-- ---------- Cuentas: funciones ----------
-- Quién puede ver o usar una cuenta: el personal, quien la abrió o quien tiene su código.
create or replace function public.tab_can_access(t public.tabs, code_input text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  -- coalesce: con un código vacío la comparación da NULL, y NULL no debe contar como permiso
  select coalesce(public.is_order_staff(), false)
    or coalesce(auth.uid() is not null and t.opened_by = auth.uid(), false)
    or coalesce(code_input is not null and upper(btrim(code_input)) = t.code, false);
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

-- El cliente abre la cuenta desde el QR de su mesa. Si la mesa ya tiene una abierta, se une con el código.
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

create or replace function public.tab_get(tab_input uuid, code_input text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
begin
  select * into t from public.tabs where id = tab_input;
  if not found or not public.tab_can_access(t, code_input) then return null; end if;
  return public.tab_json(t, true);
end;
$function$;

-- Un pedido dentro de la cuenta. Lo usan el cliente (con el código) y el personal.
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

create or replace function public.tab_request_bill(tab_input uuid, code_input text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
begin
  select * into t from public.tabs where id = tab_input;
  if not found or not public.tab_can_access(t, code_input) or t.status not in ('open', 'bill') then return false; end if;
  update public.tabs set status = 'bill', bill_requested_at = now(), updated_at = now() where id = t.id;
  return true;
end;
$function$;

create or replace function public.tab_call_waiter(tab_input uuid, code_input text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
begin
  select * into t from public.tabs where id = tab_input;
  if not found or not public.tab_can_access(t, code_input) or t.status not in ('open', 'bill') then return false; end if;
  update public.tabs set call_waiter_at = now(), updated_at = now() where id = t.id;
  return true;
end;
$function$;

-- El personal atiende el llamado, asigna camarero, cambia de mesa o cancela una cuenta vacía.
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

-- El cliente califica al camarero cuando la cuenta se cerró.
create or replace function public.tab_rate_waiter(tab_input uuid, code_input text, stars_input integer, comment_input text, rater_input text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t public.tabs;
  v_rater text := coalesce(auth.uid()::text, 'guest:' || left(coalesce(rater_input, ''), 60));
begin
  select * into t from public.tabs where id = tab_input;
  if not found or not public.tab_can_access(t, code_input) then return false; end if;
  if t.status <> 'closed' or t.waiter_id is null then return false; end if;
  if stars_input not between 1 and 5 then return false; end if;
  insert into public.waiter_ratings (tab_id, waiter_id, stars, comment, rater)
  values (t.id, t.waiter_id, stars_input, left(coalesce(btrim(comment_input), ''), 300), v_rater)
  on conflict (tab_id, rater) do update set stars = excluded.stars, comment = excluded.comment, created_at = now();
  return true;
end;
$function$;

-- Los camareros (para asignar una cuenta). La caja no puede leer los perfiles directamente.
create or replace function public.pos_waiters()
returns table (id uuid, name text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_pos_staff() then raise exception 'no autorizado'; end if;
  return query select p.id, p.name from public.profiles p where p.role = 'camarero' order by p.name;
end;
$function$;

-- ---------- Facturas: lectura ----------
create or replace function public.invoice_get(invoice_input uuid, code_input text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  i public.invoices;
  allowed boolean;
begin
  select * into i from public.invoices where id = invoice_input;
  if not found then return null; end if;
  allowed := coalesce(public.is_order_staff(), false)
    or coalesce(auth.uid() is not null and i.user_id = auth.uid(), false)
    or (i.kind = 'order' and i.user_id is null)  -- pedido de invitado: el id es el secreto
    or (i.kind = 'tab' and exists (select 1 from public.tabs t where t.id = i.tab_id and public.tab_can_access(t, code_input)));
  if not allowed then return null; end if;
  return to_jsonb(i) || jsonb_build_object(
    'waiter_name', (select name from public.profiles where id = i.waiter_id),
    'cashier_name', (select name from public.profiles where id = i.cashier_id)
  );
end;
$function$;

-- La factura de un pedido (la suya o la de la cuenta donde se pidió).
create or replace function public.invoice_for_order(order_input uuid)
returns uuid
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  o record;
begin
  select id, user_id, tab_id into o from public.orders where id = order_input;
  if not found then return null; end if;
  if not (coalesce(public.is_order_staff(), false) or o.user_id is null or coalesce(o.user_id = auth.uid(), false)) then return null; end if;
  if o.tab_id is not null then return (select invoice_id from public.tabs where id = o.tab_id); end if;
  return (select id from public.invoices where order_id = o.id);
end;
$function$;

-- Datos fiscales del cliente en una factura ya emitida (mientras no tenga comprobante fiscal).
create or replace function public.invoice_set_fiscal(invoice_input uuid, fiscal_input jsonb)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_pos_staff() then raise exception 'no autorizado'; end if;
  update public.invoices set fiscal = coalesce(fiscal_input, '{}'::jsonb) where id = invoice_input and ncf is null;
  return found;
end;
$function$;

-- ---------- Seguridad ----------
alter table public.tabs enable row level security;
alter table public.invoices enable row level security;
alter table public.waiter_ratings enable row level security;
alter table public.printers enable row level security;
alter table public.print_jobs enable row level security;

drop policy if exists "Staff read tabs" on public.tabs;
create policy "Staff read tabs" on public.tabs for select using (public.is_order_staff());
drop policy if exists "Read own invoices" on public.invoices;
create policy "Read own invoices" on public.invoices for select using (public.is_order_staff() or user_id = auth.uid());
drop policy if exists "Staff or own waiter read ratings" on public.waiter_ratings;
create policy "Staff or own waiter read ratings" on public.waiter_ratings for select using (public.is_staff() or waiter_id = auth.uid());
drop policy if exists "Staff read printers" on public.printers;
create policy "Staff read printers" on public.printers for select using (public.is_order_staff());
drop policy if exists "Owner manage printers" on public.printers;
create policy "Owner manage printers" on public.printers for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Staff read print jobs" on public.print_jobs;
create policy "Staff read print jobs" on public.print_jobs for select using (public.is_order_staff());
drop policy if exists "Staff add print jobs" on public.print_jobs;
create policy "Staff add print jobs" on public.print_jobs for insert with check (public.is_order_staff());
drop policy if exists "Staff update print jobs" on public.print_jobs;
create policy "Staff update print jobs" on public.print_jobs for update using (public.is_order_staff());

-- Cambios en vivo para caja, camareros, cocina e impresora virtual.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tabs') then
    alter publication supabase_realtime add table public.tabs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'print_jobs') then
    alter publication supabase_realtime add table public.print_jobs;
  end if;
end $$;

-- Marcar agotado: el personal de caja o camareros, solo esa columna.
create or replace function public.set_item_available(item_input uuid, available_input boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_pos_staff() then raise exception 'no autorizado'; end if;
  update public.menu_items set available = available_input where id = item_input;
  return found;
end;
$function$;

revoke execute on function public.invoice_for_new_order(), public.print_order_tickets() from public, anon, authenticated;
revoke execute on function public.invoice_business(), public.invoice_tax_lines(text, numeric, numeric),
  public.tab_json(public.tabs, boolean), public.tab_can_access(public.tabs, text) from public, anon, authenticated;
revoke execute on function public.tab_open(uuid, text, integer), public.tab_get(uuid, text), public.tab_add_order(uuid, text, jsonb),
  public.tab_request_bill(uuid, text), public.tab_call_waiter(uuid, text), public.tab_rate_waiter(uuid, text, integer, text, text),
  public.invoice_get(uuid, text), public.invoice_for_order(uuid), public.print_take(text), public.print_peek(text),
  public.print_ack(text, uuid, boolean, text), public.is_pos_staff() from public;
revoke execute on function public.tab_staff_update(uuid, text, text), public.tab_close(uuid, jsonb, numeric, numeric, jsonb, text),
  public.invoice_set_fiscal(uuid, jsonb), public.set_item_available(uuid, boolean), public.pos_waiters() from public, anon;
grant execute on function public.tab_open(uuid, text, integer), public.tab_get(uuid, text), public.tab_add_order(uuid, text, jsonb),
  public.tab_request_bill(uuid, text), public.tab_call_waiter(uuid, text), public.tab_rate_waiter(uuid, text, integer, text, text),
  public.invoice_get(uuid, text), public.invoice_for_order(uuid), public.print_take(text), public.print_peek(text),
  public.print_ack(text, uuid, boolean, text), public.is_pos_staff() to anon, authenticated;
grant execute on function public.tab_staff_update(uuid, text, text), public.tab_close(uuid, jsonb, numeric, numeric, jsonb, text),
  public.invoice_set_fiscal(uuid, jsonb), public.set_item_available(uuid, boolean), public.pos_waiters() to authenticated;

-- ---------- QR fijos de las mesas ----------
-- Cada mesa tiene un código corto permanente (/q/<código>) que redirige a su enlace. El QR impreso
-- lleva el código, así que nunca cambia: si la mesa se renombra, se borra o cambia el enlace, el
-- código se puede volver a apuntar a otra mesa sin reimprimir.
create table if not exists public.table_links (
  code text primary key check (code ~ '^[a-z0-9]{6}$'),
  table_id uuid unique references public.dining_tables(id) on delete set null,
  label text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.new_table_link_code()
returns text
language plpgsql
set search_path to 'public'
as $function$
declare
  abc text := 'abcdefghjkmnpqrstuvwxyz23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from public.table_links where code = c);
  end loop;
  return c;
end;
$function$;

create or replace function public.table_link_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.table_links (code, table_id, label) values (public.new_table_link_code(), new.id, new.label);
  elsif new.label is distinct from old.label then
    update public.table_links set label = new.label where table_id = new.id;
  end if;
  return new;
end;
$function$;
drop trigger if exists dining_tables_link on public.dining_tables;
create trigger dining_tables_link after insert or update of label on public.dining_tables
  for each row execute function public.table_link_sync();

-- las mesas que ya existían reciben su código
insert into public.table_links (code, table_id, label)
select public.new_table_link_code(), d.id, d.label from public.dining_tables d
where not exists (select 1 from public.table_links l where l.table_id = d.id);

-- Volver a apuntar un código a otra mesa (la mesa deja libre el código que tenía).
create or replace function public.table_link_assign(code_input text, table_input uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  lbl text;
begin
  if not public.is_staff() then raise exception 'Solo el dueño puede mover códigos'; end if;
  select label into lbl from public.dining_tables where id = table_input;
  if not found then raise exception 'Mesa no encontrada'; end if;
  update public.table_links set table_id = null where table_id = table_input and code <> code_input;
  update public.table_links set table_id = table_input, label = lbl where code = code_input;
  return found;
end;
$function$;

alter table public.table_links enable row level security;
drop policy if exists "Anyone can read table links" on public.table_links;
create policy "Anyone can read table links" on public.table_links for select using (true);
drop policy if exists "Owner deletes table links" on public.table_links;
create policy "Owner deletes table links" on public.table_links for delete using (public.is_staff());

revoke execute on function public.table_link_sync(), public.new_table_link_code() from public, anon, authenticated;
revoke execute on function public.table_link_assign(text, uuid) from public, anon;
grant execute on function public.table_link_assign(text, uuid) to authenticated;

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
