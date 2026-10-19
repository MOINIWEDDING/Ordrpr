'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { useSettings } from '@/context/SettingsContext';
import { BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { formatIn } from '@/lib/settingsDefaults';
import BrandLogo from '@/components/BrandLogo';
import { PAY_LABELS, capitalize, startOfDay, periodRange, lineRange, computeStats, loadStatsData } from '@/lib/stats';

// Reporte de estadísticas para imprimir o guardar como PDF (A4). Tres tipos:
//   ?tipo=dia&dia=AAAA-MM-DD        un día contra el día anterior
//   ?tipo=mes&mes=AAAA-MM           un mes contra el mes anterior
//   ?tipo=ab&a=desde_hasta&b=…      dos líneas de tiempo elegidas por el dueño
// Los números salen de lib/stats.js, los mismos que se ven en /estadisticas.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const shortDay = (d) => d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
const monthYear = (d) => capitalize(d.toLocaleDateString('es', { month: 'long', year: 'numeric' }));
const monthShort = (d) => capitalize(d.toLocaleDateString('es', { month: 'short' }).replace('.', ''));

function rangeName(from, to) {
  const a = startOfDay(from);
  const b = startOfDay(to);
  if (from === to) return `${shortDay(a)} ${a.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) return `${shortDay(a)} – ${shortDay(b)} ${b.getFullYear()}`;
  return `${shortDay(a)} ${a.getFullYear()} – ${shortDay(b)} ${b.getFullYear()}`;
}

function parseLine(v) {
  const [from, to] = String(v || '').split('_');
  if (!DAY_RE.test(from || '') || !DAY_RE.test(to || '')) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

// Qué periodo pide la dirección, con sus nombres para el encabezado y las columnas.
function readParams(params) {
  if (params.get('tipo') === 'ab') {
    const a = parseLine(params.get('a'));
    const b = parseLine(params.get('b'));
    if (!a || !b) return null;
    const ra = lineRange(a);
    const rb = lineRange(b);
    return {
      kind: 'ab', period: 'custom',
      range: { start: ra.start, end: ra.end, prevStart: rb.start, prevEnd: rb.end },
      aName: rangeName(a.from, a.to), bName: rangeName(b.from, b.to), aShort: 'A', bShort: 'B',
      fileName: `A vs B ${a.from} ${b.from}`,
    };
  }
  if (params.get('tipo') === 'dia') {
    const day = params.get('dia');
    if (!DAY_RE.test(day || '')) return null;
    const range = periodRange('dia', day);
    return {
      kind: 'dia', period: 'dia', range,
      aName: capitalize(range.start.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
      bName: capitalize(range.prevStart.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })),
      aShort: shortDay(range.start), bShort: shortDay(range.prevStart),
      fileName: day,
    };
  }
  const month = params.get('mes');
  if (!MONTH_RE.test(month || '')) return null;
  const range = periodRange('mes', `${month}-01`);
  return {
    kind: 'mes', period: 'mes', range,
    aName: monthYear(range.start), bName: monthYear(range.prevStart),
    aShort: monthShort(range.start), bShort: monthShort(range.prevStart),
    fileName: month,
  };
}

function pctChange(current, prev) {
  if (prev === 0) return current > 0 ? { dir: 'up', text: 'nuevo' } : { dir: 'flat', text: '=' };
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct > 0) return { dir: 'up', text: `▲ ${pct}%` };
  if (pct < 0) return { dir: 'down', text: `▼ ${Math.abs(pct)}%` };
  return { dir: 'flat', text: '=' };
}

function Delta({ current, prev }) {
  const d = pctChange(current, prev);
  return <span className={`rp-delta ${d.dir}`}>{d.text}</span>;
}

export default function StatsReport() {
  const params = useSearchParams();
  const router = useRouter();
  const { profile, isStaff } = useAuth();
  const { branch, branchInfo } = useBranch();
  const { settings } = useSettings();
  const query = params.toString();
  const spec = useMemo(() => readParams(new URLSearchParams(query)), [query]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile && !isStaff) router.push('/');
  }, [profile, isStaff, router]);

  // Sin el menú, la barra ni los avisos del sitio: la página es solo el documento.
  useEffect(() => {
    document.body.classList.add('report-mode');
    return () => document.body.classList.remove('report-mode');
  }, []);

  useEffect(() => {
    if (!spec || !isStaff) return;
    if (!BARRO_CONFIGURED) { setData({ rawOrders: [], profiles: [], menuItems: [], giftCards: [] }); return; }
    let alive = true;
    setData(null);
    setError('');
    loadStatsData({ branch, range: spec.range })
      .then((d) => { if (alive) setData(d); })
      .catch((err) => { if (alive) setError(err.message || 'No se pudieron cargar las estadísticas.'); });
    return () => { alive = false; };
  }, [spec, branch, isStaff]);

  const stats = useMemo(() => (data && spec ? computeStats({ ...data, range: spec.range, period: spec.period, settings }) : null), [data, spec, settings]);

  // El nombre del archivo al guardar el PDF sale del título de la página.
  const brand = settings.brand_name || 'Mi Restaurante';
  useEffect(() => {
    if (!spec) return undefined;
    const before = document.title;
    document.title = `Reporte ${brand} ${spec.fileName}`;
    return () => { document.title = before; };
  }, [spec, brand]);

  if (!profile || !isStaff) return null;

  return (
    <div className="rp-page">
      <div className="rp-toolbar">
        <Link href="/estadisticas" className="rp-back">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Estadísticas
        </Link>
        {stats && (
          <button type="button" className="btn btn-amber rp-print" onClick={() => window.print()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
            Descargar PDF
          </button>
        )}
      </div>

      {!spec ? (
        <p className="empty-note">Este enlace de reporte no es válido. Vuelve a Estadísticas y créalo otra vez.</p>
      ) : error ? (
        <div className="form-msg show error">No se pudieron cargar las estadísticas: {error}</div>
      ) : !stats ? (
        <p className="empty-note">Preparando el reporte…</p>
      ) : (
        <ReportDocument spec={spec} stats={stats} settings={settings} brand={brand} place={branchInfo ? branchInfo.full : settings.city} />
      )}
    </div>
  );
}

function ReportDocument({ spec, stats, settings, brand, place }) {
  const cur = stats.current;
  const prev = stats.previous || { revenue: 0, count: 0, avgTicket: 0, card: 0, cash: 0, profit: 0 };
  // si el periodo sigue en curso, B se cuenta solo hasta el mismo punto (ver computeStats)
  const now = new Date();
  const bLabel = !stats.inProgress ? spec.bName
    : spec.kind === 'mes' ? `${spec.bName}, hasta el día ${now.getDate()}`
    : `${spec.bName}, hasta las ${now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
  const generated = new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  const round = (v) => money(Math.round(v));

  const kpis = [
    { label: 'Pedidos', a: cur.count, b: prev.count, fmt: (v) => v.toLocaleString('es') },
    { label: 'Ticket promedio', a: cur.avgTicket, b: prev.avgTicket, fmt: round },
    stats.hasCostData
      ? { label: 'Ganancia estimada', a: cur.profit, b: prev.profit, fmt: round }
      : { label: 'Clientes registrados', a: stats.totalClients, fmt: (v) => v.toLocaleString('es') },
    { label: 'Tarjeta', a: cur.card, b: prev.card, fmt: round },
    { label: 'Efectivo', a: cur.cash, b: prev.cash, fmt: round },
    { label: 'Gift cards vendidas', a: stats.gcSoldAmount, fmt: round, note: `${stats.gcSoldCount} vendida${stats.gcSoldCount === 1 ? '' : 's'}` },
  ];

  const products = [...stats.soldItems].sort((x, y) => y.qty - x.qty || y.revenue - x.revenue).slice(0, 10);
  const catKeys = [...new Set([...stats.categories.map((c) => c.label), ...Object.keys(stats.prevCatMap)])];
  const catTotal = Math.max(1, stats.categories.reduce((s, c) => s + c.value, 0));
  const categories = catKeys
    .map((label) => ({ label, a: (stats.categories.find((c) => c.label === label) || { value: 0 }).value, b: stats.prevCatMap[label] || 0 }))
    .sort((x, y) => y.a - x.a || y.b - x.b);
  const payKeys = [...new Set([...Object.keys(stats.payMap), ...Object.keys(stats.prevPayMap)])];
  const payments = payKeys
    .map((k) => ({ label: PAY_LABELS[k] || k, a: stats.payMap[k] || 0, b: stats.prevPayMap[k] || 0 }))
    .sort((x, y) => y.a - x.a || y.b - x.b);
  const peakHour = stats.hourCounts.reduce((best, v, h) => (v > stats.hourCounts[best] ? h : best), 0);
  const hourMax = Math.max(1, ...stats.hourCounts);
  const noSales = stats.worstSellers.filter((w) => w.qty === 0);

  return (
    <article className="rp">
      <section className="rp-sheet">
        <div className="rp-head">
          <div className="rp-brand">
            <BrandLogo className="rp-logo" alt="" />
            <div>
              <b>{brand}</b>
              {place && <span>{place}</span>}
            </div>
          </div>
          <div className="rp-kind">
            <span>{{ dia: 'Reporte diario', mes: 'Reporte mensual', ab: 'Reporte comparativo' }[spec.kind]}</span>
            <b>{spec.kind === 'ab' ? 'A vs B' : spec.aName}</b>
          </div>
        </div>

        <div className="rp-legend">
          <span><i className="a" />{spec.kind === 'ab' ? <><em>A</em>{spec.aName}</> : spec.aName}</span>
          <span><i className="b" />{spec.kind === 'ab' ? <><em>B</em>{bLabel}</> : `Comparado con ${bLabel.charAt(0).toLowerCase()}${bLabel.slice(1)}`}</span>
        </div>

        <div className="rp-hero">
          <span className="rp-label">Ventas totales</span>
          <div className="rp-hero-row">
            <span className="rp-hero-value">{round(cur.revenue)}</span>
            <span className="rp-hero-compare">
              <Delta current={cur.revenue} prev={prev.revenue} />
              <span>{spec.bShort} {round(prev.revenue)}</span>
            </span>
          </div>
        </div>

        <div className="rp-kpis">
          {kpis.map((k) => (
            <div key={k.label} className="rp-kpi">
              <span className="rp-label">{k.label}</span>
              <span className="rp-kpi-value">{k.fmt(k.a)}</span>
              <span className="rp-kpi-foot">
                {k.b !== undefined
                  ? <><Delta current={k.a} prev={k.b} /><span>{spec.bShort} {k.fmt(k.b)}</span></>
                  : <span>{k.note || 'Total del negocio'}</span>}
              </span>
            </div>
          ))}
        </div>

        <div className="rp-block rp-chart">
          <h3 className="rp-h">
            {stats.compareChart.length === 24 ? 'Ventas por hora' : 'Ventas por día'}
            <span>{spec.aShort} contra {spec.bShort}</span>
          </h3>
          <SalesChart data={stats.compareChart} />
        </div>

        <div className="rp-block">
          <h3 className="rp-h">Horas con más pedidos<span>Pico: {peakHour}:00 · {stats.hourCounts[peakHour]} pedido{stats.hourCounts[peakHour] === 1 ? '' : 's'}</span></h3>
          <div className="rp-hours">
            {stats.hourCounts.map((v, h) => (
              <div key={h} className="rp-hour">
                <i style={{ opacity: v ? 0.14 + (v / hourMax) * 0.86 : 0.06 }} />
                <span>{h % 3 === 0 ? h : ''}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rp-block">
          <h3 className="rp-h">Gift cards<span>{spec.aShort}</span></h3>
          <div className="rp-gc">
            <div><span className="rp-label">Vendidas</span><b>{stats.gcSoldCount}</b></div>
            <div><span className="rp-label">Monto vendido</span><b>{round(stats.gcSoldAmount)}</b></div>
            <div><span className="rp-label">Canjeadas</span><b>{stats.gcRedeemedCount}</b></div>
            <div><span className="rp-label">Balance activo</span><b>{round(stats.gcActiveBalance)}</b></div>
          </div>
        </div>
      </section>

      <section className="rp-sheet">
        <div className="rp-block">
          <h3 className="rp-h">Productos más vendidos<span>Unidades</span></h3>
          <table className="rp-table">
            <thead>
              <tr><th className="rp-rank">#</th><th className="rp-name">Producto</th><th>{spec.aShort}</th><th>{spec.bShort}</th><th>Cambio</th><th>Ventas {spec.aShort}</th></tr>
            </thead>
            <tbody>
              {products.length ? products.map((p, i) => {
                const b = stats.prevItemQty[p.id || p.name] || 0;
                return (
                  <tr key={p.id || p.name}>
                    <td className="rp-rank">{i + 1}</td>
                    <td className="rp-name">{p.name}</td>
                    <td><b>{p.qty}</b></td>
                    <td>{b}</td>
                    <td><Delta current={p.qty} prev={b} /></td>
                    <td>{round(p.revenue)}</td>
                  </tr>
                );
              }) : <tr><td colSpan={6} className="rp-empty">Sin ventas en este periodo.</td></tr>}
            </tbody>
          </table>
          {noSales.length > 0 && (
            <p className="rp-note"><b>Sin ventas:</b> {noSales.map((w) => w.name).join(', ')}.</p>
          )}
        </div>

        <div className="rp-block">
          <h3 className="rp-h">Ventas por categoría</h3>
          <table className="rp-table">
            <thead>
              <tr><th>Categoría</th><th className="rp-share-col">Parte de {spec.aShort}</th><th>{spec.aShort}</th><th>{spec.bShort}</th><th>Cambio</th></tr>
            </thead>
            <tbody>
              {categories.length ? categories.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td className="rp-share-col">
                    <span className="rp-share"><i style={{ width: `${(c.a / catTotal) * 100}%` }} /></span>
                    <small>{Math.round((c.a / catTotal) * 100)}%</small>
                  </td>
                  <td><b>{round(c.a)}</b></td>
                  <td>{round(c.b)}</td>
                  <td><Delta current={c.a} prev={c.b} /></td>
                </tr>
              )) : <tr><td colSpan={5} className="rp-empty">Sin ventas en este periodo.</td></tr>}
            </tbody>
          </table>
        </div>

        {stats.hasExtraCurrencies && (
          <div className="rp-block">
            <h3 className="rp-h">Ventas por moneda<span>Con impuestos</span></h3>
            <table className="rp-table">
              <thead>
                <tr><th>Moneda</th><th>Pedidos</th><th>Cobrado {spec.aShort}</th><th className="rp-hide-sm">Equivale a</th><th>Cobrado {spec.bShort}</th></tr>
              </thead>
              <tbody>
                {stats.currencySales.map((c) => {
                  const fmt = (n) => (c.base ? round(n) : formatIn(n, c));
                  const b = (stats.prevCurrencySales || []).find((p) => p.code === c.code);
                  return (
                    <tr key={c.code}>
                      <td>{c.symbol} · {c.name}</td>
                      <td>{c.count}</td>
                      <td><b>{fmt(c.collected)}</b></td>
                      <td className="rp-hide-sm">{c.base ? '—' : round(c.equivalent)}</td>
                      <td>{fmt(b ? b.collected : 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="rp-two">
          <div className="rp-block">
            <h3 className="rp-h">Métodos de pago<span>Pedidos</span></h3>
            <table className="rp-table">
              <thead><tr><th>Método</th><th>{spec.aShort}</th><th>{spec.bShort}</th></tr></thead>
              <tbody>
                {payments.length ? payments.map((p) => (
                  <tr key={p.label}><td>{p.label}</td><td><b>{p.a}</b></td><td>{p.b}</td></tr>
                )) : <tr><td colSpan={3} className="rp-empty">Sin pedidos.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="rp-block">
            <h3 className="rp-h">Quién pide<span>Pedidos</span></h3>
            <table className="rp-table">
              <thead><tr><th>Cliente</th><th>{spec.aShort}</th><th>{spec.bShort}</th></tr></thead>
              <tbody>
                <tr><td>Con cuenta</td><td><b>{stats.accountOrders}</b></td><td>{stats.prevAccountOrders}</td></tr>
                <tr><td>Invitados</td><td><b>{stats.guestOrders}</b></td><td>{stats.prevGuestOrders}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="rp-two">
          <div className="rp-block">
            <h3 className="rp-h">Sexo<span>Pedidos {spec.aShort}</span></h3>
            <MiniRows rows={stats.genders.map((g) => ({ label: g.label, value: g.value }))} />
          </div>
          <div className="rp-block">
            <h3 className="rp-h">Edad<span>Pedidos {spec.aShort}</span></h3>
            <MiniRows rows={stats.ages.filter((a) => a.value > 0)} />
          </div>
        </div>

        <div className="rp-foot">
          <span>{brand}{place ? ` · ${place}` : ''}</span>
          <span>Generado el {generated}</span>
        </div>
      </section>
    </article>
  );
}

function MiniRows({ rows }) {
  const total = Math.max(1, rows.reduce((s, r) => s + r.value, 0));
  if (!rows.length) return <p className="rp-empty">Sin datos.</p>;
  return (
    <div className="rp-minirows">
      {rows.map((r) => (
        <div key={r.label}>
          <span>{r.label}</span>
          <span className="rp-share"><i style={{ width: `${(r.value / total) * 100}%` }} /></span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

// Barras dibujadas en SVG para que el PDF quede nítido a cualquier tamaño.
function SalesChart({ data }) {
  const W = 680;
  const H = 190;
  const left = 58;
  const bottom = 22;
  const top = 10;
  const plotH = H - bottom - top;
  const rawMax = Math.max(0, ...data.map((d) => Math.max(d.value, d.prev)));
  const step = niceStep(rawMax / 3);
  const max = Math.max(step * 3, 1);
  const slot = (W - left) / Math.max(1, data.length);
  const bar = Math.max(2, Math.min(13, slot * 0.34));
  const y = (v) => top + plotH - (v / max) * plotH;
  return (
    <svg className="rp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfica de ventas">
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <line x1={left} x2={W} y1={y(step * i)} y2={y(step * i)} className={i === 0 ? 'rp-axis' : 'rp-grid'} />
          <text x={left - 8} y={y(step * i) + 3} textAnchor="end" className="rp-tick">{compactMoney(step * i)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = left + slot * i + slot / 2;
        return (
          <g key={i}>
            {d.prev > 0 && <rect x={cx - bar - 0.75} y={y(d.prev)} width={bar} height={y(0) - y(d.prev)} rx={Math.min(2, bar / 3)} className="rp-bar-b" />}
            {d.value > 0 && <rect x={cx + 0.75} y={y(d.value)} width={bar} height={y(0) - y(d.value)} rx={Math.min(2, bar / 3)} className="rp-bar-a" />}
            {d.label && <text x={cx} y={H - 6} textAnchor="middle" className="rp-tick">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function niceStep(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function compactMoney(v) {
  if (v >= 1e6) return money(0).replace(/0/, `${Math.round(v / 1e5) / 10}M`);
  if (v >= 1e4) return money(0).replace(/0/, `${Math.round(v / 100) / 10}k`);
  return money(Math.round(v));
}

