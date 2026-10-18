-- Base de datos completa de un restaurante.
--
-- Crea desde cero todo lo que la app necesita: tablas, reglas de seguridad (RLS), funciones,
-- el disparador que crea el perfil al registrarse, el espacio de fotos y los datos iniciales.
-- Un restaurante nuevo empieza con este archivo y luego recibe las migraciones posteriores en orden.
-- Nunca se edita una migración ya aplicada: cada cambio nuevo va en un archivo nuevo.

-- =========================================================
-- Tablas
-- =========================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  role text not null default 'cliente' check (role in ('cliente', 'staff', 'comensal')),
  gender text,
  age integer,
  avatar_url text,
  avatar_icon text,
  avatar_tint text,
  gift_card_balance numeric not null default 0,
  created_at timestamptz not null default now()
);

create table public.branches (
  id text primary key check (id ~ '^[a-z0-9_]{1,40}$'),
  name text not null,
  address text not null default '',
  phone text not null default '',
  hours text not null default '',
  map_url text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default 'smoker',
  tint text not null default 'manana',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index categories_name_key on public.categories (name);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'General',
  icon text not null default 'smoker',
  price numeric not null default 0,
  cost numeric not null default 0,
  description text default '',
  image_url text default '',
  tags text default '',
  featured boolean not null default false,
  is_beverage boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index menu_items_name_category_key on public.menu_items (name, category);

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.menu_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.site_settings (
  id integer primary key default 1 check (id = 1),
  brand_name text not null default 'Mi Restaurante',
  tagline text not null default '',
  description text not null default '',
  logo_url text not null default '',
  primary_color text not null default '#D5402C' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  city text not null default '',
  address text not null default '',
  phone text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  instagram text not null default '',
  facebook text not null default '',
  hours text not null default '',
  currency_symbol text not null default '$',
  currency_position text not null default 'before' check (currency_position in ('before', 'after')),
  locale text not null default 'es-DO',
  gift_card_prefix text not null default 'GC',
  setup_completed boolean not null default false,
  updated_at timestamptz not null default now(),
  order_messages jsonb not null default '{}'::jsonb
);

create table public.site_images (
  key text primary key,
  url text not null default '',
  updated_at timestamptz not null default now()
);

create table public.site_content (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

create table public.nosotros_pilares (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  body text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index nosotros_pilares_title_key on public.nosotros_pilares (title);

create table public.nosotros_cultura (
  id uuid primary key default gen_random_uuid(),
  tag text not null default '',
  title text not null default '',
  body text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index nosotros_cultura_title_key on public.nosotros_cultura (title);

create table public.nosotros_gallery (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index nosotros_gallery_image_url_key on public.nosotros_gallery (image_url);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text default '',
  image_url text default '',
  cta_text text default 'Ver menú',
  cta_link text default '/menu',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index offers_title_key on public.offers (title);

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.early_bird_settings (
  branch text primary key,
  enabled boolean not null default false,
  start_time time not null default '07:00:00',
  end_time time not null default '09:00:00',
  prize_description text not null default 'Una bebida gratis',
  prize_item_id uuid references public.menu_items(id) on delete set null,
  discount_any_beverage boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.early_bird_wins (
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  win_date date not null default current_date,
  customer_name text,
  user_id uuid references auth.users(id) on delete set null,
  order_id uuid,
  created_at timestamptz not null default now(),
  unique (branch, win_date)
);

create table public.avatars (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.gift_card_designs (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  image_url text not null,
  scope text not null default 'global',
  owner_user_id uuid references auth.users(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index gift_card_designs_name_key on public.gift_card_designs (name);

create table public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  amount numeric not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'activa', 'canjeada')),
  is_gift boolean not null default false,
  buyer_user_id uuid references auth.users(id) on delete set null,
  buyer_name text,
  recipient_email text,
  design_id uuid references public.gift_card_designs(id) on delete set null,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_by_name text,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null default '',
  table_number text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  tax_amount numeric not null default 0,
  payment_method text,
  payment_breakdown jsonb not null default '[]'::jsonb,
  user_id uuid references auth.users(id) on delete set null,
  branch text,
  customer_gender text,
  customer_age integer,
  party_size integer not null default 1,
  status text not null default 'nueva' check (status in ('nueva', 'en_preparacion', 'lista', 'entregada')),
  created_at timestamptz not null default now(),
  push_ref text check (push_ref is null or length(push_ref) <= 80)
);

create table public.tax_settings (
  branch text primary key,
  charges jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.team_invites (
  email text primary key,
  role text not null check (role in ('staff', 'comensal')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

-- =========================================================
-- Funciones
-- =========================================================

create or replace function public.is_staff()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'staff');
$function$;

create or replace function public.is_order_staff()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('staff', 'comensal'));
$function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  assigned_role text := 'cliente';
  invite_role text;
  invite_expires timestamptz;
begin
  -- Seguridad: el rol NUNCA se toma de lo que mande el navegador.
  -- La primera cuenta del negocio es la dueña; las demás son clientes, salvo que el
  -- dueño haya invitado ese correo (team_invites).
  perform pg_advisory_xact_lock(7001);
  if not exists (select 1 from public.profiles where role = 'staff') then
    assigned_role := 'staff';
  else
    delete from public.team_invites
    where email = lower(btrim(coalesce(new.email, '')))
    returning role, expires_at into invite_role, invite_expires;
    -- una invitación vencida se borra pero no se aplica
    if invite_role is not null and invite_expires > now() then
      assigned_role := invite_role;
    end if;
  end if;

  insert into public.profiles (id, name, role, gender, age)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    assigned_role,
    nullif(new.raw_user_meta_data->>'gender', ''),
    case when (new.raw_user_meta_data->>'age') ~ '^[0-9]{1,3}$' then (new.raw_user_meta_data->>'age')::int end
  );
  return new;
end;
$function$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.guest_orders(p_ids uuid[])
returns table(id uuid, customer_name text, table_number text, items jsonb, subtotal numeric, tax_amount numeric, payment_method text, branch text, party_size integer, status text, created_at timestamptz)
language sql
stable security definer
set search_path to 'public'
as $function$
  select o.id, o.customer_name, o.table_number, o.items, o.subtotal, o.tax_amount, o.payment_method,
         o.branch, o.party_size, o.status, o.created_at
  from public.orders o
  where o.id = any (coalesce(p_ids[1:20], array[]::uuid[]))
    and o.user_id is null
    and o.status <> 'entregada'
    and o.created_at > now() - interval '12 hours'
  order by o.created_at desc
$function$;

create or replace function public.pay_with_gift_card(amount_input numeric)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  bal numeric;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para pagar con gift card.';
  end if;
  if amount_input is null or amount_input < 0 then
    raise exception 'Monto no válido.';
  end if;

  select gift_card_balance into bal from public.profiles where id = auth.uid() for update;

  if bal is null or bal < amount_input then
    raise exception 'Balance de gift card insuficiente.';
  end if;

  update public.profiles set gift_card_balance = gift_card_balance - amount_input where id = auth.uid();
end;
$function$;

create or replace function public.redeem_gift_card(code_input text)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  gc record;
  redeemer_name text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para canjear una gift card.';
  end if;

  select * into gc from public.gift_cards where upper(code) = upper(trim(code_input)) for update;

  if not found then
    raise exception 'Ese código no existe.';
  end if;
  if gc.status = 'canjeada' then
    raise exception 'Esa gift card ya fue canjeada.';
  end if;
  if gc.status = 'pendiente' then
    raise exception 'Esa gift card todavía no está activa. Se activa cuando el negocio confirma el pago.';
  end if;

  select name into redeemer_name from public.profiles where id = auth.uid();

  update public.gift_cards
  set status = 'canjeada', redeemed_by = auth.uid(), redeemed_by_name = coalesce(redeemer_name, ''), redeemed_at = now()
  where id = gc.id;

  update public.profiles set gift_card_balance = gift_card_balance + gc.amount where id = auth.uid();

  return gc.amount;
end;
$function$;

create or replace function public.push_target(p_order uuid)
returns table(external_id text, customer_name text, table_number text, status text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_order_staff() then
    raise exception 'no autorizado';
  end if;
  return query
  select coalesce(o.user_id::text, case when left(o.push_ref, 6) = 'guest_' then o.push_ref end),
         o.customer_name, o.table_number, o.status
  from public.orders o
  where o.id = p_order;
end
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
  if p_role not in ('staff', 'comensal') then raise exception 'Rol no válido'; end if;
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

create or replace function public.team_cancel_invite(p_email text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_staff() then raise exception 'Solo el dueño puede cancelar invitaciones'; end if;
  delete from public.team_invites where email = lower(btrim(coalesce(p_email, '')));
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
  where p.role in ('staff', 'comensal')
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
  where id = p_user and role in ('staff', 'comensal');
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
  if p_role not in ('staff', 'comensal') then raise exception 'Rol no válido'; end if;
  if p_user = auth.uid() then raise exception 'No puedes cambiar tu propio rol'; end if;
  update public.profiles set role = p_role
  where id = p_user and role in ('staff', 'comensal');
  if not found then raise exception 'Esa persona no está en el equipo'; end if;
end;
$function$;

create or replace function public.try_claim_early_bird(branch_input text, order_id_input uuid, customer_name_input text, user_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  today date := current_date;
  now_time time := current_time;
  win record;
begin
  if branch_input is null then
    return null;
  end if;

  select * into s from public.early_bird_settings where branch = branch_input;
  if not found or not s.enabled then
    return null;
  end if;

  -- ventana horaria (usa la hora del servidor de Supabase, en UTC salvo que
  -- ajustes la zona horaria del proyecto)
  if s.start_time <= s.end_time then
    if now_time < s.start_time or now_time > s.end_time then
      return null;
    end if;
  else
    if now_time < s.start_time and now_time > s.end_time then
      return null;
    end if;
  end if;

  select * into win from public.early_bird_wins where branch = branch_input and win_date = today;
  if found then
    return jsonb_build_object('outcome', 'in_window_no_win', 'prize_description', s.prize_description);
  end if;

  begin
    insert into public.early_bird_wins (branch, win_date, customer_name, user_id, order_id)
    values (branch_input, today, customer_name_input, user_id_input, order_id_input);
  exception when unique_violation then
    return jsonb_build_object('outcome', 'in_window_no_win', 'prize_description', s.prize_description);
  end;

  return jsonb_build_object(
    'outcome', 'winner',
    'prize_description', s.prize_description,
    'discount_any_beverage', s.discount_any_beverage,
    'prize_item_id', s.prize_item_id
  );
end;
$function$;

-- Quién puede llamar cada función. Las que solo sirven con sesión iniciada quedan fuera
-- del alcance de visitantes anónimos; handle_new_user solo la usa el disparador.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.pay_with_gift_card(numeric) from public, anon;
revoke execute on function public.redeem_gift_card(text) from public, anon;
revoke execute on function public.push_target(uuid) from public, anon;
revoke execute on function public.team_add(text, text) from public, anon;
revoke execute on function public.team_cancel_invite(text) from public, anon;
revoke execute on function public.team_list() from public, anon;
revoke execute on function public.team_remove(uuid) from public, anon;
revoke execute on function public.team_set_role(uuid, text) from public, anon;
revoke execute on function public.guest_orders(uuid[]) from public;
grant execute on function public.pay_with_gift_card(numeric), public.redeem_gift_card(text), public.push_target(uuid),
  public.team_add(text, text), public.team_cancel_invite(text), public.team_list(), public.team_remove(uuid),
  public.team_set_role(uuid, text) to authenticated;
grant execute on function public.guest_orders(uuid[]), public.try_claim_early_bird(text, uuid, text, uuid),
  public.is_staff(), public.is_order_staff() to anon, authenticated;

-- =========================================================
-- Seguridad por filas (RLS)
-- =========================================================

alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.favorites enable row level security;
alter table public.site_settings enable row level security;
alter table public.site_images enable row level security;
alter table public.site_content enable row level security;
alter table public.nosotros_pilares enable row level security;
alter table public.nosotros_cultura enable row level security;
alter table public.nosotros_gallery enable row level security;
alter table public.offers enable row level security;
alter table public.dining_tables enable row level security;
alter table public.early_bird_settings enable row level security;
alter table public.early_bird_wins enable row level security;
alter table public.avatars enable row level security;
alter table public.gift_card_designs enable row level security;
alter table public.gift_cards enable row level security;
alter table public.orders enable row level security;
alter table public.tax_settings enable row level security;
alter table public.team_invites enable row level security; -- sin políticas: solo se usa desde las funciones team_*
revoke all on public.team_invites from anon, authenticated;

create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Staff can view all profiles" on public.profiles for select using (public.is_staff());
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Cada persona solo puede cambiar estos campos de su perfil: el rol y el saldo de gift card no.
revoke update on public.profiles from anon, authenticated;
grant update (name, gender, age, avatar_url, avatar_icon, avatar_tint) on public.profiles to authenticated;

create policy "Anyone can view branches" on public.branches for select using (true);
create policy "Staff can insert branches" on public.branches for insert with check (public.is_staff());
create policy "Staff can update branches" on public.branches for update using (public.is_staff());
create policy "Staff can delete branches" on public.branches for delete using (public.is_staff());

create policy "Anyone can view categories" on public.categories for select using (true);
create policy "Staff can insert categories" on public.categories for insert with check (public.is_staff());
create policy "Staff can update categories" on public.categories for update using (public.is_staff());
create policy "Staff can delete categories" on public.categories for delete using (public.is_staff());

create policy "Anyone can view menu" on public.menu_items for select using (true);
create policy "Staff can insert menu items" on public.menu_items for insert with check (public.is_staff());
create policy "Staff can update menu items" on public.menu_items for update using (public.is_staff());
create policy "Staff can delete menu items" on public.menu_items for delete using (public.is_staff());

create policy "Users can view own favorites" on public.favorites for select using (auth.uid() = user_id);
create policy "Users can add own favorites" on public.favorites for insert with check (auth.uid() = user_id);
create policy "Users can remove own favorites" on public.favorites for delete using (auth.uid() = user_id);

create policy "Anyone can view site settings" on public.site_settings for select using (true);
create policy "Staff can insert site settings" on public.site_settings for insert with check (public.is_staff());
create policy "Staff can update site settings" on public.site_settings for update using (public.is_staff());

create policy "Anyone can view site images" on public.site_images for select using (true);
create policy "Staff can update site images" on public.site_images for update using (public.is_staff());

create policy "Anyone can view site content" on public.site_content for select using (true);
create policy "Staff can upsert site content" on public.site_content for insert with check (public.is_staff());
create policy "Staff can update site content" on public.site_content for update using (public.is_staff());

create policy "Anyone can view pilares" on public.nosotros_pilares for select using (true);
create policy "Staff can insert pilares" on public.nosotros_pilares for insert with check (public.is_staff());
create policy "Staff can update pilares" on public.nosotros_pilares for update using (public.is_staff());
create policy "Staff can delete pilares" on public.nosotros_pilares for delete using (public.is_staff());

create policy "Anyone can view cultura" on public.nosotros_cultura for select using (true);
create policy "Staff can insert cultura" on public.nosotros_cultura for insert with check (public.is_staff());
create policy "Staff can update cultura" on public.nosotros_cultura for update using (public.is_staff());
create policy "Staff can delete cultura" on public.nosotros_cultura for delete using (public.is_staff());

create policy "Anyone can view nosotros gallery" on public.nosotros_gallery for select using (true);
create policy "Staff can insert nosotros gallery" on public.nosotros_gallery for insert with check (public.is_staff());
create policy "Staff can update nosotros gallery" on public.nosotros_gallery for update using (public.is_staff());
create policy "Staff can delete nosotros gallery" on public.nosotros_gallery for delete using (public.is_staff());

create policy "Anyone can view offers" on public.offers for select using (true);
create policy "Staff can insert offers" on public.offers for insert with check (public.is_staff());
create policy "Staff can update offers" on public.offers for update using (public.is_staff());
create policy "Staff can delete offers" on public.offers for delete using (public.is_staff());

create policy "Anyone can view tables" on public.dining_tables for select using (true);
create policy "Staff can insert tables" on public.dining_tables for insert with check (public.is_staff());
create policy "Staff can update tables" on public.dining_tables for update using (public.is_staff());
create policy "Staff can delete tables" on public.dining_tables for delete using (public.is_staff());

create policy "Anyone can view early bird settings" on public.early_bird_settings for select using (true);
create policy "Staff can insert early bird settings" on public.early_bird_settings for insert with check (public.is_staff());
create policy "Staff can update early bird settings" on public.early_bird_settings for update using (public.is_staff());

create policy "Staff can view early bird wins" on public.early_bird_wins for select using (public.is_staff());

create policy "Anyone can view avatars" on public.avatars for select using (true);
create policy "Staff can insert avatars" on public.avatars for insert with check (public.is_staff());
create policy "Staff can delete avatars" on public.avatars for delete using (public.is_staff());

create policy "Anyone can view gift card designs" on public.gift_card_designs for select using (true);
create policy "Staff can insert gift card designs" on public.gift_card_designs for insert with check (public.is_staff());
create policy "Staff can update gift card designs" on public.gift_card_designs for update using (public.is_staff());
create policy "Staff can delete gift card designs" on public.gift_card_designs for delete using (public.is_staff());

create policy "Users can buy gift cards" on public.gift_cards for insert
  with check ((auth.uid() is not null) and (((buyer_user_id = auth.uid()) and (status = 'pendiente')) or public.is_staff()));
create policy "Users can view own gift cards" on public.gift_cards for select
  using ((buyer_user_id = auth.uid()) or (redeemed_by = auth.uid()) or (recipient_email = (auth.jwt() ->> 'email')) or public.is_staff());
create policy "Staff can update gift cards" on public.gift_cards for update using (public.is_staff());

create policy "Anyone can place an order" on public.orders for insert
  with check ((user_id is null or user_id = auth.uid()) and status = 'nueva');
create policy "Users can view own orders" on public.orders for select using ((user_id = auth.uid()) or public.is_order_staff());
create policy "Order staff can update orders" on public.orders for update using (public.is_order_staff());
create policy "Order staff can delete orders" on public.orders for delete using (public.is_order_staff());

create policy "Anyone can view tax settings" on public.tax_settings for select using (true);
create policy "Staff can insert tax settings" on public.tax_settings for insert with check (public.is_staff());
create policy "Staff can update tax settings" on public.tax_settings for update using (public.is_staff());

-- =========================================================
-- Tiempo real: Órdenes y gift cards se actualizan solas en pantalla
-- =========================================================

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'gift_cards') then
    alter publication supabase_realtime add table public.gift_cards;
  end if;
end $$;

-- =========================================================
-- Fotos: logos, portadas, productos, avatares y diseños de gift card
-- =========================================================

insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
on conflict (id) do nothing;

drop policy if exists "Public read access to fotos" on storage.objects;
drop policy if exists "Staff can upload to fotos" on storage.objects;
drop policy if exists "Staff can update fotos" on storage.objects;
drop policy if exists "Staff can delete fotos" on storage.objects;
create policy "Public read access to fotos" on storage.objects for select using (bucket_id = 'fotos');
create policy "Staff can upload to fotos" on storage.objects for insert with check (bucket_id = 'fotos' and public.is_staff());
create policy "Staff can update fotos" on storage.objects for update using (bucket_id = 'fotos' and public.is_staff());
create policy "Staff can delete fotos" on storage.objects for delete using (bucket_id = 'fotos' and public.is_staff());

-- =========================================================
-- Datos iniciales que la app espera encontrar
-- =========================================================

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

-- Las fotos del sitio se reemplazan con "update", así que cada espacio debe existir desde el inicio.
insert into public.site_images (key) values
  ('welcome'), ('hero'), ('founder'), ('azotea'), ('gallery-0'), ('gallery-1'), ('gallery-2'), ('map')
on conflict (key) do nothing;
