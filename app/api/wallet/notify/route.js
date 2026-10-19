import { walletConfig } from '@/lib/wallet/config';
import { walletDb } from '@/lib/wallet/db';
import { pushPassUpdates } from '@/lib/wallet/apns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El local llama aquí después de confirmar un pedido, dar un sello o cambiar el diseño del pase:
// Apple Wallet vuelve a bajar los pases afectados. La base de datos solo entrega los aparatos
// si quien llama es personal del local.
export async function POST(req) {
  const config = walletConfig();
  if (!config.ok) return Response.json({ sent: 0, reason: 'wallet no configurado' }, { status: 501 });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'sin sesión' }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch (e) { return Response.json({ error: 'cuerpo inválido' }, { status: 400 }); }
  const orderId = UUID.test(body.orderId || '') ? body.orderId : null;
  const userId = UUID.test(body.userId || '') ? body.userId : null;
  const all = body.all === true;
  if (!orderId && !userId && !all) return Response.json({ error: 'falta a quién avisar' }, { status: 400 });

  const db = walletDb(token);
  const { data, error } = await db.rpc('wallet_push_tokens', { order_input: orderId, user_input: userId, all_input: all });
  if (error) return Response.json({ error: 'no autorizado' }, { status: 403 });
  const r = await pushPassUpdates((data || []).map((x) => x.push_token), config);
  return Response.json(r);
}
