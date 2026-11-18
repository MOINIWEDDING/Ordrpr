'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { useSettings } from '@/context/SettingsContext';
import AccountingView, { useAccounting } from '@/components/AccountingView';
import InvoiceSettingsForm from '@/components/InvoiceSettingsForm';
import EcfSetup from '@/components/EcfSetup';
import { accountingCsv, CSV_FILES, downloadCsv } from '@/lib/accounting';
import { ACC_PERIODS, accRange, accTitle, shiftAnchor } from '@/lib/accountingPeriod';
import { addDays, dayKey } from '@/lib/stats';

// Contabilidad: para el contador (y el dueño). Elige el periodo y la sucursal, revisa los números y
// descarga el reporte en PDF o los datos en CSV.
export default function ContabilidadPage() {
  const router = useRouter();
  const { profile, authReady, canSeeAccounting } = useAuth();
  const { branches } = useBranch();
  const { settings } = useSettings();
  const today = dayKey(new Date());
  const [period, setPeriod] = useState('mes');
  const [anchor, setAnchor] = useState(today);
  const [from, setFrom] = useState(dayKey(addDays(new Date(), -29)));
  const [to, setTo] = useState(today);
  const [branch, setBranch] = useState(''); // '' = todas
  const [csvOpen, setCsvOpen] = useState(false);
  const [view, setView] = useState('reportes'); // reportes | facturacion
  const csvRef = useRef(null);

  useEffect(() => {
    if (authReady && profile && !canSeeAccounting) router.push('/');
  }, [authReady, profile, canSeeAccounting, router]);
  useEffect(() => {
    if (!csvOpen) return undefined;
    const close = (e) => { if (csvRef.current && !csvRef.current.contains(e.target)) setCsvOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [csvOpen]);

  const range = useMemo(() => accRange(period, anchor, from, to), [period, anchor, from, to]);
  const { acc, loading, error } = useAccounting({ branch: branch || null, start: range.start, end: range.end, enabled: !!(profile && canSeeAccounting) });
  const title = accTitle(period, range);
  const branchName = (id) => (branches.find((b) => b.id === id) || {}).full || id || '';
  const atFuture = period !== 'rango' && range.end > new Date();
  const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function csv(kind) {
    setCsvOpen(false);
    if (!acc) return;
    const file = `${slug(settings.brand_name || 'negocio')}-${kind}-${dayKey(range.start)}_${dayKey(addDays(range.end, -1))}${branch ? `-${slug(branchName(branch))}` : ''}.csv`;
    downloadCsv(file, accountingCsv(kind, acc, { branchName }));
  }
  const pdfHref = `/contabilidad/reporte?desde=${dayKey(range.start)}&hasta=${dayKey(addDays(range.end, -1))}${branch ? `&sucursal=${encodeURIComponent(branch)}` : ''}&titulo=${encodeURIComponent(title)}`;

  if (!profile || !canSeeAccounting) return null;

  return (
    <section className="acc-page">
      <div className="acc-wrap">
        <div className="acc-head">
          <div>
            <p className="eyebrow">{settings.brand_name}</p>
            <h2>Contabilidad</h2>
          </div>
          {view === 'reportes' && <div className="acc-actions">
            <button type="button" className="acc-btn" onClick={() => router.push(pdfHref)} disabled={!acc}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M12 11v6M9.5 14.5 12 17l2.5-2.5" /></svg>
              Reporte PDF
            </button>
            <div className="acc-csv" ref={csvRef}>
              <button type="button" className="acc-btn is-dark" onClick={() => setCsvOpen((v) => !v)} aria-expanded={csvOpen} disabled={!acc}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14" /></svg>
                Exportar CSV
              </button>
              {csvOpen && (
                <div className="acc-csv-menu" role="menu">
                  {CSV_FILES.map((f) => <button key={f.id} type="button" role="menuitem" onClick={() => csv(f.id)}>{f.label}</button>)}
                </div>
              )}
            </div>
          </div>}
        </div>

        <div className="acc-views" role="tablist" aria-label="Contabilidad">
          <button type="button" role="tab" aria-selected={view === 'reportes'} className={view === 'reportes' ? 'on' : ''} onClick={() => setView('reportes')}>Reportes</button>
          <button type="button" role="tab" aria-selected={view === 'facturacion'} className={view === 'facturacion' ? 'on' : ''} onClick={() => setView('facturacion')}>Facturación</button>
        </div>

        {view === 'facturacion' ? (
          <div className="acc-billing">
            <section className="acc-card">
              <h3>Datos fiscales</h3>
              <InvoiceSettingsForm />
            </section>
            <section className="acc-card">
              <h3>Facturación electrónica (e-CF)</h3>
              <EcfSetup />
            </section>
          </div>
        ) : (<>
        <div className="acc-controls">
          <div className="acc-seg" role="tablist" aria-label="Periodo">
            {ACC_PERIODS.map((p) => <button key={p.id} type="button" role="tab" aria-selected={period === p.id} className={period === p.id ? 'on' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>)}
          </div>
          {period === 'rango' ? (
            <div className="acc-range">
              <label><span>Desde</span><input type="date" value={from} max={today} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
              <label><span>Hasta</span><input type="date" value={to} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
            </div>
          ) : (
            <div className="acc-nav">
              <button type="button" onClick={() => setAnchor(shiftAnchor(period, anchor, -1))} aria-label="Anterior"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg></button>
              <b>{title}</b>
              <button type="button" onClick={() => setAnchor(shiftAnchor(period, anchor, 1))} disabled={atFuture} aria-label="Siguiente"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></button>
            </div>
          )}
          {branches.length > 1 && (
            <div className="acc-branches" role="radiogroup" aria-label="Sucursal">
              <button type="button" role="radio" aria-checked={!branch} className={!branch ? 'on' : ''} onClick={() => setBranch('')}>Todas</button>
              {branches.map((b) => <button key={b.id} type="button" role="radio" aria-checked={branch === b.id} className={branch === b.id ? 'on' : ''} onClick={() => setBranch(b.id)}>{b.full}</button>)}
            </div>
          )}
        </div>

        {error ? <div className="form-msg show error">No se pudo cargar la contabilidad: {error}</div>
          : loading && !acc ? <p className="empty-note">Cargando…</p>
          : <div className={loading ? 'acc-loading' : ''}><AccountingView acc={acc} /></div>}
        </>)}
      </div>
    </section>
  );
}
