'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { useTaxSettings } from '@/hooks/useTaxSettings';
import { describeOptions } from '@/lib/productOptions';
import { getGuestPushRef } from '@/lib/guestOrders';
import { useActiveTab, setActiveTab } from '@/lib/activeTab';
import { ORDER_STATUS, tabTotals } from '@/lib/pos';
import { printReceipt } from '@/lib/printReceipt';
import { Prefactura } from '@/components/Receipt';
import Modal from '@/components/Modal';

const timeOf = (d) => new Date(d).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' });

// La cuenta abierta del cliente: lo que ha pedido su mesa, en vivo, y los botones para llamar al
// camarero, pedir la cuenta o ver la prefactura. Al cerrarse, la factura y las estrellas al camarero.
export default function MiMesaPage() {
  const active = useActiveTab();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const [tab, setTab] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showBill, setShowBill] = useState(false);
  const { charges } = useTaxSettings(tab ? tab.branch : null);

  const load = useCallback(async () => {
    if (!active || !BARRO_CONFIGURED) { setLoaded(true); return; }
    const { data } = await sb.rpc('tab_get', { tab_input: active.id, code_input: active.code });
    setTab(data || null);
    setLoaded(true);
  }, [active]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function act(fn, ok) {
    const { data, error } = await sb.rpc(fn, { tab_input: active.id, code_input: active.code });
    if (error || !data) { showToast('No se pudo. Intenta de nuevo.'); return; }
    showToast(ok);
    load();
  }

  async function share() {
    const url = `${window.location.origin}/mesa/${tab.table_id}`;
    const text = `Únete a nuestra cuenta en ${settings.brand_name || 'el restaurante'} (${tab.table_label}). Código: ${tab.code}`;
    try {
      if (navigator.share) { await navigator.share({ title: settings.brand_name, text, url }); return; }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      showToast('Copiado: compártelo con tu mesa');
    } catch (e) { /* cancelado */ }
  }

  if (!loaded) return <section className="mimesa-page"><div className="wrap"><p className="empty-note">Cargando tu cuenta…</p></div></section>;

  if (!active || !tab) {
    return (
      <section className="mimesa-page">
        <div className="wrap mimesa-empty">
          <h2>No tienes una cuenta abierta</h2>
          <p>Escanea el código QR de tu mesa para abrir una o unirte a la de tu mesa.</p>
          {active && <button type="button" className="btn btn-ghost" onClick={() => setActiveTab(null)}>Olvidar esta cuenta</button>}
          <Link href="/menu" className="btn btn-amber">Ver el menú</Link>
        </div>
      </section>
    );
  }

  const t = tabTotals(tab.orders, charges);
  const closed = tab.status === 'closed' || tab.status === 'cancelled';
  const business = { brand_name: settings.brand_name, legal_name: settings.business_legal_name, rnc: settings.business_rnc, address: settings.address, phone: settings.phone, logo_url: settings.logo_url };

  return (
    <section className="mimesa-page">
      <div className="wrap">
        <div className="mimesa-head">
          <div>
            <p className="eyebrow">{settings.brand_name}</p>
            <h2>{tab.table_label}</h2>
            <span className="mimesa-sub">Cuenta #{tab.number}{tab.waiter_name ? ` · te atiende ${tab.waiter_name}` : ''}</span>
          </div>
          {!closed && (
            <button type="button" className="mimesa-code" onClick={share} aria-label="Compartir el código con la mesa">
              <small>Código</small>
              <b>{tab.code}</b>
              <span>Compartir</span>
            </button>
          )}
        </div>

        {closed ? (
          <ClosedTab tab={tab} active={active} />
        ) : (
          <>
            {tab.status === 'bill' && <div className="mimesa-banner">Pediste la cuenta: en un momento te la traen.</div>}
            {tab.call_waiter_at && tab.status !== 'bill' && <div className="mimesa-banner soft">Llamaste al camarero a las {timeOf(tab.call_waiter_at)}.</div>}

            <div className="mimesa-actions">
              <Link href="/menu" className="btn btn-amber">Pedir más</Link>
              <button type="button" className="btn btn-ghost" onClick={() => act('tab_call_waiter', 'Ya avisamos al camarero')}>Llamar al camarero</button>
              <button type="button" className="btn btn-ghost" onClick={() => act('tab_request_bill', 'Listo, ya pediste la cuenta')} disabled={tab.status === 'bill' || !tab.orders.length}>Pedir la cuenta</button>
            </div>

            {tab.orders.length === 0 ? (
              <p className="empty-note">Todavía no hay pedidos. Toca «Pedir más» para ver el menú.</p>
            ) : (
              <div className="mimesa-orders">
                {tab.orders.map((o) => {
                  const st = ORDER_STATUS[o.status] || ORDER_STATUS.nueva;
                  return (
                    <div key={o.id} className="mimesa-order">
                      <div className="mimesa-order-top">
                        <b>{o.customer_name || 'Pedido'}</b>
                        <span className={`pos-chip is-${st.tone}`}>{st.label}</span>
                        <small>{timeOf(o.created_at)}</small>
                      </div>
                      <ul>
                        {o.items.map((it, i) => (
                          <li key={i}>
                            <span>{it.qty}× {it.name}{it.options && it.options.length ? <small>{describeOptions(it.options)}</small> : null}</span>
                            <span>{money(it.price * it.qty)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mimesa-totals">
              <div><span>Consumo</span><span>{money(t.gross)}</span></div>
              {t.taxLines.map((l) => <div key={l.label}><span>{l.label} ({l.percent}%)</span><span>{money(l.amount)}</span></div>)}
              <div className="mimesa-total"><span>Total</span><span>{money(t.total)}</span></div>
              {tab.guests > 1 && <div className="mimesa-each"><span>Entre {tab.guests}</span><span>{money(Math.ceil(t.total / tab.guests))} c/u</span></div>}
              <button type="button" className="mimesa-bill-link" onClick={() => setShowBill(true)} disabled={!tab.orders.length}>Ver prefactura</button>
            </div>
          </>
        )}
      </div>

      {showBill && (
        <Modal onClose={() => setShowBill(false)}>
          <div className="pos-receipt-modal">
            <div className="print-target"><Prefactura tab={tab} charges={charges} business={business} /></div>
            <button type="button" className="btn btn-ghost btn-block" onClick={printReceipt}>Imprimir o guardar en PDF</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

// Cuenta cerrada: la factura y, si hubo camarero, sus estrellas.
function ClosedTab({ tab, active }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function rate() {
    setBusy(true);
    const { data } = await sb.rpc('tab_rate_waiter', {
      tab_input: tab.id, code_input: active.code, stars_input: stars, comment_input: comment, rater_input: getGuestPushRef() || '',
    });
    setBusy(false);
    if (data) setSent(true);
  }

  return (
    <div className="mimesa-closed">
      <div className="mimesa-closed-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></div>
      <h3>{tab.status === 'cancelled' ? 'La cuenta se canceló' : '¡Gracias por tu visita!'}</h3>
      {tab.invoice_id && (
        <Link href={`/factura/${tab.invoice_id}?c=${encodeURIComponent(active.code)}`} className="btn btn-amber">Ver mi factura</Link>
      )}
      {tab.waiter_id && tab.status === 'closed' && (
        sent ? <p className="mimesa-thanks">¡Gracias por calificar a {tab.waiter_name || 'tu camarero'}!</p> : (
          <div className="rate-box">
            <p>¿Cómo te atendió {tab.waiter_name || 'tu camarero'}?</p>
            <div className="rate-stars" role="radiogroup" aria-label="Estrellas">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`} className={n <= stars ? 'on' : ''} onClick={() => setStars(n)}>★</button>
              ))}
            </div>
            {stars > 0 && (
              <>
                <textarea rows={2} maxLength={300} placeholder="Algo que quieras contarnos (opcional)" value={comment} onChange={(e) => setComment(e.target.value)} />
                <button type="button" className="btn btn-ghost btn-block" onClick={rate} disabled={busy}>{busy ? 'Enviando…' : 'Enviar'}</button>
              </>
            )}
          </div>
        )
      )}
      <button type="button" className="mimesa-done" onClick={() => setActiveTab(null)}>Terminar</button>
    </div>
  );
}
