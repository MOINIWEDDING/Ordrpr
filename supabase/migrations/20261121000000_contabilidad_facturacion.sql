-- El contador también maneja la facturación: los datos fiscales del negocio y toda la facturación
-- electrónica (conectar con Alanube, pasos de la DGII, secuencias e-NCF y activar). El dueño sigue pudiendo.

-- Datos fiscales que salen en las facturas y en el e-CF (el contador no toca el resto de la configuración).
create or replace function public.accounting_set_business(legal_name_input text, rnc_input text, address_input text, footer_input text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rnc text := regexp_replace(coalesce(rnc_input, ''), '[^0-9]', '', 'g');
begin
  if not public.is_accounting() then raise exception 'Solo el dueño o el contador'; end if;
  if rnc <> '' and rnc !~ '^([0-9]{9}|[0-9]{11})$' then raise exception 'El RNC tiene 9 dígitos (o 11 si es una cédula)'; end if;
  -- con el negocio ya conectado a Alanube, el RNC no cambia (es el de la empresa registrada)
  if exists (select 1 from public.ecf_settings where id = 1 and company_id is not null)
     and rnc is distinct from (select regexp_replace(coalesce(business_rnc, ''), '[^0-9]', '', 'g') from public.site_settings where id = 1) then
    raise exception 'El RNC ya está registrado en la facturación electrónica y no se puede cambiar aquí';
  end if;
  update public.site_settings set
    business_legal_name = left(btrim(coalesce(legal_name_input, '')), 120),
    business_rnc = rnc,
    address = left(btrim(coalesce(address_input, '')), 200),
    invoice_footer = left(btrim(coalesce(footer_input, '')), 200),
    updated_at = now()
  where id = 1;
  return found;
end;
$function$;
revoke execute on function public.accounting_set_business(text, text, text, text) from public, anon;
grant execute on function public.accounting_set_business(text, text, text, text) to authenticated;

create or replace function public.ecf_set_active(active_input boolean)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  st public.ecf_settings;
begin
  if not public.is_accounting() then raise exception 'Solo el dueño o el contador'; end if;
  select * into st from public.ecf_settings where id = 1 for update;
  if active_input then
    if st.company_id is null then raise exception 'Primero conecta la empresa con Alanube'; end if;
    if not exists (select 1 from public.ecf_sequences where doc_type = '32' and next_number <= to_number and (expires_on is null or expires_on >= current_date)) then
      raise exception 'Agrega la secuencia de facturas de consumo (E32) que te autorizó la DGII';
    end if;
    update public.ecf_settings set status = 'activo', activated_at = coalesce(activated_at, now()), updated_at = now() where id = 1;
    return 'activo';
  end if;
  update public.ecf_settings set status = case when status = 'activo' then 'pausado' else status end, updated_at = now() where id = 1;
  return 'pausado';
end;
$function$;

drop policy if exists "Owner update ecf steps" on public.ecf_settings;
drop policy if exists "Accounting update ecf steps" on public.ecf_settings;
create policy "Accounting update ecf steps" on public.ecf_settings for update using (public.is_accounting()) with check (public.is_accounting());
drop policy if exists "Owner add sequences" on public.ecf_sequences;
drop policy if exists "Accounting add sequences" on public.ecf_sequences;
create policy "Accounting add sequences" on public.ecf_sequences for insert with check (public.is_accounting());
drop policy if exists "Owner delete unused sequences" on public.ecf_sequences;
drop policy if exists "Accounting delete unused sequences" on public.ecf_sequences;
create policy "Accounting delete unused sequences" on public.ecf_sequences for delete using (public.is_accounting() and next_number = from_number);
