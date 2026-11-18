import { createHash, randomBytes } from 'crypto';

// Cliente de la API de Alanube (República Dominicana). Con ALANUBE_TOKEN en Vercel habla con Alanube
// (sandbox o, con ALANUBE_ENV=production, producción). Sin token, todo se simula para poder ver el
// proceso completo antes de tener las credenciales.
const BASES = { sandbox: 'https://sandbox.alanube.co/dom/v1', production: 'https://api.alanube.co/dom/v1' };

export const ecfSimulated = () => !process.env.ALANUBE_TOKEN;
export const ecfEnv = () => (ecfSimulated() ? 'simulado' : process.env.ALANUBE_ENV === 'production' ? 'produccion' : 'sandbox');

// El secreto que Alanube manda en los webhooks; sale de la clave de servicio (no hace falta otra variable).
export function webhookSecret() {
  const base = process.env.ECF_WEBHOOK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createHash('sha256').update(`ordrpr-ecf:${base}`).digest('hex').slice(0, 40);
}

function alanubeMessage(data) {
  if (!data) return 'Alanube no respondió';
  if (typeof data === 'string') return data.slice(0, 300);
  const list = data.errors || data.response || data.error || data.message;
  if (Array.isArray(list)) return list.map((e) => (typeof e === 'string' ? e : e.message || e.detail || JSON.stringify(e))).join(' · ').slice(0, 400);
  if (typeof list === 'string') return list;
  return JSON.stringify(data).slice(0, 300);
}

export async function alanube(path, { method = 'GET', body, form } = {}) {
  if (ecfSimulated()) return simulate(path, method, body);
  const base = process.env.ALANUBE_ENV === 'production' ? BASES.production : BASES.sandbox;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.ALANUBE_TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}), accept: 'application/json' },
    body: body ? JSON.stringify(body) : form,
    cache: 'no-store',
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch (e) { /* texto o XML */ }
  if (!res.ok) {
    const err = new Error(alanubeMessage(data));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ---------- Simulación (sin token) ----------
const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const fakeUlid = () => Array.from(randomBytes(26)).map((b) => ULID_CHARS[b % 32]).join('');
const code6 = () => Array.from(randomBytes(6)).map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

function simulate(path, method, body) {
  if (method === 'POST' && path === '/company') {
    const id = fakeUlid();
    const now = new Date();
    return {
      company: {
        id, name: body.name, tradeName: body.tradeName, identification: body.identification, type: 'associated',
        address: body.address, email: body.email,
        companyUrls: {
          reception: `https://sandbox.alanube.co/dom/v1/${id}/fe/recepcion/api/ecf`,
          approval: `https://sandbox.alanube.co/dom/v1/${id}/fe/aprobacioncomercial/api/ecf`,
          authentication: `https://sandbox.alanube.co/dom/v1/${id}/fe/autenticacion/api/semilla`,
        },
        certificate: {
          name: body.certificate && body.certificate.name, extension: body.certificate && body.certificate.extension,
          issuerName: 'Certificado simulado', startDate: now.toISOString().slice(0, 10),
          endDate: new Date(now.getTime() + 2 * 365 * 86400000).toISOString().slice(0, 10),
        },
      },
    };
  }
  if (method === 'POST' && path === '/set-tests') return { id: fakeUlid(), status: 'PROCESSING', retryNumber: (body && body.retryNumber) || 0 };
  if (method === 'GET' && path.startsWith('/check-set-tests/')) {
    return { id: path.split('/')[2], status: 'FINISHED', legalStatus: 'ACCEPTED', documents: { total: 12, accepted: 12, rejected: 0 } };
  }
  if (method === 'POST' && path.startsWith('/sign-document/')) {
    return { simulated: true };
  }
  if (method === 'POST' && (path === '/invoices' || path === '/fiscal-invoices')) {
    const encf = body.idDoc.encf;
    return {
      id: fakeUlid(), stampDate: body.sender.stampDate, status: 'FINISHED', legalStatus: 'ACCEPTED',
      companyIdentification: body.sender.rnc, documentNumber: encf,
      documentStampUrl: `https://ecf.dgii.gov.do/testecf/consultatimbre?rncemisor=${body.sender.rnc}&encf=${encf}&codigoseguridad=SIMULADO`,
      securityCode: code6(), signatureDate: new Date().toISOString(), sequenceConsumed: true, pdf: null,
      governmentResponse: { code: 1, value: [{ message: 'Simulación: aceptado' }] },
    };
  }
  if (method === 'GET' && path.startsWith('/invoices/') ) return { status: 'FINISHED', legalStatus: 'ACCEPTED' };
  if (method === 'GET' && path.startsWith('/fiscal-invoices/')) return { status: 'FINISHED', legalStatus: 'ACCEPTED' };
  return { simulated: true };
}

// El estado de Alanube en las palabras de la app.
export function ecfStatusFrom(doc) {
  const legal = doc && (doc.legalStatus || (doc.document && doc.document.legalStatus));
  if (legal === 'ACCEPTED') return 'aceptado';
  if (legal === 'ACCEPTED_WITH_OBSERVATIONS') return 'aceptado_obs';
  if (legal === 'REJECTED') return 'rechazado';
  return 'enviado';
}
