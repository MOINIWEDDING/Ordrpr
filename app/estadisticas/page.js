'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { useBranch } from '@/context/BranchContext';

const GENDER_LABELS = { femenino: 'Femenino', masculino: 'Masculino', prefiero_no_decir: 'Prefiero no decir', sin_dato: 'Sin dato' };
const PAY_LABELS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', gift_card: 'Tarjeta de regalo' };
const DAY_LABELS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export default function EstadisticasPage() {
  const { profile, isStaff } = useAuth();
  const { branch, branchInfo } = useBranch();
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [giftCards, setGiftCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (profile && !isStaff) router.push('/');
  }, [profile, isStaff, router]);

  useEffect(() => {
    async function load() {
      setLoadError('');
      if (!BARRO_CONFIGURED) { setLoading(false); return; }
      try {
        let ordersQuery = sb.from('orders').select('*');
        if (branch) ordersQuery = ordersQuery.eq('branch', branch);
        const [ordersRes, profilesRes, itemsRes, giftRes] = await Promise.all([
          ordersQuery,
          sb.from('profiles').select('*').eq('role', 'cliente'),
          sb.from('menu_items').select('id, name, category, cost, price'),
          sb.from('gift_cards').select('*'),
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
  }, [branch]);

  const stats = useMemo(() => {
    const totalRevenue = orders.reduce((s, o) => s + Number(o.subtotal || 0), 0);
    const totalOrders = orders.length;
    const avgTicket = totalOrders ? totalRevenue / totalOrders : 0;

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

    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0); days.push(d); }
    const dayRevenue = days.map((d) => {
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const revenue = orders
        .filter((o) => { const t = new Date(o.created_at); return t >= d && t < next; })
        .reduce((s, o) => s + Number(o.subtotal || 0), 0);
      return { label: DAY_LABELS[d.getDay()], value: revenue };
    });

    const gcSoldCount = giftCards.length;
    const gcSoldAmount = giftCards.reduce((s, g) => s + Number(g.amount || 0), 0);
    const gcRedeemedCount = giftCards.filter((g) => g.status === 'canjeada').length;
    const gcActiveBalance = giftCards.filter((g) => g.status === 'activa').reduce((s, g) => s + Number(g.amount || 0), 0);

    let totalCost = 0;
    const costById = {}; menuItems.forEach((m) => { costById[m.id] = Number(m.cost || 0); });
    orders.forEach((o) => (o.items || []).forEach((it) => { totalCost += (costById[it.id] || 0) * it.qty; }));
    const hasCostData = menuItems.some((m) => Number(m.cost || 0) > 0);
    const profit = totalRevenue - totalCost;

    return {
      totalRevenue, totalOrders, avgTicket, bestSellers, worstSellers, categories, payments,
      genders, ages, accountOrders, guestOrders, hourCounts, dayRevenue,
      gcSoldCount, gcSoldAmount, gcRedeemedCount, gcActiveBalance,
      hasCostData, profit, totalClients: profiles.length,
    };
  }, [orders, profiles, menuItems, giftCards]);

  if (!profile || !isStaff) return null;

  return (
    <section className="ordenes-page">
      <div className="wrap">
        <div className="section-head" style={{ marginBottom: 26 }}>
          <p className="eyebrow">Panel del dueño</p>
          <h2 style={{ fontSize: 24 }}>Estadísticas</h2>
          <p>{branchInfo ? `Ventas y pedidos de ${branchInfo.full}. Los clientes y gift cards son del negocio completo.` : 'Un vistazo a cómo le está yendo al local.'}</p>
        </div>

        {loading ? (
          <p className="empty-note">Cargando estadísticas…</p>
        ) : loadError ? (
          <div className="form-msg show error">No se pudieron cargar las estadísticas: {loadError}</div>
        ) : stats.totalOrders === 0 ? (
          <p className="empty-note">Todavía no hay suficientes pedidos para mostrar estadísticas.</p>
        ) : (
          <>
            <div className="kpi-grid">
              <KpiCard label="Ventas totales" value={money(stats.totalRevenue)} />
              <KpiCard label="Pedidos" value={stats.totalOrders} />
              <KpiCard label="Ticket promedio" value={money(Math.round(stats.avgTicket))} />
              <KpiCard label="Clientes registrados" value={stats.totalClients} />
              {stats.hasCostData && <KpiCard label="Ganancia estimada" value={money(Math.round(stats.profit))} highlight />}
            </div>

            <StatSection title="Ventas de los últimos 7 días">
              <MiniBarChart data={stats.dayRevenue} formatValue={(v) => money(Math.round(v))} />
            </StatSection>

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

function KpiCard({ label, value, highlight, small }) {
  return (
    <motion.div
      className={`kpi-card${highlight ? ' highlight' : ''}${small ? ' small' : ''}`}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
    >
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
    </motion.div>
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
