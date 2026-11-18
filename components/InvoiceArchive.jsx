'use client';
import { useEffect, useMemo, useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { useSettings } from '@/context/SettingsContext';
import { accountingCsv, computeAccounting, downloadCsv, ECF_NAME } from '@/lib/accounting';
import { addDays, capitalize, dayKey, startOfDay } from '@/lib/stats';

const COLS = 'id, number, kind, issued_at, branch, table_label, customer_name, fiscal, items, subtotal, discount, tax_lines, tax_total, tip, total, payments, status, ncf, ecf_type, ecf_status';
const invNo = (n) => `F-${String(n).padStart(6, '0')}`;
const monthName = (m) => capitalize(startOfDay(`${m}-01`).toLocaleDateString('es', { month: 'long' }));
const dayName = (k) => capitalize(startOfDay(k).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }));
const timeOf = (d) => new Date(d).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' });
const nextMonth = (m) => { const d = startOfDay(`${m}-01`); return dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 1)); };
const EMPTY = { orders: [], menuItems: [], giftCards: [], people: [], openTabs: [], openOrders: [], taxSettings: [] };

function matches(inv, q) {
  if (!q) return true;
  const t = q.toLowerCase().replace(/^f-?0*/, '');
  return String(inv.number).includes(t) || (inv.customer_name || '').toLowerCase().includes(t)
    || ((inv.fiscal && inv.fiscal.rnc) || '').includes(t) || ((inv.fiscal && inv.fiscal.name) || '').toLowerCase().includes(t)
    || (inv.ncf || '').toLowerCase().includes(t) || (inv.table_label || '').toLowerCase().includes(t);
}

