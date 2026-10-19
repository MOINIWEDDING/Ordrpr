'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { useBranch } from '@/context/BranchContext';
import { useSettings } from '@/context/SettingsContext';
import { formatIn } from '@/lib/settingsDefaults';
import Modal from '@/components/Modal';
import { PERIODS, capitalize, dayKey, startOfDay, addDays, addMonths, periodRange, lineRange, lineTitle, periodTitle, computeStats, loadStatsData } from '@/lib/stats';

export default function EstadisticasPage() {
  const { profile, isStaff } = useAuth();
  const { branch, branchInfo } = useBranch();
  const { settings } = useSettings();
  const router = useRouter();
  const [rawOrders, setOrders] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [giftCards, setGiftCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [period, setPeriod] = useState('dia'); // 'dia' | 'semana' | 'mes' | 'todo'
  const [day, setDay] = useState(() => dayKey(new Date())); // cualquier día dentro del periodo elegido
  const [lineA, setLineA] = useState(() => ({ from: dayKey(addDays(new Date(), -6)), to: dayKey(new Date()) }));
  const [lineB, setLineB] = useState(() => ({ from: dayKey(addDays(new Date(), -13)), to: dayKey(addDays(new Date(), -7)) }));
  const [exporting, setExporting] = useState(false);
  const range = useMemo(() => {
    if (period === 'todo') return null;
    if (period !== 'custom') return periodRange(period, day);
    const a = lineRange(lineA);
    const b = lineRange(lineB);
    return { start: a.start, end: a.end, prevStart: b.start, prevEnd: b.end };
  }, [period, day, lineA, lineB]);

  useEffect(() => {
    if (profile && !isStaff) router.push('/');
  }, [profile, isStaff, router]);

  useEffect(() => {
    async function load() {
      setLoadError('');
      if (!BARRO_CONFIGURED) { setLoading(false); return; }
      setLoading(true);
      try {
        const data = await loadStatsData({ branch, range });
        setOrders(data.rawOrders);
        setProfiles(data.profiles);
        setMenuItems(data.menuItems);
        setGiftCards(data.giftCards);
      } catch (err) {
        setLoadError(err.message || 'No se pudieron cargar las estadísticas.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [branch, range]);

  const stats = useMemo(() => computeStats({ rawOrders, profiles, menuItems, giftCards, range, period, settings }), [rawOrders, profiles, menuItems, giftCards, range, period, settings]);

  const compareLabel = !range ? '' : period === 'custom' ? `la línea B (${lineTitle(lineB).toLowerCase()})` : {
    dia: stats.inProgress ? 'ayer a esta hora' : 'el día anterior',
    semana: stats.inProgress ? 'la semana pasada a estas alturas' : 'la semana anterior',
    mes: stats.inProgress ? 'el mes pasado a estas alturas' : 'el mes anterior',
  }[period];
  const prevName = { dia: 'Día anterior', semana: 'Semana anterior', mes: 'Mes anterior', custom: `B · ${lineTitle(lineB)}` }[period];
  const currentName = !range ? '' : period === 'custom' ? `A · ${lineTitle(lineA)}` : periodTitle(period, range);
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

        <div className="stat-toolbar">
          <PeriodTabs period={period} onChange={setPeriod} />
          <button type="button" className="stat-export-btn" onClick={() => setExporting(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M12 11v6M9.5 14.5 12 17l2.5-2.5" /></svg>
            Exportar PDF
          </button>
        </div>
        {exporting && (
          <ReportExportModal
            initialMode={period === 'custom' ? 'ab' : 'mes'}
            initialMonth={(period === 'mes' || period === 'semana' || period === 'dia') ? day.slice(0, 7) : dayKey(new Date()).slice(0, 7)}
            lineA={lineA}
            lineB={lineB}
            onClose={() => setExporting(false)}
            onCreate={(href) => router.push(href)}
          />
        )}
        {period === 'custom'
          ? <LinePickers lineA={lineA} lineB={lineB} onChangeA={setLineA} onChangeB={setLineB} />
          : <DayPicker period={period} day={day} range={range} onChange={setDay} />}
        {range && <p className="stat-compare-note">Cada número se compara con {compareLabel}.</p>}

        {loading ? (
          <p className="empty-note">Cargando estadísticas…</p>
        ) : loadError ? (
          <div className="form-msg show error">No se pudieron cargar las estadísticas: {loadError}</div>
        ) : stats.totalOrders === 0 && !stats.prevCount ? (
          <p className="empty-note">{period === 'custom' ? 'No hubo pedidos en ninguna de las dos líneas de tiempo.' : range ? `No hubo pedidos ${{ dia: 'este día', semana: 'esta semana', mes: 'este mes' }[period]} ni ${{ dia: 'el anterior', semana: 'la anterior', mes: 'el anterior' }[period]}.` : 'Todavía no hay suficientes pedidos para mostrar estadísticas.'}</p>
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
              <StatSection title={period === 'custom' ? 'Ventas: línea A vs. línea B' : `Ventas: ${currentName.toLowerCase()} vs. ${prevName.toLowerCase()}`}>
                <CompareChart data={stats.compareChart} currentLabel={currentName} prevLabel={prevName} formatValue={(v) => money(Math.round(v))} dense={stats.compareChart.length > 10} />
                {period === 'custom' && stats.compareChart.length !== 24 && <p className="stat-compare-note" style={{ margin: '10px 0 0' }}>Cada barra es un día: el 1 es el primer día de cada línea.</p>}
              </StatSection>
            ) : (
              <StatSection title="Ventas de los últimos 7 días">
                <MiniBarChart data={stats.dayRevenue} formatValue={(v) => money(Math.round(v))} />
              </StatSection>
            )}

            {stats.hasExtraCurrencies && (
              <StatSection title="Ventas por moneda">
                <div className="currency-stat-grid">
                  {stats.currencySales.map((c) => {
                    const fmt = (n) => (c.base ? money(Math.round(n)) : formatIn(n, c));
                    const prev = stats.prevCurrencySales && (stats.prevCurrencySales.find((p) => p.code === c.code) || { collected: 0 });
                    return (
                      <motion.div key={c.code} className="currency-stat-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                        <div className="currency-stat-head">
                          <span className="currency-stat-symbol">{c.symbol}</span>
                          <span>{c.name}</span>
                        </div>
                        <span className="kpi-label">Cobrado</span>
                        <span className="kpi-value">{fmt(c.collected)}</span>
                        {prev && <DeltaLine current={c.collected} prev={prev.collected} format={fmt} />}
                        <dl className="currency-stat-rows">
                          {!c.base && <div><dt>Equivale a</dt><dd>{money(Math.round(c.equivalent))}</dd></div>}
                          <div><dt>Pedidos</dt><dd>{c.count} ({Math.round((c.count / Math.max(1, stats.totalOrders)) * 100)}%)</dd></div>
                          <div><dt>Ticket promedio</dt><dd>{fmt(c.collected / Math.max(1, c.count))}</dd></div>
                          <div><dt>Efectivo</dt><dd>{fmt(c.cash)}</dd></div>
                          <div><dt>Tarjeta</dt><dd>{fmt(c.card)}</dd></div>
                          {!c.base && c.collected > 0 && <div><dt>Tasa promedio</dt><dd>1 {c.symbol} = {money(Math.round((c.equivalent / c.collected) * 100) / 100)}</dd></div>}
                        </dl>
                      </motion.div>
                    );
                  })}
                </div>
                {stats.currencySales.length > 1 && (
                  <div style={{ marginTop: 18 }}>
                    <BarList
                      items={stats.currencySales.map((c) => ({ label: `${c.symbol} · ${c.name}`, value: Math.round(c.equivalent) }))}
                      formatValue={(v) => money(v)}
                      tint="experiencia"
                    />
                  </div>
                )}
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

// Elegir qué reporte exportar: un mes completo (contra el mes anterior) o dos líneas de tiempo A vs B.
function ReportExportModal({ initialMode, initialMonth, lineA, lineB, onClose, onCreate }) {
  const [mode, setMode] = useState(initialMode);
  const [month, setMonth] = useState(initialMonth);
  const [a, setA] = useState(lineA);
  const [b, setB] = useState(lineB);
  const thisMonth = dayKey(new Date()).slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => dayKey(addMonths(new Date(), -i)).slice(0, 7));
  const monthName = (m) => capitalize(startOfDay(`${m}-01`).toLocaleDateString('es', { month: 'long' }));

  function create() {
    onCreate(mode === 'mes'
      ? `/estadisticas/reporte?tipo=mes&mes=${month}`
      : `/estadisticas/reporte?tipo=ab&a=${a.from}_${a.to}&b=${b.from}_${b.to}`);
  }

  return (
    <Modal onClose={onClose}>
      <div className="pe">
        <div className="pe-head">
          <p className="eyebrow">Reporte en PDF</p>
          <h3>Exportar estadísticas</h3>
        </div>
        <div className="seg-buttons" role="group" aria-label="Tipo de reporte">
          <button type="button" className={mode === 'mes' ? 'active' : ''} aria-pressed={mode === 'mes'} onClick={() => setMode('mes')}>Un mes</button>
          <button type="button" className={mode === 'ab' ? 'active' : ''} aria-pressed={mode === 'ab'} onClick={() => setMode('ab')}>A vs B</button>
        </div>

        {mode === 'mes' ? (
          <section className="pe-section">
            <h4>Mes</h4>
            <div className="report-months">
              {months.map((m) => (
                <button key={m} type="button" className={`report-month${month === m ? ' active' : ''}`} aria-pressed={month === m} onClick={() => setMonth(m)}>
                  <b>{monthName(m)}</b>
                  <span>{m.slice(0, 4)}</span>
                </button>
              ))}
            </div>
            <label className="report-month-other">
              <span>Otro mes</span>
              <input type="month" value={month} max={thisMonth} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} />
            </label>
          </section>
        ) : (
          <section className="pe-section">
            <h4>Líneas de tiempo</h4>
            <div className="stat-lines" style={{ marginBottom: 0 }}>
              <LinePicker name="A" tone="current" line={a} onChange={setA} />
              <LinePicker name="B" tone="prev" line={b} onChange={setB} />
            </div>
          </section>
        )}

        <div className="pe-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-amber" onClick={create}>Crear reporte</button>
        </div>
      </div>
    </Modal>
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

// Dos líneas de tiempo que elige el dueño: A (la que se mide) y B (contra la que se compara).
function LinePickers({ lineA, lineB, onChangeA, onChangeB }) {
  return (
    <div className="stat-lines">
      <LinePicker name="A" tone="current" line={lineA} onChange={onChangeA} />
      <LinePicker name="B" tone="prev" line={lineB} onChange={onChangeB} />
    </div>
  );
}

function LinePicker({ name, tone, line, onChange }) {
  const today = dayKey(new Date());
  // si "desde" queda después de "hasta", se acomodan solas para no dejar una línea vacía
  function set(field, value) {
    if (!value) return;
    const next = { ...line, [field]: value };
    if (next.from > next.to) { if (field === 'from') next.to = value; else next.from = value; }
    onChange(next);
  }
  return (
    <div className="stat-line">
      <span className={`stat-line-tag ${tone}`}>{name}</span>
      <label>
        <span>Desde</span>
        <input type="date" value={line.from} max={today} onChange={(e) => set('from', e.target.value)} />
      </label>
      <label>
        <span>Hasta</span>
        <input type="date" value={line.to} max={today} onChange={(e) => set('to', e.target.value)} />
      </label>
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
