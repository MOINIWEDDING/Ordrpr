'use client';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { getGuestOrderIds } from '@/lib/guestOrders';

// Notificaciones push (avisos con la página cerrada). Necesitan las llaves VAPID en las variables de
// entorno (ver la guía); si faltan, todo esto se queda apagado sin romper nada.
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

export const PUSH_CONFIGURED = Boolean(VAPID_PUBLIC) && BARRO_CONFIGURED;

export function isIos() {
  try { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); } catch (e) { return false; }
}
export function isStandalone() {
  try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) { return false; }
}

// 'unsupported' | 'ios-install' | 'default' | 'granted' | 'denied'
export function pushState() {
  if (!PUSH_CONFIGURED || typeof window === 'undefined') return 'unsupported';
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!ok) return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  return Notification.permission;
}

function keyToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription(create) {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && create) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC) });
  }
  return sub;
}

async function register(sub, orderIds) {
  const j = sub.toJSON();
  const { error } = await sb.rpc('push_subscribe', {
    p_endpoint: sub.endpoint,
    p_p256dh: (j.keys && j.keys.p256dh) || '',
    p_auth: (j.keys && j.keys.auth) || '',
    p_orders: (orderIds || []).filter(Boolean),
  });
  return !error;
}

// Pide permiso (debe llamarse desde un clic) y deja el aparato listo para recibir avisos.
export async function enablePush(orderIds) {
  if (pushState() === 'unsupported' || pushState() === 'ios-install') return { ok: false, reason: 'unsupported' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: perm };
  try {
    const sub = await currentSubscription(true);
    const ok = await register(sub, orderIds);
    return { ok, reason: ok ? 'granted' : 'error' };
  } catch (e) {
    return { ok: false, reason: 'error' };
  }
}

// Si ya dio permiso, vuelve a registrar (por si cambió de cuenta) y liga el pedido nuevo.
export async function syncPush(orderId) {
  // sin id: liga todos los pedidos de invitado que el navegador recuerda
  try {
    if (pushState() !== 'granted') return;
    const sub = await currentSubscription(false);
    if (sub) await register(sub, orderId ? [orderId] : getGuestOrderIds());
  } catch (e) { /* ignore */ }
}

// Lo llama el local al cambiar un estado: el servidor envía el push al cliente de ese pedido.
export async function sendOrderPush(orderId) {
  try {
    if (!PUSH_CONFIGURED) return;
    const { data } = await sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) return;
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId }),
    });
  } catch (e) { /* ignore */ }
}
