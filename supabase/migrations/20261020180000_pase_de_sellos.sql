-- Pase de sellos: cada pedido confirmado de un cliente con cuenta suma un sello. Al completar
-- el pase se le crea un código promocional personal (su premio). El pase también se puede
-- agregar a Apple Wallet: las funciones wallet_* las usa /api/wallet con el token de cada pase.

create table if not exists public.loyalty_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  title text not null default 'Pase de sellos' check (length(title) <= 40),
  description text not null default '' check (length(description) <= 300),
  stamps_required integer not null default 8 check (stamps_required between 3 and 20),
  reward_label text not null default 'Un regalo de la casa' check (length(reward_label) <= 60),
  reward_kind text not null default 'message' check (reward_kind in ('percent', 'amount', 'free_item', 'message')),
  reward_value numeric not null default 0 check (reward_value >= 0),
  reward_item_id uuid references public.menu_items(id) on delete set null,
  reward_message text not null default '' check (length(reward_message) <= 280),
  reward_days integer check (reward_days is null or reward_days > 0),
  min_subtotal numeric not null default 0 check (min_subtotal >= 0),
  max_per_day integer not null default 0 check (max_per_day >= 0),
  stamp_icon text not null default 'star',
  stamp_image_url text not null default '',
  logo_url text not null default '',
  strip_image_url text not null default '',
  bg_color text not null default '#241C13',
  fg_color text not null default '#FBF8F2',
  label_color text not null default '#C9B79C',
  stamp_color text not null default '#D5402C',
  terms text not null default '' check (length(terms) <= 600),
  updated_at timestamptz not null default now(),
  check (reward_kind <> 'percent' or reward_value <= 100)
);
insert into public.loyalty_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  serial text not null unique default replace(gen_random_uuid()::text, '-', ''),
  auth_token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  stamps integer not null default 0 check (stamps >= 0),
  total_stamps integer not null default 0,
  rewards_earned integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_events (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.loyalty_cards(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('stamp', 'manual', 'reward')),
  order_id uuid,
  promo_code_id uuid references public.promo_codes(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists loyalty_events_one_stamp_per_order on public.loyalty_events (order_id) where kind = 'stamp';
create index if not exists loyalty_events_card_idx on public.loyalty_events (card_id, created_at desc);

-- Aparatos con el pase en Apple Wallet (para avisarles cuando cambia).
create table if not exists public.wallet_registrations (
  device_id text not null check (length(device_id) <= 128),
  serial text not null references public.loyalty_cards(serial) on delete cascade,
  push_token text not null check (length(push_token) <= 200),
  created_at timestamptz not null default now(),
  primary key (device_id, serial)
);

-- Los premios son códigos promocionales personales: solo los puede usar su dueño.
alter table public.promo_codes add column if not exists owner_user_id uuid references auth.users(id) on delete cascade;
alter table public.promo_codes add column if not exists source text not null default 'manual' check (source in ('manual', 'loyalty'));

alter table public.loyalty_settings enable row level security;
alter table public.loyalty_cards enable row level security;
alter table public.loyalty_events enable row level security;
alter table public.wallet_registrations enable row level security; -- sin políticas: solo las funciones wallet_*

drop policy if exists "Anyone can read loyalty settings" on public.loyalty_settings;
create policy "Anyone can read loyalty settings" on public.loyalty_settings for select using (true);
drop policy if exists "Staff update loyalty settings" on public.loyalty_settings;
create policy "Staff update loyalty settings" on public.loyalty_settings for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Own or staff read loyalty cards" on public.loyalty_cards;
create policy "Own or staff read loyalty cards" on public.loyalty_cards for select using (user_id = auth.uid() or public.is_staff());
drop policy if exists "Own or staff read loyalty events" on public.loyalty_events;
create policy "Own or staff read loyalty events" on public.loyalty_events for select using (user_id = auth.uid() or public.is_staff());

-- La revisión de códigos ahora también rechaza los premios de otra persona.
create or replace function public.promo_code_check(code_input text, subtotal_input numeric, lock_row boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c record;
  used integer;
begin
  if lock_row then
    select * into c from public.promo_codes where code = upper(trim(code_input)) for update;
  else
    select * into c from public.promo_codes where code = upper(trim(code_input));
  end if;
  if not found or not c.active then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if c.owner_user_id is not null and c.owner_user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'reason', case when auth.uid() is null then 'login' else 'not_found' end);
  end if;
  if c.starts_at is not null and now() < c.starts_at then
    return jsonb_build_object('ok', false, 'reason', 'not_started', 'starts_at', c.starts_at);
  end if;
  if c.ends_at is not null and now() >= c.ends_at then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if c.max_uses is not null then
    select count(*) into used from public.promo_redemptions where code_id = c.id;
    if used >= c.max_uses then
      return jsonb_build_object('ok', false, 'reason', 'sold_out');
    end if;
  end if;
  if c.once_per_customer then
    if auth.uid() is null then
      return jsonb_build_object('ok', false, 'reason', 'login');
    end if;
    if exists (select 1 from public.promo_redemptions where code_id = c.id and user_id = auth.uid()) then
      return jsonb_build_object('ok', false, 'reason', 'already_used');
    end if;
  end if;
  if coalesce(subtotal_input, 0) < c.min_subtotal then
    return jsonb_build_object('ok', false, 'reason', 'min_subtotal', 'min_subtotal', c.min_subtotal);
  end if;

  if lock_row then
    insert into public.promo_redemptions (code_id, user_id) values (c.id, auth.uid());
  end if;

  return jsonb_build_object(
    'ok', true, 'id', c.id, 'code', c.code, 'kind', c.kind, 'value', c.value,
    'item_id', c.item_id, 'min_subtotal', c.min_subtotal, 'message', c.redeem_message
  );
end;
$function$;

-- Suma un sello a un pase; si se completa, lo reinicia y crea el código del premio.
create or replace function public.loyalty_add_stamp(card_id_input uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  card record;
  new_code text;
  promo_id uuid;
begin
  select * into s from public.loyalty_settings where id = 1;
  update public.loyalty_cards
    set stamps = stamps + 1, total_stamps = total_stamps + 1, updated_at = now()
    where id = card_id_input
    returning * into card;
  if card.stamps < s.stamps_required then
    return;
  end if;
  loop
    new_code := 'PREMIO-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.promo_codes where code = new_code);
  end loop;
  insert into public.promo_codes (code, title, kind, value, item_id, redeem_message, ends_at, max_uses, once_per_customer, owner_user_id, source)
  values (
    new_code, s.reward_label, s.reward_kind,
    case when s.reward_kind in ('percent', 'amount') then s.reward_value else 0 end,
    case when s.reward_kind = 'free_item' then s.reward_item_id end,
    s.reward_message,
    case when s.reward_days is not null then now() + make_interval(days => s.reward_days) end,
    1, true, card.user_id, 'loyalty'
  )
  returning id into promo_id;
  update public.loyalty_cards
    set stamps = stamps - s.stamps_required, rewards_earned = rewards_earned + 1, updated_at = now()
    where id = card.id;
  insert into public.loyalty_events (card_id, user_id, kind, promo_code_id) values (card.id, card.user_id, 'reward', promo_id);
end;
$function$;

-- Sello por pedido: cuando el local lo confirma (deja de estar "nueva").
create or replace function public.loyalty_stamp_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  card record;
  today_count integer;
begin
  if new.user_id is null or old.status <> 'nueva' or new.status = 'nueva' then
    return new;
  end if;
  select * into s from public.loyalty_settings where id = 1;
  if not found or not s.enabled or coalesce(new.subtotal, 0) < s.min_subtotal then
    return new;
  end if;
  insert into public.loyalty_cards (user_id) values (new.user_id) on conflict (user_id) do nothing;
  select * into card from public.loyalty_cards where user_id = new.user_id for update;
  if s.max_per_day > 0 then
    select count(*) into today_count from public.loyalty_events
      where card_id = card.id and kind in ('stamp', 'manual') and created_at >= date_trunc('day', now());
    if today_count >= s.max_per_day then
      return new;
    end if;
  end if;
  begin
    insert into public.loyalty_events (card_id, user_id, kind, order_id) values (card.id, new.user_id, 'stamp', new.id);
  exception when unique_violation then
    return new; -- ese pedido ya dio su sello
  end;
  perform public.loyalty_add_stamp(card.id);
  return new;
end;
$function$;

drop trigger if exists orders_loyalty_stamp on public.orders;
create trigger orders_loyalty_stamp
  after update of status on public.orders
  for each row execute function public.loyalty_stamp_order();

-- El dueño da un sello a mano (por ejemplo, a un pedido que no se hizo en la app).
create or replace function public.loyalty_manual_stamp(user_id_input uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  card record;
begin
  if not public.is_staff() then raise exception 'Solo el dueño puede dar sellos'; end if;
  insert into public.loyalty_cards (user_id) values (user_id_input) on conflict (user_id) do nothing;
  select * into card from public.loyalty_cards where user_id = user_id_input for update;
  insert into public.loyalty_events (card_id, user_id, kind) values (card.id, user_id_input, 'manual');
  perform public.loyalty_add_stamp(card.id);
  select * into card from public.loyalty_cards where id = card.id;
  return jsonb_build_object('stamps', card.stamps, 'rewards_earned', card.rewards_earned, 'serial', card.serial);
end;
$function$;

-- El pase del cliente que inició sesión, con sus premios y lo último que pasó.
create or replace function public.my_loyalty()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  card record;
begin
  if auth.uid() is null then return null; end if;
  insert into public.loyalty_cards (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into card from public.loyalty_cards where user_id = auth.uid();
  return jsonb_build_object(
    'stamps', card.stamps, 'total_stamps', card.total_stamps, 'rewards_earned', card.rewards_earned,
    'serial', card.serial, 'auth_token', card.auth_token, 'created_at', card.created_at,
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', p.code, 'title', p.title, 'ends_at', p.ends_at, 'created_at', p.created_at,
        'used', exists (select 1 from public.promo_redemptions r where r.code_id = p.id)
      ) order by p.created_at desc)
      from public.promo_codes p where p.owner_user_id = auth.uid() and p.source = 'loyalty'
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('kind', e.kind, 'created_at', e.created_at) order by e.created_at desc)
      from (select * from public.loyalty_events where card_id = card.id order by created_at desc limit 12) e
    ), '[]'::jsonb)
  );
