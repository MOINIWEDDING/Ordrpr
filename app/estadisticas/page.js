'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { useBranch } from '@/context/BranchContext';

const GENDER_LABELS = { femenino: 'Femenino', masculino: 'Masculino', prefiero_no_decir: 'Prefiero no decir', sin_dato: 'Sin dato' };
const PAY_LABELS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', gift_card: 'Tarjeta de regalo' };
const DAY_LABELS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

// Los días se manejan como 'AAAA-MM-DD' en la hora del aparato del dueño,
// para que "hoy" sea el mismo día que ve en su teléfono.
function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}
const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const shortDate = (d) => d.toLocaleDateString('es', { day: 'numeric', month: 'short' });

const PERIODS = [
  { id: 'dia', label: 'Día' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'todo', label: 'Todo' },
];

// Rango [start, end) del periodo que contiene el día elegido, y del periodo anterior.
// Las semanas van de lunes a domingo.
function periodRange(period, key) {
  const d = startOfDay(key);
  if (period === 'semana') {
    const start = addDays(d, -((d.getDay() + 6) % 7));
    return { start, end: addDays(start, 7), prevStart: addDays(start, -7) };
  }
  if (period === 'mes') {
    const start = addMonths(d, 0);
    return { start, end: addMonths(d, 1), prevStart: addMonths(d, -1) };
  }
  return { start: d, end: addDays(d, 1), prevStart: addDays(d, -1) };
}

function periodTitle(period, range) {
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

function dayTitle(key) {
  if (key === dayKey(new Date())) return 'Hoy';
  if (key === dayKey(addDays(new Date(), -1))) return 'Ayer';
  return capitalize(startOfDay(key).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }));
}

const sumSubtotal = (list) => list.reduce((s, o) => s + Number(o.subtotal || 0), 0);

