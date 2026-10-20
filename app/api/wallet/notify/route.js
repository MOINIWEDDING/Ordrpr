import { walletConfig } from '@/lib/wallet/config';
import { googleConfig, updateGoogleClass, updateGoogleObject } from '@/lib/wallet/google';
import { walletDb } from '@/lib/wallet/db';
import { pushPassUpdates } from '@/lib/wallet/apns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El local llama aquí después de confirmar un pedido, dar un sello o cambiar el diseño del pase:
// Apple Wallet vuelve a bajar los pases afectados y en Google Wallet se actualizan. La base de
// datos solo entrega los pases si quien llama es personal del local.
export async function POST(req) {
  const apple = walletConfig();
  const google = googleConfig();
  if (!apple.ok && !google.ok) return Response.json({ sent: 0, reason: 'wallet no configurado' }, { status: 501 });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'sin sesión' }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch (e) { return Response.json({ error: 'cuerpo inválido' }, { status: 400 }); }
  const orderId = UUID.test(body.orderId || '') ? body.orderId : null;
  const userId = UUID.test(body.userId || '') ? body.userId : null;
  const all = body.all === true;
  if (!orderId && !userId && !all) return Response.json({ error: 'falta a quién avisar' }, { status: 400 });

  const db = walletDb(token);
  const out = {};
  if (apple.ok) {
    const { data, error } = await db.rpc('wallet_push_tokens', { order_input: orderId, user_input: userId, all_input: all });
    if (error) return Response.json({ error: 'no autorizado' }, { status: 403 });
    out.apple = await pushPassUpdates((data || []).map((x) => x.push_token), apple);
  }
  if (google.ok) {
    const { data: cards, error } = await db.rpc('wallet_cards', { order_input: orderId, user_input: userId, all_input: all });
    if (error) return Response.json({ error: 'no autorizado' }, { status: 403 });
    const origin = new URL(req.url).origin;
    const anon = walletDb();
    let updated = 0;
    let classDone = !all;
    try {
      // de 5 en 5 para no saturar la API de Google
      for (let i = 0; i < (cards || []).length; i += 5) {
        await Promise.all(cards.slice(i, i + 5).map(async (c) => {
          const { data } = await anon.rpc('wallet_pass', { serial_input: c.serial, token_input: c.auth_token });
          if (!data) return;
          if (!classDone) { classDone = true; await updateGoogleClass(data, origin, google); }
          if ((await updateGoogleObject(data, origin, google)) === 200) updated += 1;
        }));
      }
      out.google = { updated };
    } catch (e) {
      out.google = { updated, error: e.message };
    }
  }
  return Response.json(out);
}
