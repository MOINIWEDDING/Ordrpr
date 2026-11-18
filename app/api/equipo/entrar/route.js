import { adminDb } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Entrar con PIN desde un aparato del local. La base revisa el aparato, el PIN y los intentos; si todo
// está bien, se genera un enlace de un solo uso y el navegador lo canjea por la sesión de esa persona.
export async function POST(req) {
  const admin = adminDb();
  if (!admin) return Response.json({ error: 'Entrar con PIN no está configurado en este restaurante.' }, { status: 501 });
  let body = {};
  try { body = await req.json(); } catch (e) { return Response.json({ error: 'Datos no válidos.' }, { status: 400 }); }
  const device = String(body.device || '');
  const userId = String(body.user_id || '');
  const pin = String(body.pin || '');
  if (!device || !UUID.test(userId) || !/^[0-9]{4}$/.test(pin)) return Response.json({ error: 'Datos no válidos.' }, { status: 400 });

  const { data: check, error } = await admin.rpc('staff_pin_check', { device_input: device, user_input: userId, pin_input: pin });
  if (error) return Response.json({ error: 'No se pudo revisar el PIN.' }, { status: 500 });
  if (!check || !check.ok) {
    const reason = check ? check.reason : 'pin';
    const status = reason === 'device' ? 403 : reason === 'locked' ? 423 : 401;
    return Response.json({ ok: false, reason, left: check ? check.left : null, until: check ? check.until : null }, { status });
  }
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: check.email });
  if (linkError || !link || !link.properties) return Response.json({ error: 'No se pudo abrir la sesión.' }, { status: 500 });
  return Response.json({ ok: true, token_hash: link.properties.hashed_token });
}
