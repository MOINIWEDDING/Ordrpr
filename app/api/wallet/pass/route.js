import { walletConfig } from '@/lib/wallet/config';
import { walletDb, httpDate } from '@/lib/wallet/db';
import { buildPkpass } from '@/lib/wallet/pkpass';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Descarga del pase (.pkpass) desde el botón "Agregar a Apple Wallet" de /pase.
export async function GET(req) {
  const config = walletConfig();
  if (!config.ok) return new Response('Apple Wallet no está configurado', { status: 501 });
  const { searchParams, origin } = new URL(req.url);
  const db = walletDb();
  if (!db) return new Response('Supabase no está configurado', { status: 501 });
  const { data, error } = await db.rpc('wallet_pass', { serial_input: searchParams.get('serial') || '', token_input: searchParams.get('token') || '' });
  if (error || !data) return new Response('Pase no encontrado', { status: 404 });
  const file = await buildPkpass(data, origin, config);
  return new Response(file, {
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': 'attachment; filename="pase.pkpass"',
      'Last-Modified': httpDate(data.updated_at),
      'Cache-Control': 'no-store',
    },
  });
}
