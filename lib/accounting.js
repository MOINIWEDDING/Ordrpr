import { sb } from '@/lib/supabaseClient';
import { PAY_LABELS, dayKey } from '@/lib/stats';

// Contabilidad: todo sale de las facturas (cada venta tiene la suya: pedidos de la web, cuentas de las
// mesas y pagos por persona). Los pedidos viejos que no tienen factura se suman aparte como «sin factura»
// para que el total cuadre. Lo usan Estadísticas → Económicas, /contabilidad y sus reportes PDF y CSV.

export const ECF_NAME = { pendiente: 'Pendiente', enviando: 'Enviando', enviado: 'En espera de la DGII', aceptado: 'Aceptado', aceptado_obs: 'Aceptado con observaciones', rechazado: 'Rechazado', error: 'Error de envío' };
export const PAY_NAME = { ...PAY_LABELS, gift_card: 'Gift card', en_linea: 'En línea', cuenta: 'Cuenta abierta' };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export async function loadAccounting({ branch, start, end }) {
  const between = (q, col) => (start ? q.gte(col, start.toISOString()).lt(col, end.toISOString()) : q);
  const byBranch = (q) => (branch ? q.eq('branch', branch) : q);
  const [inv, ord, items, gifts, people, open, taxes] = await Promise.all([
    byBranch(between(sb.from('invoices').select('*'), 'issued_at')).order('issued_at'),
    byBranch(between(sb.from('orders').select('id, created_at, branch, tab_id, subtotal, tax_amount, payment_method, items, promo, customer_name, table_number'), 'created_at')),
    sb.from('menu_items').select('id, name, category, cost, price'),
    between(sb.from('gift_cards').select('id, amount, status, created_at, redeemed_at'), 'created_at'),
    sb.rpc('accounting_people'),
    byBranch(sb.from('tabs').select('id, branch, table_label, created_at').in('status', ['open', 'bill'])),
    sb.from('tax_settings').select('*'),
  ]);
  const err = inv.error || ord.error || items.error;
  if (err) throw err;
  let openOrders = [];
  const openIds = (open.data || []).map((t) => t.id);
  if (openIds.length) {
    const { data } = await sb.from('orders').select('id, tab_id, subtotal, tax_amount, tab_payment_id').in('tab_id', openIds);
    openOrders = (data || []).filter((o) => !o.tab_payment_id);
  }
  return {
    invoices: inv.data || [], orders: ord.data || [], menuItems: items.data || [], giftCards: gifts.data || [],
    people: people.data || [], openTabs: open.data || [], openOrders, taxSettings: taxes.data || [],
  };
}

// Las ventas como filas iguales: las facturas y, aparte, los pedidos sin factura.
function salesRows(data) {
  const invoicedOrders = new Set(data.invoices.map((i) => i.order_id).filter(Boolean));
  const rows = data.invoices.map((i) => ({
    id: i.id, number: i.number, ncf: i.ncf || '', date: new Date(i.issued_at), kind: i.kind, branch: i.branch || '',
    table: i.table_label || '', customer: i.customer_name || '', rnc: (i.fiscal && i.fiscal.rnc) || '', fiscalName: (i.fiscal && i.fiscal.name) || '',
    items: i.items || [], subtotal: Number(i.subtotal || 0), discount: Number(i.discount || 0),
    taxLines: (i.tax_lines || []).map((l) => ({ label: l.label, amount: Number(l.amount || 0) })),
    tip: Number(i.tip || 0), total: Number(i.total || 0), payments: i.payments || [], currency: i.currency || null,
    waiter: i.waiter_id, cashier: i.cashier_id, void: i.status === 'anulada', legacy: false,
    ecfType: i.ecf_type || '', ecfStatus: i.ecf_status || '',
  }));
  data.orders.filter((o) => !o.tab_id && !invoicedOrders.has(o.id)).forEach((o) => {
    const discount = Number((o.promo && o.promo.discount) || 0);
    rows.push({
      id: o.id, number: null, ncf: '', date: new Date(o.created_at), kind: 'order', branch: o.branch || '', table: o.table_number || '',
      customer: o.customer_name || '', rnc: '', fiscalName: '', items: o.items || [],
      subtotal: Number(o.subtotal || 0) + discount, discount,
      taxLines: Number(o.tax_amount || 0) ? [{ label: 'Impuestos (sin desglose)', amount: Number(o.tax_amount || 0) }] : [],
      tip: 0, total: Number(o.subtotal || 0) + Number(o.tax_amount || 0),
      payments: [{ method: o.payment_method || 'otro', amount: Number(o.subtotal || 0) + Number(o.tax_amount || 0) }],
      currency: null, waiter: null, cashier: null, void: false, legacy: true,
    });
  });
  return rows.sort((a, b) => a.date - b.date);
}

