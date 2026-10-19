import { walletConfig } from '@/lib/wallet/config';
import { walletDb, httpDate } from '@/lib/wallet/db';
import { buildPkpass } from '@/lib/wallet/pkpass';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Servicio web que Apple Wallet usa para registrar aparatos y bajar la versión nueva de un pase:
// https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes
const passToken = (req) => (req.headers.get('authorization') || '').replace(/^ApplePass\s+/i, '');
const empty = (status) => new Response(null, { status });

function setup() {
  const config = walletConfig();
  const db = walletDb();
  return { config, db, ok: config.ok && db };
}

export async function GET(req, { params }) {
  const { path = [] } = await params;
  const { config, db, ok } = setup();
  if (!ok) return empty(503);

  // GET /v1/devices/{device}/registrations/{passType}?passesUpdatedSince=…
  if (path[0] === 'devices' && path[2] === 'registrations' && path.length === 4) {
    if (path[3] !== config.passTypeId) return empty(404);
    const sinceRaw = new URL(req.url).searchParams.get('passesUpdatedSince');
    const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw).toISOString() : null;
    const { data, error } = await db.rpc('wallet_updated_serials', { device_input: path[1], since_input: since });
    if (error) return empty(500);
    if (!data || !data.length) return empty(204);
    const last = data.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), data[0].updated_at);
    return Response.json({ serialNumbers: data.map((r) => r.serial), lastUpdated: new Date(last).toISOString() });
  }

  // GET /v1/passes/{passType}/{serial}
  if (path[0] === 'passes' && path.length === 3) {
    if (path[1] !== config.passTypeId) return empty(404);
    const { data, error } = await db.rpc('wallet_pass', { serial_input: path[2], token_input: passToken(req) });
    if (error) return empty(500);
    if (!data) return empty(401);
    const modified = httpDate(data.updated_at);
    const since = req.headers.get('if-modified-since');
    if (since && Date.parse(since) >= Date.parse(modified)) return empty(304);
    const file = await buildPkpass(data, new URL(req.url).origin, config);
    return new Response(file, { headers: { 'Content-Type': 'application/vnd.apple.pkpass', 'Last-Modified': modified, 'Cache-Control': 'no-store' } });
  }
  return empty(404);
}

export async function POST(req, { params }) {
  const { path = [] } = await params;
  // POST /v1/log: Wallet manda aquí sus errores
  if (path[0] === 'log') {
    try { const body = await req.json(); console.warn('wallet log:', JSON.stringify(body.logs || body).slice(0, 2000)); } catch (e) { /* nada */ }
    return empty(200);
  }
  const { config, db, ok } = setup();
  if (!ok) return empty(503);
  // POST /v1/devices/{device}/registrations/{passType}/{serial}
  if (path[0] === 'devices' && path[2] === 'registrations' && path.length === 5) {
    if (path[3] !== config.passTypeId) return empty(404);
    let pushToken = '';
    try { pushToken = String((await req.json()).pushToken || ''); } catch (e) { return empty(400); }
    if (!pushToken) return empty(400);
    const { data, error } = await db.rpc('wallet_register', { device_input: path[1], push_token_input: pushToken, serial_input: path[4], token_input: passToken(req) });
    if (error) return empty(500);
    if (data === 'unauthorized') return empty(401);
    return empty(data === 'created' ? 201 : 200);
  }
  return empty(404);
}

export async function DELETE(req, { params }) {
  const { path = [] } = await params;
  const { config, db, ok } = setup();
  if (!ok) return empty(503);
  if (path[0] === 'devices' && path[2] === 'registrations' && path.length === 5) {
    if (path[3] !== config.passTypeId) return empty(404);
    const { data, error } = await db.rpc('wallet_unregister', { device_input: path[1], serial_input: path[4], token_input: passToken(req) });
    if (error) return empty(500);
    return empty(data === 'unauthorized' ? 401 : 200);
  }
  return empty(404);
}
