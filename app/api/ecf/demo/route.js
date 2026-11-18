import { alanube, ecfSimulated } from '@/lib/ecf/alanube';
import { json, requireOwner, readSettings } from '@/lib/ecf/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Solo en modo de prueba (sin token de Alanube): deja todo listo de un toque —empresa simulada,
// pasos de la DGII marcados, set de pruebas aprobado, secuencias E32 y E31 y emisión activa— o lo
// vuelve a dejar como nuevo para empezar otra vez.
export async function POST(req) {
  if (!ecfSimulated()) return json({ error: 'La prueba rápida solo existe en modo de prueba (sin token de Alanube).' }, 400);
  const auth = await requireOwner(req);
  if (auth.error) return auth.error;
  const { admin } = auth;
  let body = {};
  try { body = await req.json(); } catch (e) { /* sin cuerpo */ }
  const { ecf, site } = await readSettings(admin);
  const now = new Date().toISOString();

  if (body.action === 'reset') {
    if (ecf.company_id && !ecf.simulated) return json({ error: 'Esta empresa ya está conectada de verdad con Alanube.' }, 400);
    await admin.from('ecf_sequences').delete().gte('from_number', 0);
    await admin.from('ecf_settings').update({
      status: 'nuevo', simulated: false, company_id: null, company_urls: {}, certificate: {}, set_test: {}, steps: {}, activated_at: null, updated_at: now,
    }).eq('id', 1);
    return json({ ok: true });
  }

  let patch = {};
  if (!ecf.company_id) {
    const res = await alanube('/company', {
      method: 'POST',
      body: { name: site.business_legal_name || site.brand_name || 'Restaurante de prueba', identification: String(site.business_rnc || '131000000').replace(/\D/g, ''), address: site.address || 'Dirección de prueba', certificate: { name: 'certificado-de-prueba', extension: 'p12' } },
    });
    const c = res.company;
    patch = {
      company_id: c.id, company_urls: c.companyUrls, simulated: true,
      certificate: { name: 'certificado-de-prueba', issuer: c.certificate.issuerName, start: c.certificate.startDate, end: c.certificate.endDate },
    };
  }
  const { data: seqs } = await admin.from('ecf_sequences').select('doc_type');
  const have = new Set((seqs || []).map((s) => s.doc_type));
  const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const add = [['32', 1000], ['31', 500]].filter(([t]) => !have.has(t)).map(([t, to]) => ({ doc_type: t, from_number: 1, to_number: to, next_number: 1, expires_on: nextYear }));
  if (add.length) {
    const { error } = await admin.from('ecf_sequences').insert(add);
    if (error) return json({ error: error.message }, 500);
  }
  const { error } = await admin.from('ecf_settings').update({
    ...patch,
    set_test: { id: 'PRUEBA', status: 'FINISHED', retries: 1, at: now, last: { status: 'FINISHED', documents: { total: 12, accepted: 12, rejected: 0 } } },
    steps: { ...(ecf.steps || {}), postulado: now, certificado: now },
    status: 'activo', activated_at: ecf.activated_at || now, updated_at: now,
  }).eq('id', 1);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}