// Los números principales de un grupo de pedidos (se calculan igual para el periodo y para el anterior).
function summarize(orders, costById) {
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

export default function EstadisticasPage() {
  const { profile, isStaff } = useAuth();
  const { branch, branchInfo } = useBranch();
  const router = useRouter();
  const [rawOrders, setOrders] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [giftCards, setGiftCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [period, setPeriod] = useState('dia'); // 'dia' | 'semana' | 'mes' | 'todo'
  const [day, setDay] = useState(() => dayKey(new Date())); // cualquier día dentro del periodo elegido
  const range = useMemo(() => (period === 'todo' ? null : periodRange(period, day)), [period, day]);

  useEffect(() => {
    if (profile && !isStaff) router.push('/');
  }, [profile, isStaff, router]);

  useEffect(() => {
    async function load() {
      setLoadError('');
      if (!BARRO_CONFIGURED) { setLoading(false); return; }
      setLoading(true);
      try {
        let ordersQuery = sb.from('orders').select('*');
        let giftQuery = sb.from('gift_cards').select('*');
        if (branch) ordersQuery = ordersQuery.eq('branch', branch);
        if (range) {
          // Se traen el periodo elegido y el anterior completo, para poder compararlos.
          ordersQuery = ordersQuery.gte('created_at', range.prevStart.toISOString()).lt('created_at', range.end.toISOString());
          giftQuery = giftQuery.gte('created_at', range.start.toISOString()).lt('created_at', range.end.toISOString());
        }
        const [ordersRes, profilesRes, itemsRes, giftRes] = await Promise.all([
          ordersQuery,
          sb.from('profiles').select('*').eq('role', 'cliente'),
          sb.from('menu_items').select('id, name, category, cost, price'),
          giftQuery,
        ]);
        const firstError = ordersRes.error || profilesRes.error || itemsRes.error || giftRes.error;
        if (firstError) throw firstError;
        setOrders(ordersRes.data || []);
        setProfiles(profilesRes.data || []);
        setMenuItems(itemsRes.data || []);
        setGiftCards(giftRes.data || []);
      } catch (err) {
        setLoadError(err.message || 'No se pudieron cargar las estadísticas.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [branch, range]);

  const stats = useMemo(() => {
    const between = (list, from, to) => list.filter((o) => { const t = new Date(o.created_at); return t >= from && t < to; });
    const costById = {}; menuItems.forEach((m) => { costById[m.id] = Number(m.cost || 0); });
    const orders = range ? between(rawOrders, range.start, range.end) : rawOrders;
    const prevOrders = range ? between(rawOrders, range.prevStart, range.start) : [];

    // Si el periodo está en curso (hoy, esta semana, este mes), se compara contra el anterior
    // solo hasta el mismo punto: hoy a las 3 p. m. contra ayer a las 3 p. m., no contra ayer completo.
    const now = new Date();
    const inProgress = Boolean(range) && now >= range.start && now < range.end;
    const prevCutoff = inProgress ? new Date(Math.min(range.prevStart.getTime() + (now - range.start), range.start.getTime())) : range && range.start;
    const current = summarize(orders, costById);
    const previous = range ? summarize(between(prevOrders, range.prevStart, prevCutoff), costById) : null;

    const totalRevenue = current.revenue;
    const totalOrders = current.count;

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
      const slotOf = (o, start) => {
        const t = new Date(o.created_at);
        if (period === 'dia') return t.getHours();
        if (period === 'semana') return Math.round((startOfDay(dayKey(t)) - start) / 86400000); // round: un día de cambio de horario dura 23 o 25 h
        return t.getDate() - 1;
      };
      const slots = period === 'dia' ? 24 : period === 'semana' ? 7
        : Math.max(addDays(range.end, -1).getDate(), addDays(range.start, -1).getDate());
      compareChart = Array.from({ length: slots }, (_, i) => ({
        label: period === 'dia' ? (i % 3 === 0 ? `${i}h` : '')
          : period === 'semana' ? DAY_LABELS[(i + 1) % 7]
          : (i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : ''),
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

    return {
      current, previous, inProgress, prevCount: prevOrders.length, compareChart,
      totalOrders, bestSellers, worstSellers, categories, payments,
      genders, ages, accountOrders, guestOrders, hourCounts, dayRevenue,
      gcSoldCount, gcSoldAmount, gcRedeemedCount, gcActiveBalance,
      hasCostData, totalClients: profiles.length,
    };
  }, [rawOrders, profiles, menuItems, giftCards, range, period]);

  const compareLabel = !range ? '' : {
    dia: stats.inProgress ? 'ayer a esta hora' : 'el día anterior',
    semana: stats.inProgress ? 'la semana pasada a estas alturas' : 'la semana anterior',
    mes: stats.inProgress ? 'el mes pasado a estas alturas' : 'el mes anterior',
  }[period];
  const prevName = { dia: 'Día anterior', semana: 'Semana anterior', mes: 'Mes anterior' }[period];
  const delta = (key) => (stats.previous ? { prev: stats.previous[key] } : null);

  if (!profile || !isStaff) return null;

  return (
    <section className="ordenes-page">
      <div className="wrap">
        <div className="section-head" style={{ marginBottom: 26 }}>
          <p className="eyebrow">Panel del dueño</p>
          <h2 style={{ fontSize: 24 }}>Estadísticas</h2>
          <p>{branchInfo ? `Ventas y pedidos de ${branchInfo.full}. Los clientes y gift cards son del negocio completo.` : 'Un vistazo a cómo le está yendo al local.'}</p>
        </div>

        <PeriodTabs period={period} onChange={setPeriod} />
        <DayPicker period={period} day={day} range={range} onChange={setDay} />
        {range && <p className="stat-compare-note">Cada número se compara con {compareLabel}.</p>}

        {loading ? (
          <p className="empty-note">Cargando estadísticas…</p>
        ) : loadError ? (
          <div className="form-msg show error">No se pudieron cargar las estadísticas: {loadError}</div>
        ) : stats.totalOrders === 0 && !stats.prevCount ? (
          <p className="empty-note">{range ? `No hubo pedidos ${{ dia: 'este día', semana: 'esta semana', mes: 'este mes' }[period]} ni ${{ dia: 'el anterior', semana: 'la anterior', mes: 'el anterior' }[period]}.` : 'Todavía no hay suficientes pedidos para mostrar estadísticas.'}</p>
        ) : (
          <>
            <div className="kpi-grid">
              <KpiCard label="Ventas totales" value={stats.current.revenue} format={money} delta={delta('revenue')} />
              <KpiCard label={{ dia: 'Pedidos del día', semana: 'Pedidos de la semana', mes: 'Pedidos del mes' }[period] || 'Pedidos'} value={stats.current.count} delta={delta('count')} />
              <KpiCard label="Vendido en tarjeta" value={stats.current.card} format={money} delta={delta('card')} />
              <KpiCard label="Vendido en efectivo" value={stats.current.cash} format={money} delta={delta('cash')} />
              <KpiCard label="Ticket promedio" value={stats.current.avgTicket} format={(v) => money(Math.round(v))} delta={delta('avgTicket')} />
              <KpiCard label="Clientes registrados" value={stats.totalClients} />
              {stats.hasCostData && <KpiCard label="Ganancia estimada" value={stats.current.profit} format={(v) => money(Math.round(v))} delta={delta('profit')} highlight />}
            </div>

            {range ? (
              <StatSection title={`Ventas: ${periodTitle(period, range).toLowerCase()} vs. ${prevName.toLowerCase()}`}>
                <CompareChart data={stats.compareChart} currentLabel={periodTitle(period, range)} prevLabel={prevName} formatValue={(v) => money(Math.round(v))} dense={period !== 'semana'} />
              </StatSection>
            ) : (
              <StatSection title="Ventas de los últimos 7 días">
                <MiniBarChart data={stats.dayRevenue} formatValue={(v) => money(Math.round(v))} />
              </StatSection>
            )}

            <div className="stat-two-col">
              <StatSection title="Platos más vendidos">
                <BarList items={stats.bestSellers.map((i) => ({ label: i.name, value: i.qty }))} suffix=" vendidos" />
              </StatSection>
              <StatSection title="Platos menos vendidos">
                <BarList items={stats.worstSellers.map((i) => ({ label: i.name, value: i.qty }))} suffix=" vendidos" tint="salado" />
              </StatSection>
            </div>

            <StatSection title="Ventas por categoría">
              <BarList items={stats.categories} formatValue={(v) => money(Math.round(v))} tint="tarde" />
            </StatSection>

            <div className="stat-two-col">
              <StatSection title="Métodos de pago">
                <BarList items={stats.payments} suffix=" pedidos" tint="experiencia" />
              </StatSection>
              <StatSection title="Cuentas vs. invitados">
                <BarList
                  items={[{ label: 'Con cuenta', value: stats.accountOrders }, { label: 'Invitados', value: stats.guestOrders }]}
                  suffix=" pedidos"
                  tint="manana"
                />
              </StatSection>
            </div>

            <div className="stat-two-col">
              <StatSection title="Sexo de quienes piden">
                <BarList items={stats.genders} suffix=" pedidos" tint="salado" />
              </StatSection>
              <StatSection title="Edad de quienes piden">
                <BarList items={stats.ages} suffix=" pedidos" tint="tarde" />
              </StatSection>
            </div>

            <StatSection title="Horas con más pedidos">
              <MiniBarChart
                data={stats.hourCounts.map((v, h) => ({ label: h % 3 === 0 ? `${h}h` : '', value: v }))}
                formatValue={(v) => `${v} pedido${v === 1 ? '' : 's'}`}
                dense
              />
            </StatSection>

            <StatSection title="Gift cards">
              <div className="kpi-grid">
                <KpiCard label="Vendidas" value={stats.gcSoldCount} small />
                <KpiCard label="Monto vendido" value={money(stats.gcSoldAmount)} small />
                <KpiCard label="Canjeadas" value={stats.gcRedeemedCount} small />
                <KpiCard label="Balance activo" value={money(stats.gcActiveBalance)} small />
              </div>
            </StatSection>

            {!stats.hasCostData && (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                Tip: agrégale un costo a tus productos (al editarlos en el menú) para ver aquí la ganancia estimada, no solo las ventas.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function PeriodTabs({ period, onChange }) {
  return (
    <div className="stat-period-tabs" role="tablist" aria-label="Periodo">
      {PERIODS.map((p) => (
        <button key={p.id} type="button" role="tab" aria-selected={period === p.id} className={period === p.id ? 'active' : ''} onClick={() => onChange(p.id)}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

function DayPicker({ period, day, range, onChange }) {
  const today = dayKey(new Date());
  const inputRef = useRef(null);
  if (!range) return null;

  function openCalendar() {
    const input = inputRef.current;
    if (!input) return;
    try { input.showPicker(); } catch (e) { input.focus(); input.click(); }
  }

  // Las flechas saltan un periodo completo (un día, una semana o un mes).
  function shift(n) {
    const base = startOfDay(day);
    const next = period === 'mes' ? addMonths(base, n) : addDays(base, period === 'semana' ? 7 * n : n);
    const key = dayKey(next);
    onChange(key > today ? today : key);
  }
  const canGoForward = dayKey(range.end) <= today;

  return (
    <div className="stat-day-picker">
      <button type="button" className="stat-day-arrow" aria-label="Periodo anterior" onClick={() => shift(-1)}>
        <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <button type="button" className="stat-day-btn" onClick={openCalendar} aria-label="Elegir fecha en el calendario">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
        <span>{periodTitle(period, range)}</span>
        <input
          ref={inputRef}
          type="date"
          className="stat-day-input"
          value={day}
          max={today}
          onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
          tabIndex={-1}
          aria-hidden="true"
        />
      </button>
      {canGoForward && (
        <button type="button" className="stat-day-arrow" aria-label="Periodo siguiente" onClick={() => shift(1)}>
          <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      )}
      {day !== today && (
        <button type="button" className="stat-day-chip" onClick={() => onChange(today)}>
          {{ dia: 'Ir a hoy', semana: 'Ir a esta semana', mes: 'Ir a este mes' }[period]}
        </button>
      )}
    </div>
  );
}

function KpiCard({ label, value, format, delta, highlight, small }) {
  const show = format || ((v) => v);
  return (
    <motion.div
      className={`kpi-card${highlight ? ' highlight' : ''}${small ? ' small' : ''}`}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
    >
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{show(value)}</span>
      {delta && <DeltaLine current={value} prev={delta.prev} format={show} />}
    </motion.div>
  );
}

function DeltaLine({ current, prev, format }) {
  let dir = 'flat';
  let text = '= igual';
  if (prev === 0 && current > 0) { dir = 'up'; text = '▲ nuevo'; }
  else if (prev > 0) {
    const pct = Math.round(((current - prev) / prev) * 100);
    if (pct > 0) { dir = 'up'; text = `▲ ${pct}%`; }
    else if (pct < 0) { dir = 'down'; text = `▼ ${Math.abs(pct)}%`; }
  }
  return (
    <span className="kpi-delta">
      <span className={`kpi-delta-pct ${dir}`}>{text}</span>
      <span className="kpi-delta-prev">antes {format(prev)}</span>
    </span>
  );
}

function CompareChart({ data, currentLabel, prevLabel, formatValue, dense }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.prev)));
  return (
    <>
      <div className="compare-legend">
        <span><i className="current" />{currentLabel}</span>
        <span><i className="prev" />{prevLabel}</span>
      </div>
      <div className={`mini-chart compare-chart${dense ? ' dense' : ''}`}>
        {data.map((d, i) => (
          <div className="mini-chart-col" key={i} title={`${currentLabel}: ${formatValue(d.value)} · ${prevLabel}: ${formatValue(d.prev)}`}>
            <div className="mini-chart-bar-wrap compare-pair">
              <motion.div className="compare-bar prev" initial={{ height: 0 }} animate={{ height: `${(d.prev / max) * 100}%` }} transition={{ duration: 0.5, delay: i * 0.015 }} />
              <motion.div className="compare-bar current" initial={{ height: 0 }} animate={{ height: `${(d.value / max) * 100}%` }} transition={{ duration: 0.5, delay: i * 0.015 }} />
            </div>
            <span className="mini-chart-label">{d.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function StatSection({ title, children }) {
  return (
    <div className="stat-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function BarList({ items, suffix = '', formatValue, tint = 'manana' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="empty-note">Sin datos todavía.</p>;
  return (
    <div className="bar-list">
      {items.map((it, i) => (
        <div className="bar-list-row" key={i}>
          <span className="bar-list-label">{it.label}</span>
          <div className="bar-list-track">
            <motion.div
              className="bar-list-fill"
              style={{ background: `var(--tint-${tint}-deep)` }}
              initial={{ width: 0 }}
              animate={{ width: `${(it.value / max) * 100}%` }}
              transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
            />
          </div>
          <span className="bar-list-value">{formatValue ? formatValue(it.value) : `${it.value}${suffix}`}</span>
        </div>
      ))}
    </div>
  );
}

function MiniBarChart({ data, formatValue, dense }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={`mini-chart${dense ? ' dense' : ''}`}>
      {data.map((d, i) => (
        <div className="mini-chart-col" key={i} title={formatValue ? formatValue(d.value) : d.value}>
          <div className="mini-chart-bar-wrap">
            <motion.div
              className="mini-chart-bar"
              initial={{ height: 0 }}
              animate={{ height: `${(d.value / max) * 100}%` }}
              transition={{ duration: 0.5, delay: i * 0.02 }}
            />
          </div>
          <span className="mini-chart-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
