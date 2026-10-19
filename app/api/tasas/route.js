import { getExchangeRates } from '@/lib/exchangeRates';
import { CURRENCIES } from '@/lib/currencies';

export const runtime = 'nodejs';

const KNOWN = new Set(CURRENCIES.map((c) => c.code));

// GET /api/tasas?base=DOP&codes=USD,EUR → { base, rates: { USD: { rate, source, updated } } }
// rate = cuántas unidades de la moneda principal vale 1 unidad de esa moneda.
export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const base = (params.get('base') || 'DOP').toUpperCase();
  const codes = (params.get('codes') || '').toUpperCase().split(',').filter((c) => KNOWN.has(c)).slice(0, 10);
  if (!KNOWN.has(base)) return Response.json({ error: 'moneda principal no válida' }, { status: 400 });

  const rates = await getExchangeRates(base, codes);
  return Response.json({ base, rates }, {
    headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=3600' },
  });
}
