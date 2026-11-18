-- Archivo de facturas para contabilidad: el resumen de cada mes (las «carpetas»).

create or replace function public.invoice_months(branch_input text)
returns table (month text, issued bigint, total numeric, voided bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_accounting() then raise exception 'Solo el dueño o el contador'; end if;
  return query
  select to_char(i.issued_at at time zone 'America/Santo_Domingo', 'YYYY-MM') as m,
    count(*) filter (where i.status = 'emitida'),
    coalesce(sum(i.total) filter (where i.status = 'emitida'), 0),
    count(*) filter (where i.status = 'anulada')
  from public.invoices i
  where branch_input is null or i.branch = branch_input
  group by 1
  order by 1 desc;
end;
$function$;
revoke execute on function public.invoice_months(text) from public, anon;
grant execute on function public.invoice_months(text) to authenticated;
