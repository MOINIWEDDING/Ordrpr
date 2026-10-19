import { walletConfig } from '@/lib/wallet/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Si Apple Wallet está listo en este servidor (sin mostrar ningún secreto).
export async function GET() {
  const c = walletConfig();
  return Response.json({ enabled: c.ok, missing: c.missing || [], error: c.ok ? undefined : c.error });
}