// Todas las facturas para el contador: carpetas por mes (con su resumen), el mes abierto por días y la
// lista completa. Cada mes y cada día se descarga en PDF (todas las facturas para imprimir) o en CSV.
export default function InvoiceArchive({ branch, branchName }) {
  const { settings } = useSettings();
  const [mode, setMode] = useState('meses'); // meses | todas
  const [months, setMonths] = useState(null);
  const [month, setMonth] = useState(null);
  const [rows, setRows] = useState(null);
  const [all, setAll] = useState([]);
  const [allDone, setAllDone] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!BARRO_CONFIGURED) { setMonths([]); return; }
    setMonths(null); setMonth(null); setAll([]); setAllDone(false);
    sb.rpc('invoice_months', { branch_input: branch || null }).then(({ data, error: err }) => {
      if (err) setError(/invoice_months|schema cache/i.test(err.message) ? 'Falta actualizar la base de datos de este restaurante.' : err.message);
      setMonths(data || []);
    });
  }, [branch]);

  useEffect(() => {
    if (!month) { setRows(null); return; }
    setRows(null);
    let qy = sb.from('invoices').select(COLS).gte('issued_at', startOfDay(`${month}-01`).toISOString()).lt('issued_at', startOfDay(nextMonth(month)).toISOString()).order('issued_at', { ascending: false }).limit(5000);
    if (branch) qy = qy.eq('branch', branch);
    qy.then(({ data }) => setRows(data || []));
  }, [month, branch]);

  async function loadMore() {
    let qy = sb.from('invoices').select(COLS).order('issued_at', { ascending: false }).limit(100);
    if (branch) qy = qy.eq('branch', branch);
    if (all.length) qy = qy.lt('issued_at', all[all.length - 1].issued_at);
    const { data } = await qy;
    setAll((a) => [...a, ...(data || [])]);
    if (!data || data.length < 100) setAllDone(true);
  }
  useEffect(() => { if (mode === 'todas' && !all.length && !allDone && BARRO_CONFIGURED) loadMore(); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const brand = slug(settings.brand_name || 'negocio');
  function csv(list, label) {
    const acc = computeAccounting({ ...EMPTY, invoices: [...list].sort((a, b) => (a.issued_at < b.issued_at ? -1 : 1)) });
    downloadCsv(`${brand}-facturas-${label}${branch ? `-${slug(branchName(branch))}` : ''}.csv`, accountingCsv('facturas', acc, { branchName }));
  }
  const pdfHref = (from, to, title) => `/contabilidad/facturas?desde=${from}&hasta=${to}${branch ? `&sucursal=${encodeURIComponent(branch)}` : ''}&titulo=${encodeURIComponent(title)}`;

  const days = useMemo(() => {
    if (!rows) return [];
    const map = new Map();
    rows.filter((r) => matches(r, q)).forEach((r) => {
      const k = dayKey(new Date(r.issued_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return [...map.entries()];
  }, [rows, q]);

  const years = useMemo(() => {
    const y = {};
    (months || []).forEach((m) => { (y[m.month.slice(0, 4)] = y[m.month.slice(0, 4)] || []).push(m); });
    return Object.entries(y).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [months]);

  return (
    <div className="arc">
      <div className="arc-top">
        <div className="acc-seg" role="tablist" aria-label="Ver facturas">
          <button type="button" role="tab" aria-selected={mode === 'meses'} className={mode === 'meses' ? 'on' : ''} onClick={() => setMode('meses')}>Por mes</button>
          <button type="button" role="tab" aria-selected={mode === 'todas'} className={mode === 'todas' ? 'on' : ''} onClick={() => setMode('todas')}>Todas</button>
        </div>
        {(mode === 'todas' || month) && (
          <div className="tfield is-small arc-search">
            <input id="arcSearch" placeholder=" " value={q} onChange={(e) => setQ(e.target.value)} />
            <label htmlFor="arcSearch">Buscar número, cliente, RNC o e-NCF</label>
          </div>
        )}
      </div>
      {error && <div className="form-msg show error">{error}</div>}

      {mode === 'meses' && !month && (
        months === null ? <p className="empty-note">Cargando…</p> : months.length === 0 ? <p className="empty-note">Todavía no hay facturas.</p> : (
          years.map(([year, list]) => (
            <div key={year} className="arc-year">
              <h3>{year}</h3>
              <div className="arc-folders">
                {list.map((m) => (
                  <div key={m.month} className="arc-folder">
                    <button type="button" className="arc-folder-open" onClick={() => { setMonth(m.month); setQ(''); }}>
                      <span className="arc-folder-tab" aria-hidden="true" />
                      <b>{monthName(m.month)}</b>
                      <span>{Number(m.issued).toLocaleString('es-DO')} {Number(m.issued) === 1 ? 'factura' : 'facturas'}</span>
                      <strong>{money(Math.round(Number(m.total)))}</strong>
                      {Number(m.voided) > 0 && <small>{m.voided} anulada{Number(m.voided) === 1 ? '' : 's'}</small>}
                    </button>
                    <div className="arc-folder-dl">
                      <a href={pdfHref(`${m.month}-01`, dayKey(addDays(startOfDay(nextMonth(m.month)), -1)), `${monthName(m.month)} ${year}`)}>PDF</a>
                      <button type="button" onClick={async () => {
                        let qy = sb.from('invoices').select(COLS).gte('issued_at', startOfDay(`${m.month}-01`).toISOString()).lt('issued_at', startOfDay(nextMonth(m.month)).toISOString()).limit(5000);
                        if (branch) qy = qy.eq('branch', branch);
                        const { data } = await qy;
                        csv(data || [], m.month);
                      }}>CSV</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )
      )}

      {mode === 'meses' && month && (
        <div className="arc-month">
          <div className="arc-month-head">
            <button type="button" className="arc-back" onClick={() => setMonth(null)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>Carpetas
            </button>
            <h3>{monthName(month)} {month.slice(0, 4)}</h3>
            <div className="arc-dl">
              <a className="acc-btn" href={pdfHref(`${month}-01`, dayKey(addDays(startOfDay(nextMonth(month)), -1)), `${monthName(month)} ${month.slice(0, 4)}`)}>PDF del mes</a>
              <button type="button" className="acc-btn is-dark" onClick={() => rows && csv(rows, month)} disabled={!rows}>CSV del mes</button>
            </div>
          </div>
          {rows === null ? <p className="empty-note">Cargando…</p> : days.length === 0 ? <p className="empty-note">No hay facturas{q ? ' con esa búsqueda' : ''}.</p> : days.map(([k, list]) => (
            <div key={k} className="arc-day">
              <div className="arc-day-head">
                <div>
                  <b>{dayName(k)}</b>
                  <span>{list.length} {list.length === 1 ? 'factura' : 'facturas'} · {money(Math.round(list.filter((x) => x.status === 'emitida').reduce((s, x) => s + Number(x.total || 0), 0)))}</span>
                </div>
                <div className="arc-day-dl">
                  <a href={pdfHref(k, k, dayName(k))}>PDF</a>
                  <button type="button" onClick={() => csv(list, k)}>CSV</button>
                </div>
              </div>
              <InvoiceRows list={list} />
            </div>
          ))}
        </div>
      )}

      {mode === 'todas' && (
        <div className="arc-all">
          <InvoiceRows list={all.filter((r) => matches(r, q))} withDate />
          {!allDone && <button type="button" className="btn btn-ghost arc-more" onClick={loadMore}>Cargar más</button>}
        </div>
      )}
    </div>
  );
}

function InvoiceRows({ list, withDate }) {
  if (!list.length) return <p className="empty-note">No hay facturas.</p>;
  return (
    <ul className="arc-rows">
      {list.map((r) => (
        <li key={r.id}>
          <a href={`/factura/${r.id}`} target="_blank" rel="noreferrer" className={r.status === 'anulada' ? 'is-void' : ''}>
            <span className="arc-no">{invNo(r.number)}</span>
            <span className="arc-when">{withDate ? new Date(r.issued_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' : ''}{timeOf(r.issued_at)}</span>
            <span className="arc-who">
              {r.customer_name || (r.table_label || 'Venta')}
              {r.fiscal && r.fiscal.rnc && <small>RNC {r.fiscal.rnc}</small>}
            </span>
            <span className="arc-tags">
              {r.ncf && <em className="arc-ncf">{r.ncf}</em>}
              {r.ecf_status && <em className={`arc-ecf is-${r.ecf_status}`}>{ECF_NAME[r.ecf_status]}</em>}
              {r.status === 'anulada' && <em className="arc-ecf is-rechazado">Anulada</em>}
            </span>
            <b className="arc-total">{money(Number(r.total))}</b>
          </a>
        </li>
      ))}
    </ul>
  );
}
