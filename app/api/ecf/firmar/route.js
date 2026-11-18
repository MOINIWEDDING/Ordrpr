import { alanube, ecfSimulated } from '@/lib/ecf/alanube';
import { json, requireOwner, readSettings } from '@/lib/ecf/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Paso 4: la DGII pide firmar documentos (por ejemplo la declaración jurada). El dueño sube el XML que le
// dio la DGII y se le devuelve firmado con su certificado, para subirlo de vuelta a la Oficina Virtual.
export async function POST(req) {
  const auth = await requireOwner(req);
  if (auth.error) return auth.error;
  const { ecf } = await readSettings(auth.admin);
  if (!ecf.company_id) return json({ error: 'Primero conecta la empresa con Alanube.' }, 400);
  const form = await req.formData().catch(() => null);
  const file = form && form.get('xml');
  if (!file || typeof file === 'string') return json({ error: 'Sube el archivo XML.' }, 400);
  if (file.size > 2_000_000) return json({ error: 'El archivo es demasiado grande.' }, 400);
  const xml = await file.text();
  if (!/^\s*<\?xml|^\s*</.test(xml)) return json({ error: 'Ese archivo no parece un XML.' }, 400);
  const name = (file.name || 'documento.xml').replace(/\.xml$/i, '');
  if (ecfSimulated()) {
    const signed = xml.replace(/(<\/[^>]+>\s*)$/, '<!-- Firma simulada: con el token de Alanube aquí va la firma digital del certificado -->\n$1');
    return new Response(signed, { headers: { 'content-type': 'application/xml', 'content-disposition': `attachment; filename="${name}-firmado.xml"` } });
  }
  const out = new FormData();
  out.append('xml', new Blob([xml], { type: 'application/xml' }), `${name}.xml`);
  let res;
  try { res = await alanube(`/sign-document/idCompany/${ecf.company_id}`, { method: 'POST', form: out }); } catch (e) { return json({ error: `Alanube: ${e.message}` }, 400); }
  const signed = typeof res === 'string' ? res : res.xml || res.signedXml || res.document || JSON.stringify(res);
  return new Response(signed, { headers: { 'content-type': 'application/xml', 'content-disposition': `attachment; filename="${name}-firmado.xml"` } });
}
