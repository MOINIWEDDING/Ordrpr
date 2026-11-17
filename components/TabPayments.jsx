'use client';
import { useState } from 'react';
import Link from 'next/link';
import { sb } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { PAY_LABEL } from '@/lib/pos';

const CONFIRM_METHODS = ['tarjeta', 'efectivo', 'transferencia'];

// Lo que cada persona pagó o avisó que va a pagar, para la caja y el camarero: «Cobrado» lo confirma
// (con la forma de pago real) y la parte de esa persona sale de lo que falta por cobrar.
export default function StaffPayments({ tab, onChanged, showToast }) {
  const [busy, setBusy] = useState(null);
  const [methods, setMethods] = useState({});
  const payments = (tab && tab.payments) || [];
  if (!payments.length) return null;
  const pending = payments.filter((p) => p.status === 'pending');
  const paid = payments.filter((p) => p.status === 'paid');

  async function confirm(p) {
    setBusy(p.id);
    const { error } = await sb.rpc('tab_payment_confirm', { payment_input: p.id, method_input: methods[p.id] || p.method });
    setBusy(null);
    if (error) { showToast(error.message); onChanged(); return; }
    showToast(`Cobrado: ${p.person}`);
    onChanged();
  }

  async function cancel(p) {
    setBusy(p.id);
    const { error } = await sb.rpc('tab_payment_cancel', { payment_input: p.id, code_input: null });
    setBusy(null);
    if (error) showToast(error.message);
    onChanged();
  }

  return (
    <div className="staff-pays">
      {pending.map((p) => (
        <div key={p.id} className="staff-pay is-pending">
          <div className="staff-pay-top">
            <span><b>{p.person}</b> quiere pagar</span>
            <b>{money(p.amount)}</b>
          </div>
          <div className="staff-pay-actions">
            <select value={methods[p.id] || p.method} onChange={(e) => setMethods((m) => ({ ...m, [p.id]: e.target.value }))} aria-label="Forma de pago">
              {CONFIRM_METHODS.map((m) => <option key={m} value={m}>{PAY_LABEL[m]}</option>)}
            </select>
            <button type="button" className="staff-pay-ok" onClick={() => confirm(p)} disabled={busy === p.id}>Cobrado</button>
            <button type="button" className="staff-pay-x" onClick={() => cancel(p)} disabled={busy === p.id} aria-label={`Quitar el aviso de ${p.person}`}>×</button>
          </div>
          {Number(p.tip) > 0 && <small>Incluye {money(p.tip)} de propina</small>}
        </div>
      ))}
      {paid.length > 0 && (
        <div className="staff-pay is-paid">
          {paid.map((p) => (
            <div key={p.id} className="staff-pay-row">
              <span><b>{p.person}</b> pagó · {PAY_LABEL[p.method] || p.method}</span>
              <span>{money(p.amount)}{p.invoice_id && <Link href={`/factura/${p.invoice_id}`}>Factura</Link>}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
