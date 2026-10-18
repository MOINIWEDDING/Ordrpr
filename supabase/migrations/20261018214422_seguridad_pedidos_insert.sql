-- Un pedido nuevo no puede cargarse a la cuenta de otra persona ni crearse ya avanzado.
alter policy "Anyone can place an order" on public.orders
  with check ((user_id is null or user_id = auth.uid()) and status = 'nueva');