// Cuánto de cada factura entró por cada forma de pago (si se anotó de más, se reparte en proporción al total).
function paymentSplit(row) {
  const paid = row.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const k = paid > row.total && paid > 0 ? row.total / paid : 1;
  return row.payments.map((p) => ({ method: p.method || 'otro', amount: Number(p.amount || 0) * k }));
}

export function computeAccounting(data) {
  const rows = salesRows(data);
  const valid = rows.filter((x) => !x.void);
  const voided = rows.filter((x) => x.void);
  const costById = {}; const catById = {}; const nameById = {};
  data.menuItems.forEach((m) => { costById[m.id] = Number(m.cost || 0); catById[m.id] = m.category; nameById[m.id] = m.name; });
  const personName = {}; data.people.forEach((p) => { personName[p.id] = p.name; });
  const hasCost = data.menuItems.some((m) => Number(m.cost || 0) > 0);

  // impuestos por nombre (ITBIS, Ley…) en el orden de la configuración
  const taxOrder = [];
  data.taxSettings.forEach((t) => (t.charges || []).forEach((c) => { if (!taxOrder.includes(c.label)) taxOrder.push(c.label); }));
  valid.forEach((x) => x.taxLines.forEach((l) => { if (!taxOrder.includes(l.label)) taxOrder.push(l.label); }));

  const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);
  const gross = sum(valid, (x) => x.subtotal);
  const discounts = sum(valid, (x) => x.discount);
  const net = gross - discounts;
  const taxes = taxOrder.map((label) => ({ label, amount: sum(valid, (x) => sum(x.taxLines.filter((l) => l.label === label), (l) => l.amount)) }));
  const taxTotal = sum(taxes, (t) => t.amount);
  const tips = sum(valid, (x) => x.tip);
  const collected = sum(valid, (x) => x.total);

  // costo de lo vendido con el costo actual de cada producto
  const products = {};
  valid.forEach((x) => x.items.forEach((it) => {
    const key = it.id || it.name;
    const p = products[key] || (products[key] = { id: it.id, name: it.name || nameById[it.id] || 'Producto', category: catById[it.id] || 'Otros', qty: 0, sales: 0, unitCost: costById[it.id] || 0 });
    p.qty += Number(it.qty || 0);
    p.sales += Number(it.qty || 0) * Number(it.price || 0);
  }));
  const productList = Object.values(products).map((p) => ({ ...p, cost: p.unitCost * p.qty, margin: p.sales - p.unitCost * p.qty })).sort((a, b) => b.sales - a.sales);
  const cogs = sum(productList, (p) => p.cost);

  const methods = {};
  valid.forEach((x) => paymentSplit(x).forEach((p) => {
    const m = methods[p.method] || (methods[p.method] = { method: p.method, label: PAY_NAME[p.method] || p.method, amount: 0, count: 0 });
    m.amount += p.amount; m.count += 1;
  }));
  const methodList = Object.values(methods).sort((a, b) => b.amount - a.amount);

  const currencies = {};
  valid.forEach((x) => {
    const c = x.currency && x.currency.code ? x.currency : null;
    const code = c ? c.code : 'base';
    const row = currencies[code] || (currencies[code] = { code, symbol: c ? c.symbol : '', name: c ? c.name : 'Moneda principal', base: !c, collected: 0, equivalent: 0, count: 0 });
    row.equivalent += x.total; row.collected += c ? Number(c.total || 0) : x.total; row.count += 1;
  });

  const categories = {};
  productList.forEach((p) => { categories[p.category] = (categories[p.category] || 0) + p.sales; });

  const days = {};
  valid.forEach((x) => {
    const k = dayKey(x.date);
    const d = days[k] || (days[k] = { day: k, count: 0, gross: 0, discount: 0, net: 0, taxes: {}, tips: 0, total: 0, cost: 0 });
    d.count += 1; d.gross += x.subtotal; d.discount += x.discount; d.net += x.subtotal - x.discount; d.tips += x.tip; d.total += x.total;
    x.taxLines.forEach((l) => { d.taxes[l.label] = (d.taxes[l.label] || 0) + l.amount; });
    x.items.forEach((it) => { d.cost += (costById[it.id] || 0) * Number(it.qty || 0); });
  });

  const staff = {};
  valid.forEach((x) => {
    if (!x.waiter) return;
    const s = staff[x.waiter] || (staff[x.waiter] = { id: x.waiter, name: personName[x.waiter] || 'Sin nombre', count: 0, net: 0, tips: 0 });
    s.count += 1; s.net += x.subtotal - x.discount; s.tips += x.tip;
  });

  const fiscal = valid.filter((x) => x.rnc);
  const numbered = valid.filter((x) => x.number).map((x) => x.number);
  const giftSold = sum(data.giftCards, (g) => Number(g.amount || 0));
  const giftRedeemed = methods.gift_card ? methods.gift_card.amount : 0;
  const receivable = sum(data.openOrders, (o) => Number(o.subtotal || 0) + Number(o.tax_amount || 0));

  return {
    rows, valid, voided, taxOrder, hasCost,
    totals: {
      count: valid.length, gross, discounts, net, taxes, taxTotal, tips, collected,
      avgTicket: valid.length ? collected / valid.length : 0,
      cogs, grossProfit: net - cogs, marginPct: net > 0 ? ((net - cogs) / net) * 100 : 0,
    },
    invoicesInfo: {
      issued: valid.filter((x) => !x.legacy).length,
      first: numbered.length ? Math.min(...numbered) : null,
      last: numbered.length ? Math.max(...numbered) : null,
      fiscalCount: fiscal.length, fiscalAmount: sum(fiscal, (x) => x.total),
      finalCount: valid.length - fiscal.length, finalAmount: collected - sum(fiscal, (x) => x.total),
      voidCount: voided.length, voidAmount: sum(voided, (x) => x.total),
      ecfAccepted: valid.filter((x) => x.ecfStatus === 'aceptado' || x.ecfStatus === 'aceptado_obs').length,
      ecfPending: valid.filter((x) => ['pendiente', 'enviando', 'enviado', 'error'].includes(x.ecfStatus)).length,
      ecfRejected: valid.filter((x) => x.ecfStatus === 'rechazado').length,
      legacyCount: valid.filter((x) => x.legacy).length, legacyAmount: sum(valid.filter((x) => x.legacy), (x) => x.total),
    },
    methods: methodList,
    currencies: Object.values(currencies).sort((a, b) => b.base - a.base || b.equivalent - a.equivalent),
    categories: Object.entries(categories).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    products: productList,
    days: Object.values(days).sort((a, b) => (a.day < b.day ? -1 : 1)),
    staff: Object.values(staff).sort((a, b) => b.net - a.net),
    gift: { soldCount: data.giftCards.length, sold: giftSold, redeemed: giftRedeemed },
    receivable: { tabs: data.openTabs.length, amount: receivable },
  };
}