end;
$function$;

-- ---------- Apple Wallet ----------

-- Datos para armar el .pkpass de un pase (con su token).
create or replace function public.wallet_pass(serial_input text, token_input text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  card record;
  st record;
  s record;
begin
  select * into card from public.loyalty_cards where serial = serial_input and auth_token = token_input;
  if not found then return null; end if;
  select * into s from public.loyalty_settings where id = 1;
  select brand_name, logo_url, primary_color into st from public.site_settings where id = 1;
  return jsonb_build_object(
    'serial', card.serial, 'auth_token', card.auth_token, 'stamps', card.stamps, 'total_stamps', card.total_stamps,
    'rewards_earned', card.rewards_earned,
    'updated_at', greatest(card.updated_at, s.updated_at),
    'customer_name', (select name from public.profiles where id = card.user_id),
    'brand_name', st.brand_name, 'brand_logo_url', st.logo_url,
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object('code', p.code, 'title', p.title, 'ends_at', p.ends_at) order by p.created_at)
      from public.promo_codes p
      where p.owner_user_id = card.user_id and p.source = 'loyalty' and p.active
        and (p.ends_at is null or p.ends_at > now())
        and not exists (select 1 from public.promo_redemptions r where r.code_id = p.id)
    ), '[]'::jsonb),
    'settings', to_jsonb(s)
  );
