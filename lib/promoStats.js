import { sb } from '@/lib/supabaseClient';
import { dayKey, startOfDay, addDays } from '@/lib/stats';

// Datos de los códigos promocionales para /promociones y su reporte: los códigos, cada canje
// (promo_redemptions) y los pedidos que llevaron un código (orders.promo).
export async function loadPromoData() {
  const [codesRes, redRes, ordersRes] = await Promise.all([
    sb.from('promo_codes').select('*').order('created_at', { ascending: false }),
    sb.from('promo_redemptions').select('code_id, user_id, created_at'),
    sb.from('orders').select('id, created_at, customer_name, subtotal, tax_amount, items, user_id, payment_method, promo').not('promo', 'is', null).order('created_at', { ascending: false }),
  ]);
  const error = codesRes.error || redRes.error || ordersRes.error;
  if (error) throw error;
  return { codes: codesRes.data || [], redemptions: redRes.data || [], orders: ordersRes.data || [] };
}

// La base de datos de este restaurante todavía no tiene las tablas (falta su migración).
export const missingPromoTables = (err) => /promo_codes|promo_redemptions|promo|schema cache|does not exist/i.test((err && err.message) || '');

// Números de un código (o de todos, si code es null).
export function promoStats(code, data) {
  const redemptions = code ? data.redemptions.filter((r) => r.code_id === code.id) : data.redemptions;
  const orders = code ? data.orders.filter((o) => o.promo && o.promo.code_id === code.id) : data.orders;
  const revenue = orders.reduce((s, o) => s + Number(o.subtotal || 0), 0);
  const discount = orders.reduce((s, o) => s + Number((o.promo && o.promo.discount) || 0), 0);
  const withAccount = orders.filter((o) => o.user_id).length;

  const productMap = {};
  orders.forEach((o) => (o.items || []).forEach((it) => {
    const key = it.id || it.name;
    if (!productMap[key]) productMap[key] = { name: it.name, qty: 0, revenue: 0 };
    productMap[key].qty += it.qty;
    productMap[key].revenue += it.qty * it.price;
  }));
  const products = Object.values(productMap).sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);

  return {
    uses: redemptions.length,
    orderCount: orders.length,
    revenue,
    discount,
    avgTicket: orders.length ? revenue / orders.length : 0,
    withAccount,
    guests: orders.length - withAccount,
    products,
    orders,
    redemptions,
    lastUse: redemptions.reduce((m, r) => (!m || r.created_at > m ? r.created_at : m), null),
  };
}

// Canjes y ventas por día, del primer día del código (o hace `maxDays`) hasta hoy o su fin.
export function promoDaily(code, stats, maxDays = 31) {
  const today = startOfDay(dayKey(new Date()));
  let end = today;
  if (code && code.ends_at) {
    const e = startOfDay(dayKey(new Date(new Date(code.ends_at).getTime() - 1)));
    if (e < end) end = e;
  }
  const firstUse = stats.redemptions.reduce((m, r) => (!m || r.created_at < m ? r.created_at : m), null);
  const from = [code && code.starts_at, code && code.created_at, firstUse].filter(Boolean).map((d) => startOfDay(dayKey(new Date(d))));
  let start = from.length ? new Date(Math.min(...from)) : addDays(end, -13);
  if (Math.round((end - start) / 86400000) + 1 > maxDays) start = addDays(end, -(maxDays - 1));
  if (start > end) start = end;
  const days = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) days.push({ key: dayKey(d), date: new Date(d), uses: 0, sales: 0 });
  const index = Object.fromEntries(days.map((d, i) => [d.key, i]));
  stats.redemptions.forEach((r) => { const i = index[dayKey(new Date(r.created_at))]; if (i !== undefined) days[i].uses += 1; });
  stats.orders.forEach((o) => { const i = index[dayKey(new Date(o.created_at))]; if (i !== undefined) days[i].sales += Number(o.subtotal || 0); });
  return days;
}
