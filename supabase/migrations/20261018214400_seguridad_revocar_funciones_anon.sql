-- Funciones que solo sirven con sesión iniciada (o como trigger): fuera del alcance de visitantes anónimos.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.pay_with_gift_card(numeric) from public, anon;
revoke execute on function public.redeem_gift_card(text) from public, anon;
revoke execute on function public.push_target(uuid) from public, anon;
revoke execute on function public.team_add(text, text) from public, anon;
revoke execute on function public.team_cancel_invite(text) from public, anon;
revoke execute on function public.team_list() from public, anon;
revoke execute on function public.team_remove(uuid) from public, anon;
revoke execute on function public.team_set_role(uuid, text) from public, anon;
