import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { orderNotice, mergeOrderMessages } from '@/lib/orderMessages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body, status = 200) => Response.json(body, { status });

// El local llama aquí después de cambiar el estado de un pedido. Se usa la sesión de quien llama
// (dueño o comensal): la base de datos solo entrega las suscripciones de ese pedido si es personal del local.
export async function POST(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!url || !anon || !pub || !priv) return json({ error: 'push no configurado' }, 501);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'sin sesión' }, 401);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'cuerpo inválido' }, 400); }
  const orderId = body && body.orderId;
  if (!UUID.test(orderId || '')) return json({ error: 'pedido inválido' }, 400);

  const db = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: targets, error } = await db.rpc('push_targets', { p_order: orderId });
  if (error) return json({ error: 'no autorizado' }, 403);
  if (!targets || !targets.length) return json({ sent: 0 });

  const { data: st } = await db.from('site_settings').select('brand_name, logo_url, order_messages').eq('id', 1).maybeSingle();
  const brand = (st && st.brand_name) || '';
  const saved = st && st.order_messages;
  if (mergeOrderMessages(saved).push === false) return json({ sent: 0, reason: 'push apagado' });

  const first = targets[0];
  const notice = orderNotice(saved, first.status, { customer_name: first.customer_name, table_number: first.table_number }, brand);
  if (!notice) return json({ sent: 0, reason: 'aviso apagado' });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv);
  const payload = JSON.stringify({
    title: brand || 'Tu pedido',
    body: notice.text,
    icon: (st && st.logo_url) || undefined,
    tag: `pedido-${orderId}`,
    url: '/pedidos',
  });

  let sent = 0;
  const dead = [];
  await Promise.all(targets.map(async (t) => {
    try {
      await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, { TTL: 6 * 3600, urgency: 'high' });
      sent += 1;
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(t.endpoint);
    }
  }));
  if (dead.length) await db.rpc('push_prune', { p_endpoints: dead });
  return json({ sent, removed: dead.length });
}
