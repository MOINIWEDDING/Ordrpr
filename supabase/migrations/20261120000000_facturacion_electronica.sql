-- Facturación electrónica (e-CF) con Alanube: la configuración de cada restaurante (su empresa en
-- Alanube, su certificado, los pasos con la DGII y sus secuencias e-NCF) y el estado de cada factura
-- ante la DGII. Las llamadas a Alanube las hace el servidor (rutas /api/ecf/*).

create table if not exists public.ecf_settings (
  id integer primary key default 1 check (id = 1),
  status text not null default 'nuevo' check (status in ('nuevo', 'conectado', 'postulado', 'certificando', 'certificado', 'activo', 'pausado')),
  simulated boolean not null default false,          -- se conectó sin token de Alanube (modo de prueba)
  company_id text,                                   -- id de la empresa asociada en Alanube
  company_urls jsonb not null default '{}'::jsonb,   -- recepción, aprobación comercial y autenticación (van a la DGII)
  certificate jsonb not null default '{}'::jsonb,    -- nombre, emisor y vigencia (nunca el archivo ni la contraseña)
  province text not null default '',
  municipality text not null default '',
  email text not null default '',
  set_test jsonb not null default '{}'::jsonb,
  steps jsonb not null default '{}'::jsonb,          -- lo que el dueño marca como hecho en la Oficina Virtual de la DGII
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.ecf_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.ecf_sequences (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('31', '32', '33', '34')),
  from_number bigint not null check (from_number > 0),
  to_number bigint not null,
  next_number bigint not null,
  expires_on date,
  created_at timestamptz not null default now(),
  check (to_number >= from_number and to_number < 10000000000),
  check (next_number between from_number and to_number + 1)
);

alter table public.invoices add column if not exists ecf_type text check (ecf_type is null or ecf_type in ('31', '32', '33', '34'));
alter table public.invoices add column if not exists ecf_status text check (ecf_status is null or ecf_status in ('pendiente', 'enviando', 'enviado', 'aceptado', 'aceptado_obs', 'rechazado', 'error'));
alter table public.invoices add column if not exists ecf_id text;
alter table public.invoices add column if not exists ecf_security_code text;
alter table public.invoices add column if not exists ecf_stamp_url text;
alter table public.invoices add column if not exists ecf_pdf text;
alter table public.invoices add column if not exists ecf_signed_at timestamptz;
alter table public.invoices add column if not exists ecf_response jsonb;
alter table public.invoices add column if not exists ecf_attempts integer not null default 0;
alter table public.invoices add column if not exists ecf_last_error text;
alter table public.invoices add column if not exists ecf_claimed_at timestamptz;
create index if not exists invoices_ecf_pending_idx on public.invoices (issued_at) where ecf_status in ('pendiente', 'enviando', 'enviado', 'error');

-- Con la facturación electrónica activa, cada factura nueva queda pendiente de enviarse a la DGII:
-- E31 si lleva RNC (crédito fiscal) y E32 si es de consumo.
create or replace function public.invoice_ecf_mark()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (select 1 from public.ecf_settings where id = 1 and status = 'activo' and company_id is not null) and new.status = 'emitida' then
    new.ecf_type := case when coalesce(new.fiscal->>'rnc', '') ~ '^([0-9]{9}|[0-9]{11})$' then '31' else '32' end;
    new.ecf_status := 'pendiente';
  end if;
  return new;
end;
$function$;
drop trigger if exists invoices_ecf_mark on public.invoices;
create trigger invoices_ecf_mark before insert on public.invoices for each row execute function public.invoice_ecf_mark();

-- El servidor toma hasta N facturas por enviar (o por consultar) sin que dos envíos choquen.
create or replace function public.ecf_claim(limit_input integer)
returns setof public.invoices
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  update public.invoices i set ecf_status = case when i.ecf_status = 'enviado' then 'enviado' else 'enviando' end,
    ecf_claimed_at = now(), ecf_attempts = i.ecf_attempts + 1
  where i.id in (
    select x.id from public.invoices x
    where (x.ecf_status in ('pendiente', 'error') and x.ecf_attempts < 8)
       or (x.ecf_status = 'enviando' and x.ecf_claimed_at < now() - interval '2 minutes')
       or (x.ecf_status = 'enviado' and (x.ecf_claimed_at is null or x.ecf_claimed_at < now() - interval '1 minute') and x.ecf_attempts < 30)
    order by x.issued_at
    limit greatest(1, least(coalesce(limit_input, 10), 25))
    for update skip locked
  )
  returning i.*;
end;
$function$;

-- El siguiente e-NCF del tipo pedido (de la secuencia vigente más vieja con números libres).
create or replace function public.ecf_take_number(doc_type_input text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.ecf_sequences;
begin
  select * into s from public.ecf_sequences
  where doc_type = doc_type_input and next_number <= to_number and (expires_on is null or expires_on >= current_date)
  order by created_at
  limit 1
  for update;
  if not found then raise exception 'No hay secuencias E% disponibles', doc_type_input; end if;
  update public.ecf_sequences set next_number = next_number + 1 where id = s.id;
  return 'E' || doc_type_input || lpad(s.next_number::text, 10, '0');
end;
$function$;

-- Activar o pausar la emisión. Para activar hace falta la empresa en Alanube y una secuencia E32 con números.
create or replace function public.ecf_set_active(active_input boolean)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  st public.ecf_settings;
begin
  if not public.is_staff() then raise exception 'Solo el dueño'; end if;
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

alter table public.ecf_settings enable row level security;
alter table public.ecf_sequences enable row level security;
drop policy if exists "Owner or accounting read ecf settings" on public.ecf_settings;
create policy "Owner or accounting read ecf settings" on public.ecf_settings for select using (public.is_staff() or public.is_accounting());
drop policy if exists "Owner update ecf steps" on public.ecf_settings;
create policy "Owner update ecf steps" on public.ecf_settings for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Owner or accounting read sequences" on public.ecf_sequences;
create policy "Owner or accounting read sequences" on public.ecf_sequences for select using (public.is_staff() or public.is_accounting());
drop policy if exists "Owner add sequences" on public.ecf_sequences;
create policy "Owner add sequences" on public.ecf_sequences for insert with check (public.is_staff());
drop policy if exists "Owner delete unused sequences" on public.ecf_sequences;
create policy "Owner delete unused sequences" on public.ecf_sequences for delete using (public.is_staff() and next_number = from_number);

-- El dueño solo puede cambiar lo que marca a mano; lo que viene de Alanube lo escribe el servidor.
revoke update on public.ecf_settings from anon, authenticated;
grant update (steps, province, municipality, email, status, updated_at) on public.ecf_settings to authenticated;

revoke execute on function public.invoice_ecf_mark(), public.ecf_claim(integer), public.ecf_take_number(text) from public, anon, authenticated;
grant execute on function public.ecf_claim(integer), public.ecf_take_number(text) to service_role;
revoke execute on function public.ecf_set_active(boolean) from public, anon;
grant execute on function public.ecf_set_active(boolean) to authenticated;
