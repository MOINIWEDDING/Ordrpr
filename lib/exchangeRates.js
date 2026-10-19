// Tasas de cambio (solo en el servidor).
//
// - Dólar y euro contra el peso dominicano: se leen de la página de Banreservas
//   (celdas "tasacambio-compraUS", "tasacambio-compraEU"). Se usa la tasa de COMPRA del banco:
//   es lo que el restaurante recibe al cambiar los dólares o euros que le pagan.
// - Las demás monedas, o si Banreservas no responde: open.er-api.com, un servicio abierto
//   que actualiza sus tasas una vez al día.
//
// Cada consulta se guarda en caché unas horas, así la tasa se renueva varias veces al día
// sin consultar las fuentes en cada visita.

const CACHE_SECONDS = 6 * 60 * 60;
const BANRESERVAS_URL = 'https://www.banreservas.com/';
const OPEN_RATES_URL = 'https://open.er-api.com/v6/latest/';

// "60.25", "60,25" o "RD$ 60.2500" → 60.25
function toNumber(text) {
  const clean = String(text || '').replace(/[^\d.,]/g, '');
  if (!clean) return null;
  const normalized = clean.includes('.') ? clean.replace(/,/g, '') : clean.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Busca el número dentro del elemento con esa clase en el HTML de Banreservas.
export function readBanreservasRate(html, className) {
  const re = new RegExp(`class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]{0,200}?)</`, 'i');
  const m = String(html || '').match(re);
  if (!m) return null;
  return toNumber(m[1].replace(/<[^>]+>/g, ' '));
}

async function banreservasRates() {
  const res = await fetch(BANRESERVAS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; restaurante)' },
    next: { revalidate: CACHE_SECONDS },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Banreservas respondió ${res.status}`);
  const html = await res.text();
  const out = {};
  const usd = readBanreservasRate(html, 'tasacambio-compraUS');
  const eur = readBanreservasRate(html, 'tasacambio-compraEU');
  if (usd) out.USD = usd;
  if (eur) out.EUR = eur;
  return out;
}

// Cuántas unidades de la moneda principal vale 1 unidad de cada moneda pedida.
async function openRates(base) {
  const res = await fetch(`${OPEN_RATES_URL}${encodeURIComponent(base)}`, {
    next: { revalidate: CACHE_SECONDS },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`open.er-api respondió ${res.status}`);
  const data = await res.json();
  if (data.result !== 'success' || !data.rates) throw new Error('open.er-api sin tasas');
  const out = {};
  Object.entries(data.rates).forEach(([code, perBase]) => {
    if (perBase > 0) out[code] = 1 / perBase; // la API da "unidades de code por 1 base"; se invierte
  });
  return { rates: out, updated: data.time_last_update_utc || null };
}

// Devuelve { CODE: { rate, source, updated } } para cada código que se pudo obtener.
export async function getExchangeRates(base, codes) {
  const wanted = [...new Set(codes.filter((c) => c && c !== base))];
  const result = {};
  if (!wanted.length) return result;

  if (base === 'DOP' && wanted.some((c) => c === 'USD' || c === 'EUR')) {
    try {
      const br = await banreservasRates();
      const today = new Date().toISOString();
      ['USD', 'EUR'].forEach((c) => {
        if (wanted.includes(c) && br[c]) result[c] = { rate: br[c], source: 'Banreservas', updated: today };
      });
    } catch (e) {
      console.error('tasas: Banreservas no disponible', e.message);
    }
  }

  const missing = wanted.filter((c) => !result[c]);
  if (missing.length) {
    try {
      const open = await openRates(base);
      missing.forEach((c) => {
        if (open.rates[c]) result[c] = { rate: Math.round(open.rates[c] * 10000) / 10000, source: 'open.er-api.com', updated: open.updated };
      });
    } catch (e) {
      console.error('tasas: open.er-api no disponible', e.message);
    }
  }
  return result;
}
