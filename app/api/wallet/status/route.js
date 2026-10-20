import { walletConfig } from '@/lib/wallet/config';
import { googleConfig } from '@/lib/wallet/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Si Apple Wallet y Google Wallet están listos en este servidor (sin mostrar ningún secreto).
export async function GET() {
  const a = walletConfig();
  const g = googleConfig();
  return Response.json({
    enabled: a.ok, missing: a.missing || [], error: a.ok ? undefined : a.error,
    google: { enabled: g.ok, missing: g.missing || [], error: g.ok ? undefined : g.error },
  });
}
