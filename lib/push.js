'use client';
import { sb } from '@/lib/supabaseClient';
import { getGuestPushRef } from '@/lib/guestOrders';

// Notificaciones push con OneSignal (avisos al teléfono aunque la página esté cerrada).
// Necesita NEXT_PUBLIC_ONESIGNAL_APP_ID; si falta, todo esto queda apagado sin romper nada.
// Cada aparato se identifica con un "external id": el id de la cuenta si inició sesión, o un id propio de invitado.
const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '';

export const PUSH_CONFIGURED = Boolean(APP_ID);

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

function externalIdFor(profile) {
  return profile && profile.id ? profile.id : getGuestPushRef();
}

// Carga el SDK de OneSignal una sola vez (solo cuando hace falta).
let sdkPromise = null;
function loadSdk() {
  if (!PUSH_CONFIGURED || typeof window === 'undefined') return Promise.resolve(null);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 12000);
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    if (!document.querySelector('script[data-onesignal]')) {
      const s = document.createElement('script');
      s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      s.defer = true;
      s.setAttribute('data-onesignal', '1');
      s.onerror = () => { clearTimeout(timer); resolve(null); };
      document.head.appendChild(s);
    }
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({ appId: APP_ID, notifyButton: { enable: false } });
        // con la página abierta ya se ve el aviso dentro de la app: no se duplica con la notificación del sistema
        try {
          OneSignal.Notifications.addEventListener('foregroundWillDisplay', (e) => { try { e.preventDefault(); } catch (err) { /* ignore */ } });
        } catch (err) { /* ignore */ }
        clearTimeout(timer);
        resolve(OneSignal);
      } catch (e) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
  return sdkPromise.then((os) => { if (!os) sdkPromise = null; return os; });
}

// Pide permiso (debe llamarse desde un clic) y deja este aparato ligado a la cuenta o al invitado.
export async function enablePush(profile) {
  const st = pushState();
  if (st === 'unsupported' || st === 'ios-install') return { ok: false, reason: 'unsupported' };
  const OS = await loadSdk();
  if (!OS) return { ok: false, reason: 'sdk' };
  try {
    const ext = externalIdFor(profile);
    if (ext) await OS.login(ext);
    await OS.Notifications.requestPermission();
    try { await OS.User.PushSubscription.optIn(); } catch (e) { /* ignore */ }
    const granted = Notification.permission === 'granted';
    return { ok: granted, reason: granted ? 'granted' : Notification.permission };
  } catch (e) {
    return { ok: false, reason: 'error' };
  }
}

// Si ya dio permiso, mantiene el aparato ligado a la cuenta con la que está (o como invitado).
export async function syncPush(profile) {
  try {
    if (pushState() !== 'granted') return;
    const OS = await loadSdk();
    const ext = externalIdFor(profile);
    if (OS && ext) await OS.login(ext);
  } catch (e) { /* ignore */ }
}

// Lo llama el local al cambiar un estado: el servidor le pide a OneSignal que avise al cliente de ese pedido.
export async function sendOrderPush(orderId) {
  try {
    if (!PUSH_CONFIGURED) return null;
    const { data } = await sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) return null;
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || (j.errors && j.errors.length)) console.warn('Notificación push no enviada:', res.status, j);
    return { status: res.status, ...j };
  } catch (e) { return null; }
}

// Diagnóstico para el dueño: registra este aparato y se manda un aviso de prueba. Devuelve un texto claro.
export async function testPushHere(profile) {
  const out = { ok: false, text: '' };
  try {
    if (!PUSH_CONFIGURED) { out.text = 'Esta versión de la página no tiene el App ID de OneSignal (NEXT_PUBLIC_ONESIGNAL_APP_ID). Agrégalo en Vercel y haz Redeploy.'; return out; }
    const state = pushState();
    if (state === 'ios-install') { out.text = 'En iPhone, abre la página desde el icono de la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y vuelve a probar.'; return out; }
    if (state === 'unsupported') { out.text = 'Este navegador no permite notificaciones push. Prueba con Chrome o Safari actualizados.'; return out; }
    if (state === 'denied') { out.text = 'Las notificaciones están bloqueadas para esta página. Permítelas en los ajustes del navegador y vuelve a probar.'; return out; }

    const hc = await fetch('/api/push').then((x) => x.json()).catch(() => null);
    if (hc && hc.missing && hc.missing.length) { out.text = `Faltan variables en Vercel: ${hc.missing.join(', ')}. Agrégalas y haz Redeploy.`; return out; }

    const r = await enablePush(profile);
    if (!r.ok) {
      out.text = r.reason === 'sdk'
        ? 'No se pudo cargar OneSignal. Revisa tu conexión, o si un bloqueador de anuncios lo está impidiendo.'
        : r.reason === 'default' || r.reason === 'denied'
          ? 'No diste permiso para las notificaciones.'
          : 'No se pudo registrar este aparato en OneSignal. Revisa que el App ID sea correcto y que la dirección del sitio (Site URL) en OneSignal sea exactamente la de esta página.';
      return out;
    }

    const { data } = await sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) { out.text = 'Inicia sesión como dueño para probar.'; return out; }

    // OneSignal tarda un instante en registrar la suscripción
    await new Promise((r2) => setTimeout(r2, 2500));
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ test: true }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 501) { out.text = 'El servidor no tiene las variables de OneSignal. Agrégalas en Vercel y haz Redeploy.'; return out; }
    if (!res.ok) { out.text = `El servidor respondió con un error (${res.status}${j.detail ? `: ${j.detail}` : ''}).`; return out; }
    if (j.errors && j.errors.length) {
      out.text = `OneSignal rechazó el envío: ${j.errors.slice(0, 2).join(' · ')}. Si habla de la "API key" o "Authorization", revisa ONESIGNAL_REST_API_KEY en Vercel y haz Redeploy.`;
      return out;
    }
    if (!j.sent) { out.text = 'OneSignal no encontró este aparato todavía. Espera unos segundos y vuelve a probar.'; return out; }
    out.ok = true;
    out.text = 'Aviso de prueba enviado. Debe aparecer en unos segundos como notificación del teléfono (si tienes esta página abierta a la vista, puede no mostrarse: minimízala).';
    return out;
  } catch (e) {
    out.text = 'Algo falló al probar. Vuelve a intentarlo.';
    return out;
  }
}
