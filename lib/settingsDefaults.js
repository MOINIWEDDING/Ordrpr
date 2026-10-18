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
