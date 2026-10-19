import { sb } from '@/lib/supabaseClient';
import { currencyInfo } from '@/lib/currencies';

// Cálculos de las estadísticas del dueño. Los usan la página /estadisticas y el reporte en PDF,
// así ambos muestran exactamente los mismos números.

export const GENDER_LABELS = { femenino: 'Femenino', masculino: 'Masculino', prefiero_no_decir: 'Prefiero no decir', sin_dato: 'Sin dato' };
export const PAY_LABELS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', gift_card: 'Tarjeta de regalo' };
export const DAY_LABELS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

// Los días se manejan como 'AAAA-MM-DD' en la hora del aparato del dueño,
// para que "hoy" sea el mismo día que ve en su teléfono.
export function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function startOfDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
export function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}
export const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
export const shortDate = (d) => d.toLocaleDateString('es', { day: 'numeric', month: 'short' });

export const PERIODS = [
  { id: 'dia', label: 'Día' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'custom', label: 'A vs B' },
  { id: 'todo', label: 'Todo' },
];

// Rango [start, end) del periodo que contiene el día elegido, y del periodo anterior.
// Las semanas van de lunes a domingo.
export function periodRange(period, key) {
  const d = startOfDay(key);
  if (period === 'semana') {
    const start = addDays(d, -((d.getDay() + 6) % 7));
    return { start, end: addDays(start, 7), prevStart: addDays(start, -7), prevEnd: start };
  }
  if (period === 'mes') {
    const start = addMonths(d, 0);
    return { start, end: addMonths(d, 1), prevStart: addMonths(d, -1), prevEnd: start };
  }
  return { start: d, end: addDays(d, 1), prevStart: addDays(d, -1), prevEnd: d };
}

// Línea de tiempo libre: { from, to } en 'AAAA-MM-DD', ambos días incluidos.
export function lineRange(line) {
  return { start: startOfDay(line.from), end: addDays(startOfDay(line.to), 1) };
}
export const lineDays = (r) => Math.round((r.end - r.start) / 86400000);
export function lineTitle(line) {
  if (line.from === line.to) return dayTitle(line.from);
  return `${shortDate(startOfDay(line.from))} – ${shortDate(startOfDay(line.to))}`;
}

export function periodTitle(period, range) {
  const now = new Date();
  const current = now >= range.start && now < range.end;
  if (period === 'semana') {
    if (current) return 'Esta semana';
    return `Semana del ${shortDate(range.start)} al ${shortDate(addDays(range.end, -1))}`;
  }
  if (period === 'mes') {
    if (current) return 'Este mes';
    return capitalize(range.start.toLocaleDateString('es', { month: 'long', year: 'numeric' }));
  }
  return dayTitle(dayKey(range.start));
}

export function dayTitle(key) {
  if (key === dayKey(new Date())) return 'Hoy';
  if (key === dayKey(addDays(new Date(), -1))) return 'Ayer';
  return capitalize(startOfDay(key).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }));
}

export const sumSubtotal = (list) => list.reduce((s, o) => s + Number(o.subtotal || 0), 0);

// Los números principales de un grupo de pedidos (se calculan igual para el periodo y para el anterior).
export function summarize(orders, costById) {
  const revenue = sumSubtotal(orders);
  let cost = 0;
  orders.forEach((o) => (o.items || []).forEach((it) => { cost += (costById[it.id] || 0) * it.qty; }));
  return {
    revenue,
    count: orders.length,
    avgTicket: orders.length ? revenue / orders.length : 0,
    card: sumSubtotal(orders.filter((o) => o.payment_method === 'tarjeta')),
    cash: sumSubtotal(orders.filter((o) => o.payment_method === 'efectivo')),
    profit: revenue - cost,
  };
}

