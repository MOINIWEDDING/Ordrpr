import { ecfEnv } from '@/lib/ecf/alanube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Con qué está conectada la facturación electrónica: simulación, sandbox o producción.
export async function GET() {
  return Response.json({ env: ecfEnv(), serviceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) });
}
