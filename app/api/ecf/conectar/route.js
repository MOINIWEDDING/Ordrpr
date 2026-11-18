import { alanube, ecfSimulated, webhookSecret } from '@/lib/ecf/alanube';
import { json, requireOwner, readSettings } from '@/lib/ecf/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Paso 2: da de alta al restaurante en Alanube como empresa asociada, con su certificado digital.
// El certificado y su contraseña van directo a Alanube; aquí solo se guarda su nombre y vigencia.
export async function POST(req) {
  const auth = await requireOwner(req);
  if (auth.error) return auth.error;
  const { admin } = auth;
  let body = {};
  try { body = await req.json(); } catch (e) { return json({ error: 'Datos no válidos.' }, 400); }
  const { site, ecf } = await readSettings(admin);
  const rnc = String(site.business_rnc || '').replace(/\D/g, '');
  if (!/^([0-9]{9}|[0-9]{11})$/.test(rnc)) return json({ error: 'Primero pon el RNC del negocio en Facturación (9 u 11 números).' }, 400);
  if (!site.business_legal_name) return json({ error: 'Primero pon la razón social en Facturación.' }, 400);
  if (!site.address) return json({ error: 'Primero pon la dirección del negocio en Contacto.' }, 400);
  const cert = body.certificate || {};
  if (!cert.content || !cert.name) return json({ error: 'Sube el certificado digital (.p12 o .pfx).' }, 400);
  if (!cert.password) return json({ error: 'Escribe la contraseña del certificado.' }, 400);
  if (cert.content.length > 200000) return json({ error: 'El certificado es demasiado grande.' }, 400);
  if (ecf.company_id) return json({ error: 'Este restaurante ya está conectado con Alanube.' }, 409);

  const origin = new URL(req.url).origin;
  const payload = {
    name: site.business_legal_name,
    ...(site.brand_name ? { tradeName: site.brand_name } : {}),
    identification: rnc,
    type: 'associated',
    address: site.address,
    ...(body.province ? { province: String(body.province).slice(0, 60) } : {}),
    ...(body.municipality ? { municipality: String(body.municipality).slice(0, 60) } : {}),
    ...(body.email || site.email ? { email: String(body.email || site.email).slice(0, 120) } : {}),
    certificate: { name: String(cert.name).replace(/\.(p12|pfx)$/i, '').slice(0, 80), extension: /pfx$/i.test(cert.name) ? 'pfx' : 'p12', content: cert.content, password: String(cert.password) },
    webhooks: {
      documents: { emissionFinished: { url: `${origin}/api/ecf/webhook`, headers: { 'x-ordrpr-ecf': webhookSecret() }, status: 'active' } },
    },
    notificationByEmail: { enabled: false },
  };
  let res;
  try {
    res = await alanube('/company', { method: 'POST', body: payload });
  } catch (e) {
    return json({ error: `Alanube no aceptó los datos: ${e.message}` }, 400);
  }
  const company = res.company || res;
  const certInfo = company.certificate || {};
  const { error } = await admin.from('ecf_settings').update({
    company_id: company.id, company_urls: company.companyUrls || {}, simulated: ecfSimulated(),
    certificate: { name: certInfo.name || cert.name, issuer: certInfo.issuerName || '', start: certInfo.startDate || null, end: certInfo.endDate || null },
    province: body.province || '', municipality: body.municipality || '', email: body.email || site.email || '',
    status: 'conectado', updated_at: new Date().toISOString(),
  }).eq('id', 1);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, company_id: company.id });
}
