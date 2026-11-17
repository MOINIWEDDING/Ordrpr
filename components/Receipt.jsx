'use client';
import { money } from '@/hooks/useMenuItems';
import { describeOptions } from '@/lib/productOptions';
import { PAY_LABEL, groupLines, tabTotals } from '@/lib/pos';

// Prefactura de una cuenta abierta y factura emitida, con aspecto de ticket. Se ven en pantalla,
// se imprimen desde el navegador y salen igual en las impresoras por internet (lib/print/receipt.js).

const fmtDateTime = (d) => new Date(d).toLocaleString('es', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export const invoiceNumber = (n) => `F-${String(n || 0).padStart(6, '0')}`;

function BusinessHead({ b }) {
  return (
    <div className="rc-head">
      {b.logo_url && <img src={b.logo_url} alt="" className="rc-logo" />}
      <b className="rc-brand">{b.brand_name || 'Restaurante'}</b>
      {b.legal_name && <span>{b.legal_name}</span>}
      {b.rnc && <span>RNC {b.rnc}</span>}
      {b.address && <span>{b.address}</span>}
      {b.phone && <span>Tel. {b.phone}</span>}
    </div>
  );
}

function Lines({ lines, showPerson }) {
  let lastPerson = null;
  return (
    <div className="rc-lines">
      {lines.map((l, i) => {
        const head = showPerson && l.person !== lastPerson ? (lastPerson = l.person) : null;
        return (
          <div key={i}>
            {head !== null && head !== undefined && <div className="rc-person">{head || 'Sin nombre'}</div>}
            <div className="rc-line">
              <span className="rc-qty">{l.qty}×</span>
              <span className="rc-name">
                {l.name}
                {l.options && l.options.length > 0 && <small>{describeOptions(l.options)}</small>}
                {l.notes && <small>{l.notes}</small>}
              </span>
              <span className="rc-amt">{money(Number(l.price) * Number(l.qty))}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Totals({ rows }) {
  return (
    <div className="rc-totals">
      {rows.filter(Boolean).map((r) => (
        <div key={r.label} className={r.strong ? 'rc-total' : ''}>
          <span>{r.label}</span>
          <span>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// Prefactura: lo consumido hasta ahora en una cuenta abierta (tab de tab_get).
export function Prefactura({ tab, charges, business, discount = 0, tip = 0, byPerson = true }) {
  const t = tabTotals(tab.orders, charges, { discount, tip });
  const lines = groupLines(tab.orders, { byPerson });
  return (
    <div className="receipt">
      <BusinessHead b={business} />
      <div className="rc-title">Prefactura</div>
      <div className="rc-meta">
        <span>{tab.table_label} · Cuenta #{tab.number}</span>
        <span>{fmtDateTime(new Date())}</span>
        {tab.waiter_name && <span>Camarero: {tab.waiter_name}</span>}
        {tab.guests > 1 && <span>{tab.guests} personas</span>}
      </div>
      <Lines lines={lines} showPerson={byPerson} />
      <Totals rows={[
        { label: 'Subtotal', value: money(t.gross) },
        t.discount > 0 && { label: 'Descuento', value: `−${money(t.discount)}` },
        ...t.taxLines.map((l) => ({ label: `${l.label} (${l.percent}%)`, value: money(l.amount) })),
        t.tip > 0 && { label: 'Propina', value: money(t.tip) },
        { label: 'Total', value: money(t.total), strong: true },
      ]} />
      {tab.guests > 1 && <p className="rc-split">Entre {tab.guests}: {money(Math.ceil(t.total / tab.guests))} c/u</p>}
      <p className="rc-note">Prefactura · No válida como comprobante fiscal</p>
    </div>
  );
}

// Factura emitida (invoice de invoice_get).
export function Factura({ invoice }) {
  const b = invoice.business || {};
  const fiscal = invoice.fiscal || {};
  const lines = invoice.kind === 'tab' ? invoice.items : (invoice.items || []);
  const people = new Set(lines.map((l) => l.person).filter(Boolean));
  return (
    <div className={`receipt${invoice.status === 'anulada' ? ' is-void' : ''}`}>
      <BusinessHead b={b} />
      <div className="rc-title">Factura {invoiceNumber(invoice.number)}</div>
      {invoice.ncf && <div className="rc-ncf">e-NCF {invoice.ncf}</div>}
      <div className="rc-meta">
        <span>{fmtDateTime(invoice.issued_at)}</span>
        {invoice.table_label && <span>{invoice.table_label}</span>}
        {invoice.customer_name && <span>Cliente: {invoice.customer_name}</span>}
        {invoice.waiter_name && <span>Camarero: {invoice.waiter_name}</span>}
        {invoice.cashier_name && <span>Cajero: {invoice.cashier_name}</span>}
      </div>
      {fiscal.rnc ? (
        <div className="rc-fiscal">
          <b>{fiscal.type === 'credito_fiscal' ? 'Crédito fiscal' : 'Consumidor final'}</b>
          <span>RNC/Cédula {fiscal.rnc}</span>
          {fiscal.name && <span>{fiscal.name}</span>}
        </div>
      ) : <div className="rc-fiscal"><b>Consumidor final</b></div>}
      <Lines lines={lines} showPerson={people.size > 1} />
      <Totals rows={[
        { label: 'Subtotal', value: money(invoice.subtotal) },
        Number(invoice.discount) > 0 && { label: 'Descuento', value: `−${money(invoice.discount)}` },
        ...(invoice.tax_lines || []).map((l) => ({ label: `${l.label} (${l.percent}%)`, value: money(l.amount) })),
        Number(invoice.tip) > 0 && { label: 'Propina', value: money(invoice.tip) },
        { label: 'Total', value: money(invoice.total), strong: true },
      ]} />
      <div className="rc-pay">
        {(invoice.payments || []).map((p, i) => (
          <div key={i}><span>{PAY_LABEL[p.method] || p.method || 'Pago'}</span><span>{money(p.amount)}</span></div>
        ))}
      </div>
      {invoice.status === 'anulada' && <p className="rc-void">Anulada</p>}
      {b.footer && <p className="rc-note">{b.footer}</p>}
      <p className="rc-note">¡Gracias por su visita!</p>
    </div>
  );
}
