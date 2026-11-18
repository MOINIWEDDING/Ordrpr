import { adminDb } from '@/lib/supabaseServer';
import { ecfStatusFrom, webhookSecret } from '@/lib/ecf/alanube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Alanube avisa aquí cuando la DGII termina de procesar un documento.
export async function POST(req) {
  if (req.headers.get('x-ordrpr-ecf') !== webhookSecret()) return Response.json({ error: 'no autorizado' }, { status: 401 });
  const admin = adminDb();
  if (!admin) return Response.json({ error: 'sin clave de servicio' }, { status: 501 });
  let body = {};
  try { body = await req.json(); } catch (e) { return Response.json({ error: 'cuerpo inválido' }, { status: 400 }); }
  const doc = body.document || body.data || body;
  const id = doc && (doc.id || doc.documentId);
  if (!id) return Response.json({ ok: true, ignored: true });
  const st = ecfStatusFrom(doc);
  await admin.from('invoices').update({
    ecf_status: st, ecf_response: doc,
    ...(doc.securityCode ? { ecf_security_code: doc.securityCode } : {}),
    ...(doc.documentStampUrl ? { ecf_stamp_url: doc.documentStampUrl } : {}),
    ...(doc.pdf ? { ecf_pdf: doc.pdf } : {}),
  }).eq('ecf_id', id);
  return Response.json({ ok: true });
}
