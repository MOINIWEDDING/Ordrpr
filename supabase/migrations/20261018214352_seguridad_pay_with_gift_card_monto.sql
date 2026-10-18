-- Un monto negativo sumaba saldo en vez de restarlo.
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
