import { walletDb } from '@/lib/wallet/db';
import { stripImage } from '@/lib/wallet/images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Imagen con los sellos para Google Wallet (la descarga Google cuando cambia el parámetro v).
export async function GET(req) {
  const db = walletDb();
  if (!db) return new Response(null, { status: 501 });
  const { searchParams } = new URL(req.url);
  const { data } = await db.rpc('wallet_pass', { serial_input: searchParams.get('serial') || '', token_input: searchParams.get('token') || '' });
  if (!data) return new Response(null, { status: 404 });
  let png;
  try { png = await stripImage({ s: data.settings, stamps: data.stamps }, 3); } catch (e) {
    png = await stripImage({ s: { ...data.settings, strip_image_url: '', stamp_image_url: '' }, stamps: data.stamps }, 3);
  }
  return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
