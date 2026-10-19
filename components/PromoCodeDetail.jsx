'use client';
import { useState } from 'react';
import Link from 'next/link';
import { sb } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { promoSummary, promoWindow } from '@/lib/promo';
import { promoDaily } from '@/lib/promoStats';
import Modal from './Modal';

// Estadísticas y acciones de un código: canjes, ventas, descuento, canjes por día, productos
// y los últimos pedidos; editar, pausar, descargar el reporte o eliminarlo.
export default function PromoCodeDetail({ promo, status, stats, itemName, onClose, onEdit, onChanged }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const days = promoDaily(promo, stats);
  const maxUses = Math.max(1, ...days.map((d) => d.uses));
  const limit = Number(promo.max_uses) || 0;
  const round = (v) => money(Math.round(v));
  const labelEvery = Math.ceil(days.length / 7);

  async function run(fn) {
    setBusy(true);
    setError('');
    const { error: err } = await fn();
    setBusy(false);
    if (err) { setError(err.message); return false; }
    await onChanged();
    return true;
  }

  const togglePause = () => run(() => sb.from('promo_codes').update({ active: !promo.active }).eq('id', promo.id));
  async function remove() {
    if (await run(() => sb.from('promo_codes').delete().eq('id', promo.id))) onClose();
  }
  function copy() {
    try { navigator.clipboard.writeText(promo.code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch (e) { /* sin portapapeles */ }
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="pe promo-detail">
        <div className="promo-detail-head">
          <span className={`promo-pill is-${status.id}`}>{status.label}</span>
          <button type="button" className="promo-detail-code" onClick={copy} aria-label={`Copiar ${promo.code}`}>
            {promo.code}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
          <p className="promo-detail-what">{promoSummary(promo, itemName)}{promo.title ? ` · ${promo.title}` : ''}</p>
          <ul className="promo-detail-rules">
            <li>{promoWindow(promo, true)}</li>
            {Number(promo.min_subtotal) > 0 && <li>Compra mínima {money(promo.min_subtotal)}</li>}
            {limit > 0 && <li>{Math.max(0, limit - stats.uses)} de {limit} canjes disponibles</li>}
            {promo.once_per_customer && <li>Una vez por cliente</li>}
          </ul>
        </div>

        <div className="promo-detail-kpis">
          <div><span className="kpi-label">Canjes</span><b>{stats.uses}</b></div>
          <div><span className="kpi-label">Ventas</span><b>{round(stats.revenue)}</b></div>
          <div><span className="kpi-label">Descuento dado</span><b>{round(stats.discount)}</b></div>
          <div><span className="kpi-label">Ticket promedio</span><b>{round(stats.avgTicket)}</b></div>
        </div>

        <section className="pe-section">
          <h4>Canjes por día</h4>
          <div className="promo-days" style={{ '--n': days.length }}>
            {days.map((d, i) => (
              <div key={d.key} className="promo-day" title={`${d.date.toLocaleDateString('es', { day: 'numeric', month: 'short' })}: ${d.uses} canje${d.uses === 1 ? '' : 's'}`}>
                <span className="promo-day-bar"><i style={{ height: `${(d.uses / maxUses) * 100}%` }} /></span>
                <span className="promo-day-label">{i % labelEvery === 0 || i === days.length - 1 ? d.date.getDate() : ''}</span>
              </div>
            ))}
          </div>
        </section>

        {stats.products.length > 0 && (
          <section className="pe-section">
            <h4>Lo que más pidieron</h4>
            <ol className="promo-products">
              {stats.products.slice(0, 5).map((p) => (
                <li key={p.name}><span>{p.name}</span><b>{p.qty}</b></li>
              ))}
            </ol>
          </section>
        )}

        <section className="pe-section">
          <h4>Últimos pedidos</h4>
          {stats.orders.length ? (
            <ul className="promo-orders">
              {stats.orders.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <span><b>{o.customer_name || 'Cliente'}</b><small>{new Date(o.created_at).toLocaleString('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></span>
                  <span className="promo-orders-amt">{money(Number(o.subtotal || 0) + Number(o.tax_amount || 0))}{Number(o.promo.discount) > 0 && <small>−{money(o.promo.discount)}</small>}</span>
                </li>
              ))}
            </ul>
          ) : <p className="promo-empty-line">Todavía nadie lo ha usado.</p>}
        </section>

        {promo.redeem_message && (
          <section className="pe-section">
            <h4>Mensaje al canjear</h4>
            <div className="promo-bubble">{promo.redeem_message}</div>
          </section>
        )}

        <div className="promo-detail-actions">
          <Link href={`/promociones/reporte?codigo=${promo.id}`} className="pill-btn-dark">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
            Reporte PDF
          </Link>
          <button type="button" className="hours-add" onClick={onEdit}>Editar</button>
          <button type="button" className="hours-add" onClick={togglePause} disabled={busy}>{promo.active ? 'Pausar' : 'Activar'}</button>
        </div>

        {error && <div className="form-msg show error">{error}</div>}

        {confirmDelete ? (
          <div className="pe-danger">
            <span>¿Eliminar {promo.code}? Ya no se podrá canjear. Los pedidos que lo usaron se quedan como están.</span>
            <div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>No</button>
              <button type="button" className="btn btn-sm pe-danger-btn" onClick={remove} disabled={busy}>Sí, eliminar</button>
            </div>
          </div>
        ) : (
          <button type="button" className="pe-delete-link" onClick={() => setConfirmDelete(true)}>Eliminar código</button>
        )}
        <div style={{ height: 22 }} />
      </div>
    </Modal>
  );
}
