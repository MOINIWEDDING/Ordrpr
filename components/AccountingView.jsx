'use client';
import { useEffect, useState } from 'react';
import { BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { formatIn } from '@/lib/settingsDefaults';
import { loadAccounting, computeAccounting } from '@/lib/accounting';
import { startOfDay } from '@/lib/stats';

const m0 = (v) => money(Math.round(v));
const pct = (v) => `${(Math.round(v * 10) / 10).toLocaleString('es-DO')}%`;
const invNo = (n) => `F-${String(n).padStart(6, '0')}`;
const dayLabel = (k) => startOfDay(k).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');

export function useAccounting({ branch, start, end, enabled = true }) {
  const [state, setState] = useState({ acc: null, loading: true, error: '' });
  const key = `${branch || ''}|${start ? start.toISOString() : ''}|${end ? end.toISOString() : ''}`;
  useEffect(() => {
    if (!enabled) return undefined;
    if (!BARRO_CONFIGURED) { setState({ acc: computeAccounting({ invoices: [], orders: [], menuItems: [], giftCards: [], people: [], openTabs: [], openOrders: [], taxSettings: [] }), loading: false, error: '' }); return undefined; }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    loadAccounting({ branch, start, end })
      .then((d) => { if (alive) setState({ acc: computeAccounting(d), loading: false, error: '' }); })
      .catch((e) => { if (alive) setState({ acc: null, loading: false, error: /accounting_people|schema cache/i.test(e.message || '') ? 'Falta actualizar la base de datos de este restaurante.' : e.message }); });
    return () => { alive = false; };
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

// Las cuentas del periodo como las lee un contador: el estado de ventas, la facturación, las formas de
// pago, los días, los productos con su costo y el personal.
export default function AccountingView({ acc }) {
  if (!acc) return null;
  const t = acc.totals;
  const inv = acc.invoicesInfo;
  const payTotal = Math.max(1, acc.methods.reduce((s, x) => s + x.amount, 0));
  const catTotal = Math.max(1, acc.categories.reduce((s, x) => s + x.value, 0));
  const multiCurrency = acc.currencies.length > 1;

  if (t.count === 0 && inv.voidCount === 0) {
    return <p className="empty-note">No hubo ventas en este periodo.</p>;
  }

  return (
    <div className="acc">
      <div className="acc-hero">
        <div>
          <span className="acc-label">Total cobrado</span>
          <b className="acc-hero-value">{m0(t.collected)}</b>
        </div>
        <dl className="acc-hero-facts">
          <div><dt>Ventas</dt><dd>{t.count.toLocaleString('es')}</dd></div>
          <div><dt>Ticket promedio</dt><dd>{m0(t.avgTicket)}</dd></div>
          {acc.hasCost && <div><dt>Margen bruto</dt><dd>{pct(t.marginPct)}</dd></div>}
        </dl>
      </div>

      <div className="acc-grid">
        <section className="acc-card acc-statement">
          <h3>Estado de ventas</h3>
          <table>
            <tbody>
              <tr><th>Ventas brutas</th><td>{m0(t.gross)}</td></tr>
              {t.discounts > 0 && <tr className="is-minus"><th>Descuentos</th><td>−{m0(t.discounts)}</td></tr>}
              <tr className="is-sum"><th>Ventas netas</th><td>{m0(t.net)}</td></tr>
              {t.taxes.filter((x) => x.amount > 0).map((x) => <tr key={x.label} className="is-plus"><th>{x.label}</th><td>{m0(x.amount)}</td></tr>)}
              {t.tips > 0 && <tr className="is-plus"><th>Propinas</th><td>{m0(t.tips)}</td></tr>}
              <tr className="is-total"><th>Total cobrado</th><td>{m0(t.collected)}</td></tr>
              {acc.hasCost && (
                <>
                  <tr className="is-minus is-gap"><th>Costo de lo vendido</th><td>−{m0(t.cogs)}</td></tr>
                  <tr className="is-sum"><th>Ganancia bruta <small>{pct(t.marginPct)} de las ventas netas</small></th><td>{m0(t.grossProfit)}</td></tr>
                </>
              )}
            </tbody>
          </table>
          {!acc.hasCost && <p className="acc-note">Ponle costo a los productos en el menú para ver el costo de lo vendido y la ganancia bruta.</p>}
        </section>

        <section className="acc-card">
          <h3>Facturación</h3>
          <dl className="acc-facts">
            <div><dt>Facturas emitidas</dt><dd>{inv.issued.toLocaleString('es')}{inv.first ? <small>{invNo(inv.first)} a {invNo(inv.last)}</small> : null}</dd></div>
            <div><dt>Con crédito fiscal (RNC)</dt><dd>{m0(inv.fiscalAmount)}<small>{inv.fiscalCount} {inv.fiscalCount === 1 ? 'factura' : 'facturas'}</small></dd></div>
            <div><dt>Consumo final</dt><dd>{m0(inv.finalAmount)}<small>{inv.finalCount} {inv.finalCount === 1 ? 'venta' : 'ventas'}</small></dd></div>
            <div className={inv.voidCount ? 'is-warn' : ''}><dt>Anuladas</dt><dd>{m0(inv.voidAmount)}<small>{inv.voidCount} {inv.voidCount === 1 ? 'factura' : 'facturas'}</small></dd></div>
            {inv.legacyCount > 0 && <div><dt>Pedidos sin factura</dt><dd>{m0(inv.legacyAmount)}<small>{inv.legacyCount} anteriores a la facturación</small></dd></div>}
            {(inv.ecfAccepted + inv.ecfPending + inv.ecfRejected) > 0 && (
              <div className={inv.ecfRejected ? 'is-warn' : ''}><dt>Comprobantes electrónicos</dt><dd>{inv.ecfAccepted} aceptados<small>{inv.ecfPending} en proceso · {inv.ecfRejected} rechazados</small></dd></div>
            )}
            <div><dt>Por cobrar ahora</dt><dd>{m0(acc.receivable.amount)}<small>{acc.receivable.tabs} {acc.receivable.tabs === 1 ? 'cuenta abierta' : 'cuentas abiertas'}</small></dd></div>
          </dl>
        </section>
      </div>

      <div className="acc-grid">
        <section className="acc-card">
          <h3>Formas de pago</h3>
          <ul className="acc-bars">
            {acc.methods.map((x) => (
              <li key={x.method}>
                <span className="acc-bar-label">{x.label}<small>{x.count} {x.count === 1 ? 'pago' : 'pagos'}</small></span>
                <span className="acc-bar-track"><i style={{ width: `${(x.amount / payTotal) * 100}%` }} /></span>
                <span className="acc-bar-value">{m0(x.amount)}<small>{pct((x.amount / payTotal) * 100)}</small></span>
              </li>
            ))}
          </ul>
          {multiCurrency && (
            <dl className="acc-facts is-tight">
              {acc.currencies.map((c) => (
                <div key={c.code}><dt>{c.base ? 'Moneda principal' : `${c.symbol} · ${c.name}`}</dt><dd>{c.base ? m0(c.collected) : formatIn(c.collected, c)}{!c.base && <small>equivale a {m0(c.equivalent)}</small>}</dd></div>
              ))}
            </dl>
          )}
        </section>

        <section className="acc-card">
          <h3>Ventas por categoría</h3>
          <ul className="acc-bars">
            {acc.categories.slice(0, 8).map((x) => (
              <li key={x.label}>
                <span className="acc-bar-label">{x.label}</span>
                <span className="acc-bar-track is-alt"><i style={{ width: `${(x.value / catTotal) * 100}%` }} /></span>
                <span className="acc-bar-value">{m0(x.value)}<small>{pct((x.value / catTotal) * 100)}</small></span>
              </li>
            ))}
          </ul>
          <dl className="acc-facts is-tight">
            <div><dt>Gift cards vendidas</dt><dd>{m0(acc.gift.sold)}<small>{acc.gift.soldCount} · saldo por canjear para el negocio</small></dd></div>
            <div><dt>Pagado con gift cards</dt><dd>{m0(acc.gift.redeemed)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="acc-card">
        <h3>Ventas por día</h3>
        <div className="acc-table-wrap">
          <table className="acc-table">
            <thead>
              <tr><th>Día</th><th>Ventas</th><th>Netas</th>{acc.taxOrder.map((l) => <th key={l}>{l}</th>)}<th>Propinas</th><th>Cobrado</th></tr>
            </thead>
            <tbody>
              {acc.days.map((d) => (
                <tr key={d.day}>
                  <td>{dayLabel(d.day)}</td><td>{d.count}</td><td>{m0(d.net)}</td>
                  {acc.taxOrder.map((l) => <td key={l}>{m0(d.taxes[l] || 0)}</td>)}
                  <td>{m0(d.tips)}</td><td><b>{m0(d.total)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td>{t.count}</td><td>{m0(t.net)}</td>{t.taxes.map((x) => <td key={x.label}>{m0(x.amount)}</td>)}<td>{m0(t.tips)}</td><td>{m0(t.collected)}</td></tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="acc-grid">
        <section className="acc-card">
          <h3>Productos{acc.hasCost ? ', costo y margen' : ''}</h3>
          <div className="acc-table-wrap">
            <table className="acc-table">
              <thead><tr><th>Producto</th><th>Cant.</th><th>Ventas</th>{acc.hasCost && <><th>Costo</th><th>Margen</th></>}</tr></thead>
              <tbody>
                {acc.products.slice(0, 12).map((p) => (
                  <tr key={p.id || p.name}>
                    <td>{p.name}</td><td>{p.qty}</td><td>{m0(p.sales)}</td>
                    {acc.hasCost && <><td>{m0(p.cost)}</td><td className={p.margin < 0 ? 'is-neg' : ''}>{p.sales > 0 ? pct((p.margin / p.sales) * 100) : '—'}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="acc-card">
          <h3>Ventas y propinas por camarero</h3>
          {acc.staff.length === 0 ? <p className="acc-note">Todavía no hay cuentas atendidas por camareros en este periodo.</p> : (
            <div className="acc-table-wrap">
              <table className="acc-table">
                <thead><tr><th>Camarero</th><th>Cuentas</th><th>Ventas netas</th><th>Propinas</th></tr></thead>
                <tbody>{acc.staff.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.count}</td><td>{m0(s.net)}</td><td>{m0(s.tips)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
