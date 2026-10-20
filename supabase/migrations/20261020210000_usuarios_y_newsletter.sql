-- Usuarios del negocio: aceptación del newsletter al registrarse, la lista para el dueño (con
-- correos, para exportar) y los pases a actualizar en Google Wallet.

alter table public.profiles add column if not exists newsletter boolean not null default false;
alter table public.profiles add column if not exists newsletter_at timestamptz;

-- Igual que antes, más el newsletter que se aceptó en el formulario de registro.
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
  accepted boolean := coalesce(new.raw_user_meta_data->>'newsletter', '') = 'true';
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

  insert into public.profiles (id, name, role, gender, age, newsletter, newsletter_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    assigned_role,
    nullif(new.raw_user_meta_data->>'gender', ''),
    case when (new.raw_user_meta_data->>'age') ~ '^[0-9]{1,3}$' then (new.raw_user_meta_data->>'age')::int end,
    accepted,
    case when accepted then now() end
  );
  return new;
end;
$function$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Todos los usuarios con su correo y lo que han hecho en el negocio. Solo el dueño.
create or replace function public.owner_users()
returns table (
  id uuid, email text, name text, role text, created_at timestamptz, newsletter boolean, newsletter_at timestamptz,
  gender text, age integer, orders bigint, spent numeric, last_order timestamptz,
  stamps integer, total_stamps integer, rewards integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_staff() then raise exception 'Solo el dueño puede ver los usuarios'; end if;
  return query
    select p.id, u.email::text, p.name, p.role, p.created_at, p.newsletter, p.newsletter_at, p.gender, p.age,
      coalesce(o.n, 0), coalesce(o.spent, 0), o.last_at,
      coalesce(c.stamps, 0), coalesce(c.total_stamps, 0), coalesce(c.rewards_earned, 0)
    from public.profiles p
    join auth.users u on u.id = p.id
    left join (
      select ord.user_id, count(*) as n, sum(ord.subtotal + ord.tax_amount) as spent, max(ord.created_at) as last_at
      from public.orders ord where ord.user_id is not null group by ord.user_id
    ) o on o.user_id = p.id
    left join public.loyalty_cards c on c.user_id = p.id
    order by p.created_at desc;
end;
$function$;

-- Pases a actualizar en Google Wallet (Google no avisa qué pases se guardaron: se intenta con cada uno).
create or replace function public.wallet_cards(order_input uuid, user_input uuid, all_input boolean)
returns table (serial text, auth_token text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_order_staff() then raise exception 'no autorizado'; end if;
  if all_input then
    if not public.is_staff() then raise exception 'no autorizado'; end if;
    return query select c.serial, c.auth_token from public.loyalty_cards c where c.total_stamps > 0 order by c.updated_at desc limit 1000;
    return;
  end if;
  return query
    select c.serial, c.auth_token from public.loyalty_cards c
    where c.user_id = coalesce(user_input, (select o.user_id from public.orders o where o.id = order_input));
end;
$function$;

revoke execute on function public.owner_users() from public, anon;
revoke execute on function public.wallet_cards(uuid, uuid, boolean) from public, anon;
grant execute on function public.owner_users(), public.wallet_cards(uuid, uuid, boolean) to authenticated;
