-- Darse de baja del newsletter: desde Cuenta, o sin iniciar sesión con el enlace personal que va
-- en cada correo (/baja?t=…). El enlace sale en la exportación CSV de Usuarios.

alter table public.profiles add column if not exists newsletter_token text unique default replace(gen_random_uuid()::text, '-', '');
alter table public.profiles add column if not exists newsletter_unsub_at timestamptz;
update public.profiles set newsletter_token = replace(gen_random_uuid()::text, '-', '') where newsletter_token is null;

-- El cliente con sesión activa o desactiva los correos.
create or replace function public.set_newsletter(on_input boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  update public.profiles
    set newsletter = on_input,
        newsletter_at = case when on_input then now() else newsletter_at end,
        newsletter_unsub_at = case when on_input then null else now() end
    where id = auth.uid();
  return on_input;
end;
$function$;

-- Baja con el enlace del correo. Devuelve el nombre del negocio para la página de confirmación.
create or replace function public.newsletter_unsubscribe(token_input text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  found_id uuid;
begin
  if coalesce(length(token_input), 0) < 16 then return jsonb_build_object('ok', false); end if;
  update public.profiles
    set newsletter = false, newsletter_unsub_at = coalesce(newsletter_unsub_at, now())
    where newsletter_token = token_input
    returning id into found_id;
  return jsonb_build_object('ok', found_id is not null);
end;
$function$;

-- Igual que antes, más el enlace de baja de cada usuario.
drop function if exists public.owner_users();
create function public.owner_users()
returns table (
  id uuid, email text, name text, role text, created_at timestamptz, newsletter boolean, newsletter_at timestamptz,
  gender text, age integer, orders bigint, spent numeric, last_order timestamptz,
  stamps integer, total_stamps integer, rewards integer, newsletter_token text, newsletter_unsub_at timestamptz
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
      coalesce(c.stamps, 0), coalesce(c.total_stamps, 0), coalesce(c.rewards_earned, 0),
      p.newsletter_token, p.newsletter_unsub_at
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

revoke execute on function public.owner_users() from public, anon;
revoke execute on function public.set_newsletter(boolean) from public, anon;
revoke execute on function public.newsletter_unsubscribe(text) from public;
grant execute on function public.owner_users(), public.set_newsletter(boolean) to authenticated;
grant execute on function public.newsletter_unsubscribe(text) to anon, authenticated;
