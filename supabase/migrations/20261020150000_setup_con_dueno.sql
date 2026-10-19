-- En cuanto existe una cuenta de dueño, /setup deja de estar disponible para los demás (404).
alter table public.site_settings add column if not exists owner_ready boolean not null default false;

create or replace function public.mark_owner_ready()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.role = 'staff' then
    update public.site_settings set owner_ready = true where id = 1 and not owner_ready;
  end if;
  return new;
end;
$function$;
revoke execute on function public.mark_owner_ready() from public, anon, authenticated;

drop trigger if exists profiles_mark_owner_ready on public.profiles;
create trigger profiles_mark_owner_ready
  after insert or update of role on public.profiles
  for each row execute function public.mark_owner_ready();

-- Restaurantes que ya tienen dueño.
update public.site_settings set owner_ready = true
where id = 1 and exists (select 1 from public.profiles where role = 'staff');