end;
$function$;

create or replace function public.wallet_register(device_input text, push_token_input text, serial_input text, token_input text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.loyalty_cards where serial = serial_input and auth_token = token_input) then
    return 'unauthorized';
  end if;
  if exists (select 1 from public.wallet_registrations where device_id = device_input and serial = serial_input) then
    update public.wallet_registrations set push_token = push_token_input where device_id = device_input and serial = serial_input;
    return 'exists';
  end if;
  insert into public.wallet_registrations (device_id, serial, push_token) values (device_input, serial_input, push_token_input);
  return 'created';
end;
$function$;

create or replace function public.wallet_unregister(device_input text, serial_input text, token_input text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.loyalty_cards where serial = serial_input and auth_token = token_input) then
    return 'unauthorized';
  end if;
  delete from public.wallet_registrations where device_id = device_input and serial = serial_input;
  return 'deleted';
end;
$function$;

-- Pases de un aparato que cambiaron desde `since` (o todos si es null).
create or replace function public.wallet_updated_serials(device_input text, since_input timestamptz)
returns table (serial text, updated_at timestamptz)
language sql
security definer
set search_path to 'public'
as $function$
  select c.serial, greatest(c.updated_at, s.updated_at)
  from public.wallet_registrations w
  join public.loyalty_cards c on c.serial = w.serial
  cross join public.loyalty_settings s
  where w.device_id = device_input
    and (since_input is null or greatest(c.updated_at, s.updated_at) > since_input);