// Ventas agrupadas por la moneda en que se pagó. Un pedido sin payment_currency se pagó en la moneda
// principal. "collected" es lo que entró en esa moneda (con impuestos); "equivalent", lo mismo en
// moneda principal, para poder comparar monedas entre sí.
export function salesByCurrency(orders, base) {
  const map = {};
  orders.forEach((o) => {
    const pc = o.payment_currency && o.payment_currency.code ? o.payment_currency : null;
    const code = pc ? pc.code : base.code;
    if (!map[code]) {
      map[code] = {
        code, base: !pc || code === base.code,
        symbol: pc ? pc.symbol : base.symbol, position: pc ? pc.position : base.position,
        name: (currencyInfo(code) || {}).name || (pc && pc.name) || code,
        collected: 0, equivalent: 0, count: 0, cash: 0, card: 0,
      };
    }
    const row = map[code];
    const equivalent = Number(o.subtotal || 0) + Number(o.tax_amount || 0);
    const collected = pc ? Number(pc.total || 0) : equivalent;
    row.collected += collected;
    row.equivalent += equivalent;
    row.count += 1;
    if (o.payment_method === 'efectivo') row.cash += collected;
    if (o.payment_method === 'tarjeta') row.card += collected;
  });
  return Object.values(map).sort((a, b) => (b.base - a.base) || (b.equivalent - a.equivalent));
}

// Trae los pedidos de las dos líneas de tiempo del rango (o todos, sin rango), los clientes,
// los productos y las gift cards del periodo.
export async function loadStatsData({ branch, range }) {
  const ordersBetween = (from, to) => {
    let q = sb.from('orders').select('*');
    if (branch) q = q.eq('branch', branch);
    if (from) q = q.gte('created_at', from.toISOString()).lt('created_at', to.toISOString());
    return q;
  };
  let giftQuery = sb.from('gift_cards').select('*');
  if (range) giftQuery = giftQuery.gte('created_at', range.start.toISOString()).lt('created_at', range.end.toISOString());
  // Se traen las dos líneas de tiempo por separado (pueden estar muy lejos una de otra)
  // y se juntan sin repetir los pedidos que caigan en ambas.
  const ordersQuery = range
    ? Promise.all([ordersBetween(range.start, range.end), ordersBetween(range.prevStart, range.prevEnd)]).then(([a, b]) => {
      if (a.error || b.error) return { error: a.error || b.error };
      const seen = new Set();
      return { data: [...(a.data || []), ...(b.data || [])].filter((o) => !seen.has(o.id) && seen.add(o.id)) };
    })
    : ordersBetween();
  const [ordersRes, profilesRes, itemsRes, giftRes] = await Promise.all([
    ordersQuery,
    sb.from('profiles').select('*').eq('role', 'cliente'),
    sb.from('menu_items').select('id, name, category, cost, price'),
    giftQuery,
  ]);
  const firstError = ordersRes.error || profilesRes.error || itemsRes.error || giftRes.error;
  if (firstError) throw firstError;
  return { rawOrders: ordersRes.data || [], profiles: profilesRes.data || [], menuItems: itemsRes.data || [], giftCards: giftRes.data || [] };
}

