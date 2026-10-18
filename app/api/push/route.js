import { createClient } from '@supabase/supabase-js';
import { orderNotice, mergeOrderMessages } from '@/lib/orderMessages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body, status = 200) => Response.json(body, { status });
const ONESIGNAL_URL = process.env.ONESIGNAL_API_URL || 'https://api.onesignal.com/notifications?c=push';

// Revisa (sin mostrar ningún secreto) qué variables están puestas en el servidor.
export async function GET() {
  const need = {
    NEXT_PUBLIC_ONESIGNAL_APP_ID: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
    ONESIGNAL_REST_API_KEY: process.env.ONESIGNAL_REST_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
  const missing = Object.keys(need).filter((k) => !need[k]);
  return json({ ok: missing.length === 0, missing });
}

// Envía el aviso con OneSignal a un "external id" (cuenta o aparato de invitado).
async function sendToOneSignal({ appId, apiKey, externalId, heading, text, icon, url, topic }) {
  const body = {
    app_id: appId,
    target_channel: 'push',
    include_aliases: { external_id: [externalId] },
    headings: { en: heading, es: heading },
    contents: { en: text, es: text },
    url,
    ttl: 6 * 3600,
    priority: 10,
  };
  if (icon && /^https:\/\//.test(icon)) body.chrome_web_icon = icon;
  if (topic) body.web_push_topic = topic;
  const res = await fetch(ONESIGNAL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  const errors = Array.isArray(j.errors) ? j.errors.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))) : (j.errors ? [JSON.stringify(j.errors)] : []);
  if (!res.ok && !errors.length) errors.push(`OneSignal respondió ${res.status}`);
  return { sent: j.id ? 1 : 0, errors };
}

// El local llama aquí después de cambiar el estado de un pedido. Se usa la sesión de quien llama
// (dueño o comensal): la base de datos solo entrega a quién avisar si es personal del local.
export async function POST(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!url || !anon || !appId || !apiKey) return json({ error: 'push no configurado' }, 501);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'sin sesión' }, 401);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'cuerpo inválido' }, 400); }
  const isTest = Boolean(body && body.test);
  const orderId = body && body.orderId;
  if (!isTest && !UUID.test(orderId || '')) return json({ error: 'pedido inválido' }, 400);

  const db = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const origin = new URL(req.url).origin;

  const { data: st } = await db.from('site_settings').select('brand_name, logo_url, order_messages').eq('id', 1).maybeSingle();
  const brand = (st && st.brand_name) || '';

  // Prueba del dueño: manda un aviso de ejemplo a su propia cuenta (sirve para revisar que todo esté conectado).
  if (isTest) {
    const { data: u, error: uErr } = await db.auth.getUser(token);
    if (uErr || !u || !u.user) return json({ error: 'sesión inválida' }, 401);
    const r = await sendToOneSignal({
      appId, apiKey, externalId: u.user.id,
      heading: brand || 'Prueba', text: 'Así te llegarán los avisos de pedidos.',
      icon: st && st.logo_url, url: `${origin}/cuenta`, topic: 'prueba',
    });
    return json({ test: true, ...r });
  }

  const { data: rows, error } = await db.rpc('push_target', { p_order: orderId });
  if (error) return json({ error: 'no autorizado' }, 403);
  const target = rows && rows[0];
  if (!target || !target.external_id) return json({ sent: 0, reason: 'el pedido no tiene a quién avisar' });

  const saved = st && st.order_messages;
  if (mergeOrderMessages(saved).push === false) return json({ sent: 0, reason: 'push apagado' });
  const notice = orderNotice(saved, target.status, { customer_name: target.customer_name, table_number: target.table_number }, brand);
  if (!notice) return json({ sent: 0, reason: 'aviso apagado' });

  const r = await sendToOneSignal({
    appId, apiKey, externalId: target.external_id,
    heading: brand || 'Tu pedido', text: notice.text,
    icon: st && st.logo_url, url: `${origin}/pedidos`, topic: `pedido-${orderId}`,
  });
  if (r.errors.length) console.error('push: errores de envío', JSON.stringify(r.errors));
  return json(r);
}
