import { walletDb } from '@/lib/wallet/db';
import { iconImage } from '@/lib/wallet/images';
import { LOYALTY_PASS_COLORS } from '@/lib/wallet/defaults';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Logo para Google Wallet cuando el local no subió uno: la inicial del negocio con los colores del pase.
export async function GET() {
  const db = walletDb();
  if (!db) return new Response(null, { status: 501 });
  const [{ data: s }, { data: st }] = await Promise.all([
    db.from('loyalty_settings').select('bg_color, fg_color').eq('id', 1).maybeSingle(),
    db.from('site_settings').select('brand_name').eq('id', 1).maybeSingle(),
  ]);
  const png = await iconImage({ s: { ...LOYALTY_PASS_COLORS, ...(s || {}) }, logo: '', brand: (st && st.brand_name) || '' }, 23);
  return new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } });
}
