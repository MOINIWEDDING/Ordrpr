'use client';
import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { useSettings } from '@/context/SettingsContext';
import { money } from '@/hooks/useMenuItems';
import BrandLogo from '@/components/BrandLogo';
import { useAccounting } from '@/components/AccountingView';
import { addDays, startOfDay } from '@/lib/stats';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const m2 = (v) => money(Math.round(v * 100) / 100);
const m0 = (v) => money(Math.round(v));
const pct = (v) => `${(Math.round(v * 10) / 10).toLocaleString('es-DO')}%`;
const invNo = (n) => `F-${String(n).padStart(6, '0')}`;
const shortDay = (k) => startOfDay(k).toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '');

// Reporte contable para imprimir o guardar como PDF (A4): ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD[&sucursal=id]
export default function AccountingReport() {
  const params = useSearchParams();
  const router = useRouter();
  const { profile, authReady, canSeeAccounting } = useAuth();
  const { branches } = useBranch();
  const { settings } = useSettings();
  const from = params.get('desde');
  const to = params.get('hasta');
  const branch = params.get('sucursal') || '';
  const valid = DAY_RE.test(from || '') && DAY_RE.test(to || '') && from <= to;
  const range = useMemo(() => (valid ? { start: startOfDay(from), end: addDays(startOfDay(to), 1) } : null), [valid, from, to]);
  const { acc, error } = useAccounting({ branch: branch || null, start: range && range.start, end: range && range.end, enabled: !!(valid && profile && canSeeAccounting) });
  const brand = settings.brand_name || 'Mi Restaurante';
  const branchName = branch ? ((branches.find((b) => b.id === branch) || {}).full || branch) : 'Todas las sucursales';
  const title = params.get('titulo') || `${from} al ${to}`;

  useEffect(() => { if (authReady && profile && !canSeeAccounting) router.push('/'); }, [authReady, profile, canSeeAccounting, router]);
  useEffect(() => {
    document.body.classList.add('report-mode');
    return () => document.body.classList.remove('report-mode');
  }, []);
  useEffect(() => {
    const before = document.title;
    document.title = `Reporte contable ${brand} ${from || ''} ${to || ''}`;
    return () => { document.title = before; };
  }, [brand, from, to]);

  if (!profile || !canSeeAccounting) return null;

  return (
    <div className="rp-page">
      <div className="rp-toolbar">
        <Link href="/contabilidad" className="rp-back">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Contabilidad
        </Link>
        {acc && (
          <button type="button" className="btn btn-amber rp-print" onClick={() => window.print()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
            Descargar PDF
          </button>
        )}
      </div>
      {!valid ? <p className="empty-note">Este enlace de reporte no es válido. Vuelve a Contabilidad y créalo otra vez.</p>
        : error ? <div className="form-msg show error">No se pudo cargar: {error}</div>
        : !acc ? <p className="empty-note">Preparando el reporte…</p>
        : <ReportDoc acc={acc} brand={brand} branchName={branchName} title={title} settings={settings} />}
    </div>
  );
}

function Head({ brand, branchName, title, settings, page }) {
  return (
    <div className="rp-head">
      <div className="rp-brand">
        <BrandLogo className="rp-logo" alt="" />
        <div>
          <b>{settings.business_legal_name || brand}</b>
          <span>{[settings.business_rnc ? `RNC ${settings.business_rnc}` : '', branchName].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      <div className="rp-kind">
        <span>Reporte contable{page ? ` · ${page}` : ''}</span>
        <b>{title}</b>
      </div>
    </div>
  );
}

function ReportDoc({ acc, brand, branchName, title, settings }) {
  const t = acc.totals;
  const inv = acc.invoicesInfo;
  const payTotal = Math.max(1, acc.methods.reduce((s, x) => s + x.amount, 0));
  const generated = new Date().toLocaleString('es', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const headProps = { brand, branchName, title, settings };

  return (
    <article className="rp acr">
      <section className="rp-sheet">
        <Head {...headProps} />

        <div className="acr-hero">
          <div><span className="rp-label">Total cobrado</span><b>{m2(t.collected)}</b></div>
          <div><span className="rp-label">Ventas netas</span><b>{m2(t.net)}</b></div>
          <div><span className="rp-label">Impuestos</span><b>{m2(t.taxTotal)}</b></div>
          <div><span className="rp-label">Ventas</span><b>{t.count.toLocaleString('es')}</b></div>
        </div>

        <div className="acr-two">
          <div className="rp-block">
            <h4 className="rp-h">Estado de ventas</h4>
            <table className="rp-table acr-statement">
              <tbody>
                <tr><td>Ventas brutas</td><td>{m2(t.gross)}</td></tr>
                <tr><td>(−) Descuentos</td><td>{m2(t.discounts)}</td></tr>
                <tr className="is-sum"><td>Ventas netas</td><td><b>{m2(t.net)}</b></td></tr>
                {t.taxes.map((x) => <tr key={x.label}><td>(+) {x.label}</td><td>{m2(x.amount)}</td></tr>)}
                <tr><td>(+) Propinas</td><td>{m2(t.tips)}</td></tr>
                <tr className="is-total"><td>Total cobrado</td><td><b>{m2(t.collected)}</b></td></tr>
                {acc.hasCost && <tr><td>(−) Costo de lo vendido</td><td>{m2(t.cogs)}</td></tr>}
                {acc.hasCost && <tr className="is-sum"><td>Ganancia bruta · {pct(t.marginPct)}</td><td><b>{m2(t.grossProfit)}</b></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="rp-block">
            <h4 className="rp-h">Facturación</h4>
            <table className="rp-table">
              <tbody>
                <tr><td>Facturas emitidas</td><td>{inv.issued}{inv.first ? ` (${invNo(inv.first)} – ${invNo(inv.last)})` : ''}</td></tr>
                <tr><td>Con crédito fiscal (RNC)</td><td>{inv.fiscalCount} · {m2(inv.fiscalAmount)}</td></tr>
                <tr><td>Consumo final</td><td>{inv.finalCount} · {m2(inv.finalAmount)}</td></tr>
                <tr><td>Anuladas</td><td>{inv.voidCount} · {m2(inv.voidAmount)}</td></tr>
                {inv.legacyCount > 0 && <tr><td>Pedidos sin factura</td><td>{inv.legacyCount} · {m2(inv.legacyAmount)}</td></tr>}
                <tr><td>Ticket promedio</td><td>{m2(t.avgTicket)}</td></tr>
                <tr><td>Por cobrar (cuentas abiertas hoy)</td><td>{acc.receivable.tabs} · {m2(acc.receivable.amount)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="acr-two">
          <div className="rp-block">
            <h4 className="rp-h">Formas de pago</h4>
            <table className="rp-table">
              <thead><tr><th>Forma</th><th>Pagos</th><th>Monto</th><th>%</th></tr></thead>
              <tbody>
                {acc.methods.map((x) => <tr key={x.method}><td>{x.label}</td><td>{x.count}</td><td>{m2(x.amount)}</td><td>{pct((x.amount / payTotal) * 100)}</td></tr>)}
              </tbody>
            </table>
          </div>
          <div className="rp-block">
            <h4 className="rp-h">Gift cards</h4>
            <table className="rp-table">
              <tbody>
                <tr><td>Vendidas en el periodo</td><td>{acc.gift.soldCount} · {m2(acc.gift.sold)}</td></tr>
                <tr><td>Usadas como pago</td><td>{m2(acc.gift.redeemed)}</td></tr>
              </tbody>
            </table>
            <p className="acr-note">Una gift card vendida es un anticipo: se vuelve venta cuando el cliente la usa.</p>
          </div>
        </div>

        <div className="rp-block">
          <h4 className="rp-h">Ventas por categoría</h4>
          <table className="rp-table">
            <thead><tr><th>Categoría</th><th>Ventas</th><th>%</th></tr></thead>
            <tbody>
              {acc.categories.map((c) => <tr key={c.label}><td>{c.label}</td><td>{m2(c.value)}</td><td>{pct((c.value / Math.max(1, acc.categories.reduce((s, x) => s + x.value, 0))) * 100)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rp-sheet">
        <Head {...headProps} page="detalle" />
        <div className="rp-block">
          <h4 className="rp-h">Ventas por día</h4>
          <table className="rp-table acr-days">
            <thead><tr><th>Día</th><th>Ventas</th><th>Netas</th>{acc.taxOrder.map((l) => <th key={l}>{l}</th>)}<th>Propinas</th><th>Cobrado</th></tr></thead>
            <tbody>
              {acc.days.map((d) => (
                <tr key={d.day}><td>{shortDay(d.day)}</td><td>{d.count}</td><td>{m0(d.net)}</td>{acc.taxOrder.map((l) => <td key={l}>{m0(d.taxes[l] || 0)}</td>)}<td>{m0(d.tips)}</td><td><b>{m0(d.total)}</b></td></tr>
              ))}
              <tr className="is-total"><td>Total</td><td>{t.count}</td><td>{m0(t.net)}</td>{t.taxes.map((x) => <td key={x.label}>{m0(x.amount)}</td>)}<td>{m0(t.tips)}</td><td><b>{m0(t.collected)}</b></td></tr>
            </tbody>
          </table>
        </div>

        <div className="rp-block">
          <h4 className="rp-h">Productos{acc.hasCost ? ', costo y margen' : ''}<span>los 20 que más vendieron</span></h4>
          <table className="rp-table">
            <thead><tr><th>Producto</th><th>Cant.</th><th>Ventas</th>{acc.hasCost && <><th>Costo</th><th>Ganancia</th></>}</tr></thead>
            <tbody>
              {acc.products.slice(0, 20).map((p) => <tr key={p.id || p.name}><td>{p.name}</td><td>{p.qty}</td><td>{m0(p.sales)}</td>{acc.hasCost && <><td>{m0(p.cost)}</td><td>{m0(p.margin)}</td></>}</tr>)}
            </tbody>
          </table>
        </div>

        {acc.staff.length > 0 && (
          <div className="rp-block">
            <h4 className="rp-h">Ventas y propinas por camarero</h4>
            <table className="rp-table">
              <thead><tr><th>Camarero</th><th>Cuentas</th><th>Ventas netas</th><th>Propinas</th></tr></thead>
              <tbody>{acc.staff.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.count}</td><td>{m0(s.net)}</td><td>{m0(s.tips)}</td></tr>)}</tbody>
            </table>
          </div>
        )}

        <div className="acr-sign">
          <div><span /> Preparado por</div>
          <div><span /> Revisado por</div>
        </div>
        <p className="acr-foot">Generado el {generated}. Montos en la moneda principal; los cobros en otras monedas están convertidos a la tasa del día de cada venta.</p>
      </section>
    </article>
  );
}
