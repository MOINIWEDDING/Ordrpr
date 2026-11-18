import { randomBytes, randomUUID } from 'crypto';
import { adminDb, userDb, bearer } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES = ['cajero', 'camarero', 'cocina', 'comensal', 'contador'];

// El dueño agrega a alguien del equipo sin correo: se le crea un usuario interno en Supabase (con un
// correo que no existe y una contraseña al azar que nadie conoce) y entra con su nombre y PIN.
export async function POST(req) {
  const admin = adminDb();
  if (!admin) return Response.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en Vercel para agregar personas con PIN.' }, { status: 501 });
  const token = bearer(req);
  const me = userDb(token);
  if (!token || !me) return Response.json({ error: 'Inicia sesión como dueño.' }, { status: 401 });
  const { data: owner } = await me.rpc('is_staff');
  if (owner !== true) return Response.json({ error: 'Solo el dueño puede agregar personal.' }, { status: 403 });

  let body = {};
  try { body = await req.json(); } catch (e) { return Response.json({ error: 'Datos no válidos.' }, { status: 400 }); }
  const name = String(body.name || '').trim().slice(0, 60);
  const role = String(body.role || '');
  const pin = String(body.pin || '');
  if (!name) return Response.json({ error: 'Escribe el nombre.' }, { status: 400 });
  if (!ROLES.includes(role)) return Response.json({ error: 'Rol no válido.' }, { status: 400 });
  if (!/^[0-9]{4}$/.test(pin)) return Response.json({ error: 'El PIN son 4 números.' }, { status: 400 });

  const { data: created, error } = await admin.auth.admin.createUser({
    email: `equipo-${randomUUID()}@equipo.invalid`,
    password: randomBytes(24).toString('base64url'),
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !created || !created.user) return Response.json({ error: `No se pudo crear: ${error ? error.message : 'sin usuario'}` }, { status: 500 });
  const uid = created.user.id;
  const { error: setupError } = await admin.rpc('staff_pin_member_setup', { user_input: uid, name_input: name, role_input: role, pin_input: pin });
  if (setupError) {
    await admin.auth.admin.deleteUser(uid).catch(() => {});
    return Response.json({ error: setupError.message }, { status: 400 });
  }
  return Response.json({ ok: true, user_id: uid });
}
