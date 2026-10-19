-- Códigos promocionales: el dueño los crea en /promociones y el cliente los canjea en el carrito.
-- Los clientes nunca leen la tabla: validan y canjean con check_promo_code / redeem_promo_code.

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,24}$'),
  title text not null default '',
  kind text not null check (kind in ('percent', 'amount', 'free_item', 'message')),
  value numeric not null default 0 check (value >= 0),
  item_id uuid references public.menu_items(id) on delete set null,
  min_subtotal numeric not null default 0 check (min_subtotal >= 0),
  redeem_message text not null default '' check (length(redeem_message) <= 280),
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  once_per_customer boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100),
  check (starts_at is null or ends_at is null or starts_at < ends_at)
);

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.promo_codes(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists promo_redemptions_code_idx on public.promo_redemptions (code_id, created_at desc);

-- Copia del código en cada pedido ({ code_id, code, kind, discount }): las ventas quedan
-- registradas aunque el código se elimine después.
alter table public.orders add column if not exists promo jsonb;
create index if not exists orders_promo_code_idx on public.orders ((promo->>'code_id')) where promo is not null;

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

drop policy if exists "Staff manage promo codes" on public.promo_codes;
create policy "Staff manage promo codes" on public.promo_codes for all
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Staff view promo redemptions" on public.promo_redemptions;
create policy "Staff view promo redemptions" on public.promo_redemptions for select
  using (public.is_staff());

-- Revisa un código para un pedido de `subtotal_input` sin gastarlo. Con lock_row, además lo
-- canjea (lo usa redeem_promo_code). Devuelve { ok, ... } o { ok: false, reason }.
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

create or replace function public.check_promo_code(code_input text, subtotal_input numeric)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$ select public.promo_code_check(code_input, subtotal_input, false) $function$;

create or replace function public.redeem_promo_code(code_input text, subtotal_input numeric)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$ select public.promo_code_check(code_input, subtotal_input, true) $function$;

revoke execute on function public.promo_code_check(text, numeric, boolean) from public, anon, authenticated;
revoke execute on function public.check_promo_code(text, numeric) from public;
revoke execute on function public.redeem_promo_code(text, numeric) from public;
grant execute on function public.check_promo_code(text, numeric), public.redeem_promo_code(text, numeric) to anon, authenticated;
