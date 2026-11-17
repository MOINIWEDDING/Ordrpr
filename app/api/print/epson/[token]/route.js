import { printDb, validToken } from '@/lib/print/db';
import { renderEpsonXml } from '@/lib/print/receipt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Epson Server Direct Print: la impresora (TM con ePOS) hace POST a esta dirección.
//   ConnectionType=GetRequest   → le devolvemos el siguiente ticket en ePOS-Print XML (o nada)
//   ConnectionType=SetResponse  → nos dice si lo imprimió (ResponseFile) y lo marcamos
// En la impresora se configura en "Server Direct Print" con esta URL.
export async function POST(req, { params }) {
  const { token: t } = await params;
  const db = printDb();
  if (!validToken(t) || !db) return new Response(null, { status: 404 });
  let form;
  try { form = Object.fromEntries(new URLSearchParams(await req.text())); } catch (e) { form = {}; }

  if (form.ConnectionType === 'SetResponse') {
    const xml = String(form.ResponseFile || '');
    const job = (xml.match(/printjobid[^>]*>\s*([0-9a-f-]{36})/i) || [])[1] || null;
    const ok = /success\s*=\s*"true"/i.test(xml);
    await db.rpc('print_ack', { token_input: t, job_input: job, ok_input: ok, error_input: ok ? null : xml.slice(0, 280) });
    return new Response(null, { status: 200 });
  }

  const { data } = await db.rpc('print_take', { token_input: t });
  if (!data || !data.job) return new Response('', { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
  return new Response(renderEpsonXml(data.job, data.printer && data.printer.paper), { headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
}
