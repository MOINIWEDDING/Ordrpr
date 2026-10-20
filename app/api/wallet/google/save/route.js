import { googleConfig, saveUrl } from '@/lib/wallet/google';
import { walletDb } from '@/lib/wallet/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Botón "Agregar a Google Wallet" de /pase: firma el pase y manda al cliente a Google.
export async function GET(req) {
  const cfg = googleConfig();
  if (!cfg.ok) return new Response('Google Wallet no está configurado', { status: 501 });
  const db = walletDb();
  if (!db) return new Response('Supabase no está configurado', { status: 501 });
  const { searchParams, origin } = new URL(req.url);
  const { data, error } = await db.rpc('wallet_pass', { serial_input: searchParams.get('serial') || '', token_input: searchParams.get('token') || '' });
  if (error || !data) return new Response('Pase no encontrado', { status: 404 });
  return Response.redirect(saveUrl(data, origin, cfg), 302);
}