export function computeStats({ rawOrders, profiles, menuItems, giftCards, range, period, settings }) {
  const between = (list, from, to) => list.filter((o) => { const t = new Date(o.created_at); return t >= from && t < to; });
  const costById = {}; menuItems.forEach((m) => { costById[m.id] = Number(m.cost || 0); });
  const orders = range ? between(rawOrders, range.start, range.end) : rawOrders;
  const prevOrders = range ? between(rawOrders, range.prevStart, range.prevEnd) : [];

  // Si el periodo está en curso (hoy, esta semana, este mes), se compara contra el anterior
  // solo hasta el mismo punto: hoy a las 3 p. m. contra ayer a las 3 p. m., no contra ayer completo.
  const now = new Date();
  // (con "A vs B" se compara exactamente lo que se eligió).
  const inProgress = Boolean(range) && period !== 'custom' && now >= range.start && now < range.end;
  const prevCutoff = inProgress ? new Date(Math.min(range.prevStart.getTime() + (now - range.start), range.prevEnd.getTime())) : range && range.prevEnd;
  const current = summarize(orders, costById);
  const previous = range ? summarize(between(prevOrders, range.prevStart, prevCutoff), costById) : null;

  const totalRevenue = current.revenue;
  const totalOrders = current.count;

  const baseCurrency = { code: settings.currency_code || 'DOP', symbol: settings.currency_symbol || '$', position: settings.currency_position || 'before' };
  const currencySales = salesByCurrency(orders, baseCurrency);
  const prevCurrencySales = range ? salesByCurrency(between(prevOrders, range.prevStart, prevCutoff), baseCurrency) : null;
  const hasExtraCurrencies = (Array.isArray(settings.extra_currencies) && settings.extra_currencies.length > 0) || currencySales.some((c) => !c.base);

  const itemMap = {};
  orders.forEach((o) => (o.items || []).forEach((it) => {
    const key = it.id || it.name;
    if (!itemMap[key]) itemMap[key] = { id: it.id, name: it.name, qty: 0, revenue: 0 };
    itemMap[key].qty += it.qty;
    itemMap[key].revenue += it.qty * it.price;
  }));
  const soldArr = Object.values(itemMap);
  const bestSellers = [...soldArr].sort((a, b) => b.qty - a.qty).slice(0, 5);
  const soldIds = new Set(soldArr.map((i) => i.id).filter(Boolean));
  const zeroItems = menuItems.filter((m) => !soldIds.has(m.id)).map((m) => ({ id: m.id, name: m.name, qty: 0, revenue: 0 }));
  const worstSellers = [...soldArr, ...zeroItems].sort((a, b) => a.qty - b.qty).slice(0, 5);

  const catById = {}; menuItems.forEach((m) => { catById[m.id] = m.category; });
  const catMap = {};
  orders.forEach((o) => (o.items || []).forEach((it) => {
    const cat = catById[it.id] || 'Otros';
    catMap[cat] = (catMap[cat] || 0) + it.qty * it.price;
  }));
  const categories = Object.entries(catMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  const payMap = {};
  orders.forEach((o) => { const m = o.payment_method || 'otro'; payMap[m] = (payMap[m] || 0) + 1; });
  const payments = Object.entries(payMap).map(([k, value]) => ({ label: PAY_LABELS[k] || k, value })).sort((a, b) => b.value - a.value);

  // sexo y edad: se toman de cada pedido (customer_gender/customer_age), no del
  // perfil directamente, porque así se incluye también a quienes piden como invitados.
  const genderMap = {};
  orders.forEach((o) => { const g = o.customer_gender || 'sin_dato'; genderMap[g] = (genderMap[g] || 0) + 1; });
  const genders = Object.entries(genderMap).map(([k, value]) => ({ label: GENDER_LABELS[k] || k, value })).sort((a, b) => b.value - a.value);

  const ageBuckets = { '< 18': 0, '18–24': 0, '25–34': 0, '35–44': 0, '45–54': 0, '55+': 0, 'Sin dato': 0 };
  orders.forEach((o) => {
    const a = o.customer_age;
    if (!a) ageBuckets['Sin dato']++;
    else if (a < 18) ageBuckets['< 18']++;
    else if (a <= 24) ageBuckets['18–24']++;
    else if (a <= 34) ageBuckets['25–34']++;
    else if (a <= 44) ageBuckets['35–44']++;
    else if (a <= 54) ageBuckets['45–54']++;
    else ageBuckets['55+']++;
  });
  const ages = Object.entries(ageBuckets).map(([label, value]) => ({ label, value }));

  const accountOrders = orders.filter((o) => o.user_id).length;
  const guestOrders = totalOrders - accountOrders;

  const hourCounts = Array(24).fill(0);
  orders.forEach((o) => { const h = new Date(o.created_at).getHours(); hourCounts[h]++; });

  // Gráfica: con "Todo", los últimos 7 días; con un periodo, el periodo contra el anterior completo.
  let dayRevenue = [];
  let compareChart = [];
  if (!range) {
    const today = startOfDay(dayKey(now));
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      dayRevenue.push({ label: DAY_LABELS[d.getDay()], value: sumSubtotal(between(orders, d, addDays(d, 1))) });
    }
  } else {
    // con "A vs B" se alinea día 1 con día 1; si ambas líneas son de un solo día, por hora
    const byHour = period === 'dia' || (period === 'custom' && lineDays(range) === 1 && lineDays({ start: range.prevStart, end: range.prevEnd }) === 1);
    const byIndex = period === 'semana' || (period === 'custom' && !byHour);
    const slotOf = (o, start) => {
      const t = new Date(o.created_at);
      if (byHour) return t.getHours();
      if (byIndex) return Math.round((startOfDay(dayKey(t)) - start) / 86400000); // round: un día de cambio de horario dura 23 o 25 h
      return t.getDate() - 1;
    };
    const slots = byHour ? 24 : period === 'semana' ? 7
      : period === 'custom' ? Math.max(lineDays(range), lineDays({ start: range.prevStart, end: range.prevEnd }))
      : Math.max(addDays(range.end, -1).getDate(), addDays(range.start, -1).getDate());
    compareChart = Array.from({ length: slots }, (_, i) => ({
      label: byHour ? (i % 3 === 0 ? `${i}h` : '')
        : period === 'semana' ? DAY_LABELS[(i + 1) % 7]
        : (slots <= 10 || i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : ''),
      value: 0,
      prev: 0,
    }));
    orders.forEach((o) => { const i = slotOf(o, range.start); if (compareChart[i]) compareChart[i].value += Number(o.subtotal || 0); });
    prevOrders.forEach((o) => { const i = slotOf(o, range.prevStart); if (compareChart[i]) compareChart[i].prev += Number(o.subtotal || 0); });
  }

  const gcSoldCount = giftCards.length;
  const gcSoldAmount = giftCards.reduce((s, g) => s + Number(g.amount || 0), 0);
  const gcRedeemedCount = giftCards.filter((g) => g.status === 'canjeada').length;
  const gcActiveBalance = giftCards.filter((g) => g.status === 'activa').reduce((s, g) => s + Number(g.amount || 0), 0);

  const hasCostData = menuItems.some((m) => Number(m.cost || 0) > 0);


  // Para el reporte A vs B: lo mismo de la línea B, para poner las dos columnas lado a lado.
  const prevWindow = range ? between(prevOrders, range.prevStart, prevCutoff) : [];
  const prevItemQty = {};
  prevWindow.forEach((o) => (o.items || []).forEach((it) => { const key = it.id || it.name; prevItemQty[key] = (prevItemQty[key] || 0) + it.qty; }));
  const prevCatMap = {};
  prevWindow.forEach((o) => (o.items || []).forEach((it) => { const cat = catById[it.id] || 'Otros'; prevCatMap[cat] = (prevCatMap[cat] || 0) + it.qty * it.price; }));
  const prevPayMap = {};
  prevWindow.forEach((o) => { const m = o.payment_method || 'otro'; prevPayMap[m] = (prevPayMap[m] || 0) + 1; });
  const prevAccountOrders = prevWindow.filter((o) => o.user_id).length;

  return {
    current, previous, inProgress, prevCount: prevOrders.length, compareChart,
    currencySales, prevCurrencySales, hasExtraCurrencies,
    totalOrders, bestSellers, worstSellers, categories, payments,
    genders, ages, accountOrders, guestOrders, hourCounts, dayRevenue,
    gcSoldCount, gcSoldAmount, gcRedeemedCount, gcActiveBalance,
    hasCostData, totalClients: profiles.length,
    soldItems: soldArr, prevItemQty, prevCatMap, prevPayMap, payMap, prevAccountOrders, prevGuestOrders: prevWindow.length - prevAccountOrders,
  };
}