// ---------- CSV ----------
const esc = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (head, rows) => [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
const n2 = (v) => r2(v).toFixed(2);
const fmtDate = (d) => dayKey(d);
const fmtTime = (d) => d.toTimeString().slice(0, 5);

export function accountingCsv(kind, acc, { branchName = () => '' } = {}) {
  const t = acc.totals;
  if (kind === 'resumen') {
    const lines = [
      ['Facturas', t.count], ['Ventas brutas', n2(t.gross)], ['Descuentos', n2(t.discounts)], ['Ventas netas', n2(t.net)],
      ...t.taxes.map((x) => [x.label, n2(x.amount)]), ['Total impuestos', n2(t.taxTotal)], ['Propinas', n2(t.tips)],
      ['Total cobrado', n2(t.collected)], ['Ticket promedio', n2(t.avgTicket)],
      ...(acc.hasCost ? [['Costo de lo vendido', n2(t.cogs)], ['Ganancia bruta', n2(t.grossProfit)], ['Margen bruto %', n2(t.marginPct)]] : []),
      ['Facturas con crédito fiscal (RNC)', acc.invoicesInfo.fiscalCount], ['Monto con crédito fiscal', n2(acc.invoicesInfo.fiscalAmount)],
      ['Facturas de consumo final', acc.invoicesInfo.finalCount], ['Monto de consumo final', n2(acc.invoicesInfo.finalAmount)],
      ['Facturas anuladas', acc.invoicesInfo.voidCount], ['Monto anulado', n2(acc.invoicesInfo.voidAmount)],
      ['Primera factura', acc.invoicesInfo.first || ''], ['Última factura', acc.invoicesInfo.last || ''],
      ...acc.methods.map((m) => [`Cobrado en ${m.label}`, n2(m.amount)]),
      ['Gift cards vendidas', n2(acc.gift.sold)], ['Gift cards canjeadas', n2(acc.gift.redeemed)],
      ['Por cobrar (cuentas abiertas)', n2(acc.receivable.amount)],
    ];
    return toCsv(['Concepto', 'Valor'], lines);
  }
  if (kind === 'facturas') {
    return toCsv(
      ['Número', 'NCF', 'Fecha', 'Hora', 'Tipo', 'Sucursal', 'Mesa', 'Cliente', 'RNC/Cédula', 'Razón social', 'Subtotal', 'Descuento', ...acc.taxOrder, 'Propina', 'Total', 'Formas de pago', 'Estado', 'Tipo e-CF', 'Estado ante la DGII'],
      acc.rows.map((x) => [
        x.number ? `F-${String(x.number).padStart(6, '0')}` : 'Sin factura', x.ncf, fmtDate(x.date), fmtTime(x.date),
        x.kind === 'tab' ? 'Cuenta de mesa' : 'Pedido', branchName(x.branch), x.table, x.customer, x.rnc, x.fiscalName,
        n2(x.subtotal), n2(x.discount), ...acc.taxOrder.map((label) => n2(x.taxLines.filter((l) => l.label === label).reduce((s, l) => s + l.amount, 0))),
        n2(x.tip), n2(x.total), paymentSplit(x).map((p) => `${PAY_NAME[p.method] || p.method} ${n2(p.amount)}`).join(' + '), x.void ? 'Anulada' : 'Emitida',
        x.ecfType ? `E${x.ecfType}` : '', ECF_NAME[x.ecfStatus] || '',
      ]),
    );
  }
  if (kind === 'dias') {
    return toCsv(
      ['Fecha', 'Facturas', 'Ventas brutas', 'Descuentos', 'Ventas netas', ...acc.taxOrder, 'Propinas', 'Total cobrado', ...(acc.hasCost ? ['Costo', 'Ganancia bruta'] : [])],
      acc.days.map((d) => [d.day, d.count, n2(d.gross), n2(d.discount), n2(d.net), ...acc.taxOrder.map((l) => n2(d.taxes[l] || 0)), n2(d.tips), n2(d.total), ...(acc.hasCost ? [n2(d.cost), n2(d.net - d.cost)] : [])]),
    );
  }
  if (kind === 'pagos') {
    const total = Math.max(1, acc.methods.reduce((s, m) => s + m.amount, 0));
    return toCsv(['Forma de pago', 'Transacciones', 'Monto', '% del total'], acc.methods.map((m) => [m.label, m.count, n2(m.amount), n2((m.amount / total) * 100)]));
  }
  if (kind === 'productos') {
    return toCsv(['Producto', 'Categoría', 'Cantidad', 'Ventas', 'Costo unitario', 'Costo total', 'Ganancia bruta'],
      acc.products.map((p) => [p.name, p.category, p.qty, n2(p.sales), n2(p.unitCost), n2(p.cost), n2(p.margin)]));
  }
  if (kind === 'personal') {
    return toCsv(['Camarero', 'Cuentas', 'Ventas netas', 'Propinas'], acc.staff.map((s) => [s.name, s.count, n2(s.net), n2(s.tips)]));
  }
  return '';
}

export const CSV_FILES = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'facturas', label: 'Facturas (detalle)' },
  { id: 'dias', label: 'Ventas por día' },
  { id: 'pagos', label: 'Formas de pago' },
  { id: 'productos', label: 'Productos, costo y margen' },
  { id: 'personal', label: 'Ventas y propinas por camarero' },
];

export function downloadCsv(filename, text) {
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
