import { alanube } from '@/lib/ecf/alanube';
import { json, requireOwner, readSettings } from '@/lib/ecf/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Paso 4: Alanube arma y envía a la DGII el set de pruebas de la certificación.
export async function POST(req) {
  const auth = await requireOwner(req);
  if (auth.error) return auth.error;
  const { ecf } = await readSettings(auth.admin);
  if (!ecf.company_id) return json({ error: 'Primero conecta la empresa con Alanube.' }, 400);
  let res;
  try {
    res = await alanube('/set-tests', { method: 'POST', body: { idCompany: ecf.company_id, retryNumber: Number((ecf.set_test && ecf.set_test.retries) || 0) } });
  } catch (e) { return json({ error: `Alanube: ${e.message}` }, 400); }
  const setTest = { id: res.id, status: res.status || 'PROCESSING', retries: Number((ecf.set_test && ecf.set_test.retries) || 0) + 1, at: new Date().toISOString(), last: res };
  await auth.admin.from('ecf_settings').update({ set_test: setTest, status: 'certificando', updated_at: new Date().toISOString() }).eq('id', 1);
  return json({ ok: true, set_test: setTest });
}

// Revisar cómo va el set de pruebas.
export async function GET(req) {
  const auth = await requireOwner(req);
  if (auth.error) return auth.error;
  const { ecf } = await readSettings(auth.admin);
  if (!ecf.set_test || !ecf.set_test.id) return json({ error: 'Todavía no se ha generado el set de pruebas.' }, 400);
  let res;
  try { res = await alanube(`/check-set-tests/${ecf.set_test.id}/idCompany/${ecf.company_id}`); } catch (e) { return json({ error: `Alanube: ${e.message}` }, 400); }
  const setTest = { ...ecf.set_test, status: res.status || ecf.set_test.status, checked: new Date().toISOString(), last: res };
  await auth.admin.from('ecf_settings').update({ set_test: setTest, updated_at: new Date().toISOString() }).eq('id', 1);
  return json({ ok: true, set_test: setTest });
}
