import { adminDb, userDb, bearer } from '@/lib/supabaseServer';
import { alanube, ecfStatusFrom } from '@/lib/ecf/alanube';
import { buildEcf, ecfPath } from '@/lib/ecf/build';

export const json = (data, status = 200) => Response.json(data, { status });

// Quien llama tiene que ser el dueño (con su sesión). Las escrituras van con la clave de servicio.
export async function requireOwner(req) {
  const token = bearer(req);
  const me = token ? userDb(token) : null;
  if (!me) return { error: json({ error: 'Inicia sesión como dueño.' }, 401) };
  const { data } = await me.rpc('is_staff');
  if (data !== true) return { error: json({ error: 'Solo el dueño puede configurar la facturación electrónica.' }, 403) };
  const admin = adminDb();
  if (!admin) return { error: json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en Vercel.' }, 501) };
  return { me, admin };
}

export async function readSettings(admin) {
  const [{ data: ecf }, { data: site }] = await Promise.all([
    admin.from('ecf_settings').select('*').eq('id', 1).maybeSingle(),
    admin.from('site_settings').select('brand_name, business_legal_name, business_rnc, address, email, phone').eq('id', 1).maybeSingle(),
  ]);
  return { ecf: ecf || {}, site: site || {} };
}

// Envía (o consulta) las facturas pendientes. Lo llaman la caja, el carrito y la contabilidad después
// de cada venta; es seguro llamarlo de más: cada factura se toma una sola vez.
export async function processQueue(admin, limit = 10) {
  const { ecf, site } = await readSettings(admin);
  if (!ecf.company_id || !['activo', 'pausado'].includes(ecf.status)) return { processed: 0, reason: 'inactivo' };
  const { data: claimed, error } = await admin.rpc('ecf_claim', { limit_input: limit });
  if (error) return { processed: 0, error: error.message };
  const out = [];
  for (const inv of claimed || []) {
    try {
      if (inv.ecf_id && inv.ecf_status === 'enviado') {
        const path = `${ecfPath(inv.ecf_type)}/${inv.ecf_id}/idCompany/${ecf.company_id}`;
        const doc = await alanube(path);
        const st = ecfStatusFrom(doc);
        await admin.from('invoices').update({ ecf_status: st, ecf_response: doc }).eq('id', inv.id);
        out.push({ id: inv.id, status: st });
        continue;
      }
      let encf = inv.ncf;
      if (!encf) {
        const { data: num, error: numError } = await admin.rpc('ecf_take_number', { doc_type_input: inv.ecf_type });
        if (numError) throw new Error(numError.message);
        encf = num;
        await admin.from('invoices').update({ ncf: encf }).eq('id', inv.id);
      }
      const body = buildEcf({ invoice: inv, business: site, companyId: ecf.company_id, encf, docType: inv.ecf_type });
      const doc = await alanube(ecfPath(inv.ecf_type), { method: 'POST', body });
      const st = ecfStatusFrom(doc);
      await admin.from('invoices').update({
        ecf_status: st, ecf_id: doc.id || null, ecf_security_code: doc.securityCode || null, ecf_stamp_url: doc.documentStampUrl || null,
        ecf_pdf: doc.pdf || null, ecf_signed_at: doc.signatureDate || null, ecf_response: doc, ecf_last_error: null,
      }).eq('id', inv.id);
      out.push({ id: inv.id, status: st, encf });
    } catch (e) {
      await admin.from('invoices').update({ ecf_status: 'error', ecf_last_error: String(e.message || e).slice(0, 500), ecf_response: e.data || null }).eq('id', inv.id);
      out.push({ id: inv.id, status: 'error', error: e.message });
    }
  }
  return { processed: out.length, results: out };
}
