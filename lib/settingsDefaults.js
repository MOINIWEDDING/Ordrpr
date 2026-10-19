import { DEFAULT_PRIMARY } from './theme';

// Valores que se usan antes de que el dueño configure su negocio (o si Supabase no está conectado).
export const DEFAULT_SETTINGS = {
  brand_name: 'Mi Restaurante',
  tagline: '',
  description: '',
  logo_url: '',
  primary_color: DEFAULT_PRIMARY,
  city: '',
  address: '',
  phone: '',
  whatsapp: '',
  email: '',
  instagram: '',
  facebook: '',
  hours: '',
  currency_symbol: '$',
  currency_position: 'before', // 'before' | 'after'
  extra_currencies: [], // otras monedas que el cliente puede elegir al pagar: [{ name, symbol, position, rate }]
  locale: 'es-DO',
  gift_card_prefix: 'GC',
  order_messages: {}, // avisos de estado del pedido (ver lib/orderMessages.js)
  setup_completed: false,
};

// Formato de dinero global: money() lo lee desde aquí, así los ~20 lugares donde se usa no cambian.
let currency = { symbol: DEFAULT_SETTINGS.currency_symbol, position: DEFAULT_SETTINGS.currency_position, locale: DEFAULT_SETTINGS.locale };

export function setCurrencyFormat(next) { currency = { ...currency, ...next }; }

export function formatMoney(n) {
  const num = Number(n) || 0;
  let formatted;
  try { formatted = num.toLocaleString(currency.locale || 'es-DO'); } catch (e) { formatted = String(num); }
  return currency.position === 'after' ? `${formatted}${currency.symbol}` : `${currency.symbol}${formatted}`;
}

// Monedas para pagar: la principal (en la que están los precios) y las que agregó el dueño.
// rate = cuántas unidades de la moneda principal vale 1 unidad de esta (1 US$ = 60 RD$ → rate 60).
export function paymentCurrencies(settings) {
  const base = { name: '', symbol: settings.currency_symbol || '$', position: settings.currency_position || 'before', rate: 1, base: true };
  const extras = (Array.isArray(settings.extra_currencies) ? settings.extra_currencies : [])
    .filter((c) => c && c.symbol && Number(c.rate) > 0)
    .map((c) => ({ name: c.name || '', symbol: c.symbol, position: c.position === 'after' ? 'after' : 'before', rate: Number(c.rate) }));
  return [base, ...extras];
}

// Un monto de la moneda principal, pasado a otra moneda (con centavos).
export function convertFromBase(n, cur) {
  if (!cur || cur.base) return Number(n) || 0;
  return Math.round(((Number(n) || 0) / cur.rate) * 100) / 100;
}

export function formatIn(n, cur) {
  if (!cur || cur.base) return formatMoney(n);
  const num = Number(n) || 0;
  let formatted;
  try { formatted = num.toLocaleString(currency.locale || 'es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch (e) { formatted = num.toFixed(2); }
  return cur.position === 'after' ? `${formatted}${cur.symbol}` : `${cur.symbol}${formatted}`;
}