$function$;

-- A qué aparatos avisar: el pase del cliente de un pedido, el de un cliente, o todos (cambio de diseño).
create or replace function public.wallet_push_tokens(order_input uuid, user_input uuid, all_input boolean)
returns table (push_token text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_order_staff() then raise exception 'no autorizado'; end if;
  if all_input then
    if not public.is_staff() then raise exception 'no autorizado'; end if;
    return query select distinct w.push_token from public.wallet_registrations w;
    return;
  end if;
  return query
    select distinct w.push_token
    from public.wallet_registrations w
    join public.loyalty_cards c on c.serial = w.serial
    where c.user_id = coalesce(user_input, (select o.user_id from public.orders o where o.id = order_input));
end;
$function$;

-- La fecha del diseño sube al guardarlo, para que Wallet sepa que debe actualizar los pases.
create or replace function public.touch_loyalty_settings()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
drop trigger if exists loyalty_settings_touch on public.loyalty_settings;
create trigger loyalty_settings_touch before update on public.loyalty_settings
  for each row execute function public.touch_loyalty_settings();

revoke execute on function public.loyalty_add_stamp(uuid) from public, anon, authenticated;
revoke execute on function public.loyalty_stamp_order() from public, anon, authenticated;
revoke execute on function public.touch_loyalty_settings() from public, anon, authenticated;
revoke execute on function public.loyalty_manual_stamp(uuid) from public, anon;
revoke execute on function public.my_loyalty() from public, anon;
revoke execute on function public.wallet_push_tokens(uuid, uuid, boolean) from public, anon;
revoke execute on function public.wallet_pass(text, text), public.wallet_register(text, text, text, text),
  public.wallet_unregister(text, text, text), public.wallet_updated_serials(text, timestamptz) from public;
grant execute on function public.loyalty_manual_stamp(uuid), public.my_loyalty(), public.wallet_push_tokens(uuid, uuid, boolean) to authenticated;
grant execute on function public.wallet_pass(text, text), public.wallet_register(text, text, text, text),
  public.wallet_unregister(text, text, text), public.wallet_updated_serials(text, timestamptz) to anon, authenticated;
