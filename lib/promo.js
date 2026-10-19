import { formatMoney } from './settingsDefaults';

// Códigos promocionales (tabla promo_codes, ver la migración 20261020120000_codigos_promocionales.sql).
// kind: 'percent' (value = %), 'amount' (value = monto en moneda principal),
//       'free_item' (item_id: un producto gratis si está en el pedido), 'message' (solo el mensaje).

export const PROMO_KINDS = [
  { id: 'percent', label: 'Porcentaje' },
  { id: 'amount', label: 'Monto fijo' },
  { id: 'free_item', label: 'Producto gratis' },
  { id: 'message', label: 'Solo mensaje' },
];

export const CODE_RE = /^[A-Z0-9_-]{3,24}$/;

export const cleanCode = (v) => String(v || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9_-]/g, '').slice(0, 24);

// Sin letras que se confunden (O/0, I/1).
export function randomCode(prefix = '') {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return cleanCode(prefix ? `${prefix}-${out}` : out);
}

// Lo que hace el código, en pocas palabras ("20% de descuento").
export function promoSummary(p, itemName) {
  if (!p) return '';
  if (p.kind === 'percent') return `${Number(p.value) || 0}% de descuento`;
  if (p.kind === 'amount') return `${formatMoney(Number(p.value) || 0)} de descuento`;
  if (p.kind === 'free_item') return `${itemName || 'Producto'} gratis`;
  return 'Mensaje especial';
}

// Cuánto descuenta el código en un pedido. lines: [{ id, price, qty }] con los precios que se cobran.
export function promoDiscount(p, lines, subtotal) {
  if (!p) return { amount: 0 };
  if (p.kind === 'percent') return { amount: Math.round((subtotal * Math.min(100, Number(p.value) || 0)) / 100) };
  if (p.kind === 'amount') return { amount: Math.min(subtotal, Number(p.value) || 0) };
  if (p.kind === 'free_item') {
    const line = lines.find((l) => l.id === p.item_id);
    return line ? { amount: Math.min(subtotal, line.price) } : { amount: 0, missingItem: true };
  }
  return { amount: 0 };
}

// Estado del código ahora mismo, para la lista del dueño.
export function promoStatus(p, uses = 0, now = new Date()) {
  if (!p.active) return { id: 'paused', label: 'Pausado' };
  if (p.ends_at && now >= new Date(p.ends_at)) return { id: 'expired', label: 'Vencido' };
  if (p.max_uses && uses >= p.max_uses) return { id: 'soldout', label: 'Agotado' };
  if (p.starts_at && now < new Date(p.starts_at)) return { id: 'scheduled', label: 'Programado' };
  return { id: 'active', label: 'Activo' };
}

const fmtDate = (d) => new Date(d).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
const fmtDateTime = (d) => `${fmtDate(d)}, ${new Date(d).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' })}`;

// "Hasta 31 oct 2026", "Desde 1 nov 2026", "1 nov – 30 nov 2026" o "Sin fecha de vencimiento".
export function promoWindow(p, withTime = false) {
  const f = withTime ? fmtDateTime : fmtDate;
  if (p.starts_at && p.ends_at) return `${f(p.starts_at)} – ${f(p.ends_at)}`;
  if (p.ends_at) return `Hasta ${f(p.ends_at)}`;
  if (p.starts_at) return `Desde ${f(p.starts_at)}`;
  return 'Sin fecha de vencimiento';
}

// Mensaje para el cliente cuando el código no se puede usar (reason de check_promo_code).
export function promoError(res) {
  const r = res && res.reason;
  if (r === 'expired') return 'Este código ya venció.';
  if (r === 'not_started') return `Este código se puede usar desde el ${fmtDateTime(res.starts_at)}.`;
  if (r === 'sold_out') return 'Este código ya se agotó.';
  if (r === 'login') return 'Inicia sesión para usar este código.';
  if (r === 'already_used') return 'Ya usaste este código.';
  if (r === 'min_subtotal') return `Este código es para compras desde ${formatMoney(Number(res.min_subtotal) || 0)}.`;
  return 'Ese código no existe.';
}
