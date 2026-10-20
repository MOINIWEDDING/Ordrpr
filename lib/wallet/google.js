import crypto from 'node:crypto';

// Google Wallet para el pase de sellos (tarjeta de lealtad). Variables de Vercel:
//   GOOGLE_WALLET_ISSUER_ID         el Issuer ID de la consola de Google Pay & Wallet
//   GOOGLE_WALLET_SERVICE_ACCOUNT   la llave JSON de la cuenta de servicio (tal cual o en base64)
// El botón "Agregar a Google Wallet" es un enlace con un JWT firmado que ya trae la clase y el pase;
// después, cada sello actualiza el pase con la API de Google.

const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
let cached = null;

export function googleConfig() {
  if (cached) return cached;
  const issuer = (process.env.GOOGLE_WALLET_ISSUER_ID || '').trim();
  const raw = (process.env.GOOGLE_WALLET_SERVICE_ACCOUNT || '').trim();
  const missing = [!issuer && 'GOOGLE_WALLET_ISSUER_ID', !raw && 'GOOGLE_WALLET_SERVICE_ACCOUNT'].filter(Boolean);
  if (missing.length) return { ok: false, missing };
  try {
    const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    if (!json.client_email || !json.private_key) throw new Error('la llave no trae client_email y private_key');
    cached = { ok: true, issuer, email: json.client_email, key: json.private_key };
    return cached;
  } catch (e) {
    return { ok: false, missing: [], error: `cuenta de servicio inválida: ${e.message}` };
  }
}

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function signJwt(payload, key) {
  const head = b64url({ alg: 'RS256', typ: 'JWT' });
  const body = b64url(payload);
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(key).toString('base64url');
  return `${head}.${body}.${sig}`;
}

// Un id por restaurante (su dominio) y uno por pase (su número de serie).
export const classIdFor = (cfg, origin) => `${cfg.issuer}.${new URL(origin).host.replace(/[^a-zA-Z0-9]/g, '_')}_sellos`;
export const objectIdFor = (cfg, serial) => `${cfg.issuer}.${serial}`;

const isHttps = (u) => /^https:\/\//.test(u || '');

export function loyaltyClass(data, origin, cfg) {
  const s = data.settings;
  const logo = s.logo_url || data.brand_logo_url;
  return {
    id: classIdFor(cfg, origin),
    issuerName: data.brand_name || 'Restaurante',
    programName: s.title,
    programLogo: { sourceUri: { uri: isHttps(logo) ? logo : `${origin}/api/wallet/google/logo` }, contentDescription: { defaultValue: { language: 'es', value: data.brand_name || s.title } } },
    hexBackgroundColor: s.bg_color,
    reviewStatus: 'UNDER_REVIEW',
    multipleDevicesAndHoldersAllowedStatus: 'ONE_USER_ALL_DEVICES',
  };
}

export function loyaltyObject(data, origin, cfg) {
  const s = data.settings;
  const left = Math.max(0, s.stamps_required - data.stamps);
  const rewards = data.rewards || [];
  const version = Math.floor(new Date(data.updated_at).getTime() / 1000);
  const q = `serial=${encodeURIComponent(data.serial)}&token=${encodeURIComponent(data.auth_token)}&v=${version}`;
  return {
    id: objectIdFor(cfg, data.serial),
    classId: classIdFor(cfg, origin),
    state: 'ACTIVE',
    accountId: data.serial,
    accountName: data.customer_name || 'Cliente',
    loyaltyPoints: { label: 'Sellos', balance: { string: `${data.stamps}/${s.stamps_required}` } },
    secondaryLoyaltyPoints: rewards.length
      ? { label: rewards.length === 1 ? 'Premio listo' : 'Premios listos', balance: { string: rewards.length === 1 ? rewards[0].code : String(rewards.length) } }
      : { label: 'Te faltan', balance: { string: `${left} ${left === 1 ? 'sello' : 'sellos'}` } },
    heroImage: { sourceUri: { uri: `${origin}/api/wallet/google/strip?${q}` }, contentDescription: { defaultValue: { language: 'es', value: `${data.stamps} de ${s.stamps_required} sellos` } } },
    textModulesData: [
      { id: 'premio', header: 'Premio', body: s.reward_label },
      rewards.length ? { id: 'codigos', header: 'Tus códigos de premio', body: rewards.map((r) => r.code).join('\n') } : null,
      s.description ? { id: 'como', header: 'Cómo funciona', body: s.description } : null,
      s.terms ? { id: 'terminos', header: 'Términos', body: s.terms } : null,
    ].filter(Boolean),
    linksModuleData: { uris: [{ id: 'pase', uri: `${origin}/pase`, description: 'Ver mi pase' }] },
  };
}

// Enlace "Agregar a Google Wallet".
export function saveUrl(data, origin, cfg) {
  const jwt = signJwt({
    iss: cfg.email,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins: [origin],
    payload: { loyaltyClasses: [loyaltyClass(data, origin, cfg)], loyaltyObjects: [loyaltyObject(data, origin, cfg)] },
  }, cfg.key);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

let token = null;
async function accessToken(cfg) {
  if (token && token.exp > Date.now() + 60000) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({ iss: cfg.email, scope: 'https://www.googleapis.com/auth/wallet_object.issuer', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, cfg.key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`google oauth ${res.status}`);
  const j = await res.json();
  token = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return token.value;
}

// Actualiza un recurso si ya existe (404 = el cliente nunca guardó el pase: no pasa nada).
async function patch(cfg, path, body) {
  const res = await fetch(`${API}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await accessToken(cfg)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.status;
}

export async function updateGoogleObject(data, origin, cfg) {
  const obj = loyaltyObject(data, origin, cfg);
  return patch(cfg, `loyaltyObject/${encodeURIComponent(obj.id)}`, obj);
}

export async function updateGoogleClass(data, origin, cfg) {
  const cls = loyaltyClass(data, origin, cfg);
  return patch(cfg, `loyaltyClass/${encodeURIComponent(cls.id)}`, cls);
}
