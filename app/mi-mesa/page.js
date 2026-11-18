'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { useTaxSettings } from '@/hooks/useTaxSettings';
import { describeOptions } from '@/lib/productOptions';
import { getGuestPushRef } from '@/lib/guestOrders';
import { useActiveTab, setActiveTab } from '@/lib/activeTab';
import { ORDER_STATUS, PAY_LABEL, tabTotals } from '@/lib/pos';
import { printReceipt } from '@/lib/printReceipt';
import { Prefactura } from '@/components/Receipt';
import Modal from '@/components/Modal';
import { kickEcf } from '@/lib/ecf/kick';

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
  const [showPay, setShowPay] = useState(false);
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

  async function cancelPay(p) {
    const { data } = await sb.rpc('tab_payment_cancel', { payment_input: p.id, code_input: active.code });
    if (!data) showToast('No se pudo cancelar.');
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

  const unpaid = tab.orders.filter((o) => !o.paid);
  const payments = tab.payments || [];
  const pendingPays = payments.filter((p) => p.status === 'pending');
  const paidPays = payments.filter((p) => p.status === 'paid');
  const paidTotal = paidPays.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  // quiénes tienen algo por pagar que todavía no avisaron
  const canPay = [...new Set(unpaid.map((o) => o.customer_name).filter((n) => n && !pendingPays.some((p) => p.person === n)))];
  const t = tabTotals(unpaid, charges);
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
            {tab.eta_at ? (
              <div className="mimesa-banner is-eta">
                <b>{Math.max(1, Math.ceil((new Date(tab.eta_at).getTime() - Date.now()) / 60000))} min</b>
                <span>{tab.eta_name || 'Tu camarero'} {tab.eta_kind === 'bill' ? 'te trae la cuenta' : 'viene a tu mesa'}</span>
              </div>
            ) : (
              <>
                {tab.status === 'bill' && <div className="mimesa-banner">Pediste la cuenta: en un momento te la traen.</div>}
                {tab.call_waiter_at && tab.status !== 'bill' && <div className="mimesa-banner soft">Llamaste al camarero a las {timeOf(tab.call_waiter_at)}.</div>}
              </>
            )}

            <div className="mimesa-actions">
              <Link href="/menu" className="btn btn-amber">Pedir más</Link>
              <button type="button" className="btn btn-ghost" onClick={() => act('tab_call_waiter', 'Ya avisamos al camarero')}>Llamar camarero</button>
              <button type="button" className="btn btn-ghost" onClick={() => act('tab_request_bill', 'Listo, ya pediste la cuenta')} disabled={tab.status === 'bill' || !tab.orders.length}>Pedir la cuenta</button>
            </div>

            {tab.orders.length === 0 ? (
              <p className="empty-note">Todavía no hay pedidos. Toca «Pedir más» para ver el menú.</p>
            ) : (
              <div className="mimesa-orders">
                {tab.orders.map((o) => {
                  const st = ORDER_STATUS[o.status] || ORDER_STATUS.nueva;
                  return (
                    <div key={o.id} className={`mimesa-order${o.paid ? ' is-paid' : ''}`}>
                      <div className="mimesa-order-top">
                        <b>{o.customer_name || 'Pedido'}</b>
                        <span className={`pos-chip is-${st.tone}`}>{st.label}</span>
                        {o.paid && <span className="pos-chip is-paid">Pagado</span>}
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

            {(pendingPays.length > 0 || paidPays.length > 0) && (
              <div className="mimesa-pays">
                {pendingPays.map((p) => (
                  <div key={p.id} className="mimesa-pay is-pending">
                    <div>
                      <b>{p.person} · {money(p.amount)}</b>
                      <span>{PAY_LABEL[p.method] || p.method}: {p.method === 'transferencia' ? 'muéstrale la transferencia al camarero.' : 'el camarero viene a cobrarte.'}</span>
                    </div>
                    <button type="button" onClick={() => cancelPay(p)}>Cancelar</button>
                  </div>
                ))}
                {paidPays.map((p) => (
                  <div key={p.id} className="mimesa-pay is-paid">
                    <div>
                      <b>{p.person} pagó {money(p.amount)}</b>
                      <span>{PAY_LABEL[p.method] || p.method}</span>
                    </div>
                    {p.invoice_id && <Link href={`/factura/${p.invoice_id}?c=${encodeURIComponent(active.code)}`}>Factura</Link>}
                  </div>
                ))}
              </div>
            )}

            <div className="mimesa-totals">
              <div><span>Consumo</span><span>{money(t.gross)}</span></div>
              {t.taxLines.map((l) => <div key={l.label}><span>{l.label} ({l.percent}%)</span><span>{money(l.amount)}</span></div>)}
              {paidTotal > 0 && <div><span>Ya pagado</span><span>{money(paidTotal)}</span></div>}
              <div className="mimesa-total"><span>{paidTotal > 0 ? 'Falta por pagar' : 'Total'}</span><span>{money(t.total)}</span></div>
              {tab.guests > 1 && paidTotal === 0 && <div className="mimesa-each"><span>Entre {tab.guests}</span><span>{money(Math.ceil(t.total / tab.guests))} c/u</span></div>}
              {canPay.length > 0 && <button type="button" className="btn btn-amber btn-block mimesa-paybtn" onClick={() => setShowPay(true)}>Pagar mi parte</button>}
              <button type="button" className="mimesa-bill-link" onClick={() => setShowBill(true)} disabled={!unpaid.length}>Ver prefactura</button>
            </div>
          </>
        )}
      </div>

      {showBill && (
        <Modal onClose={() => setShowBill(false)}>
          <div className="pos-receipt-modal">
            <div className="print-target"><Prefactura tab={{ ...tab, orders: unpaid }} charges={charges} business={business} /></div>
            <button type="button" className="btn btn-ghost btn-block" onClick={printReceipt}>Imprimir o guardar en PDF</button>
          </div>
        </Modal>
      )}
      {showPay && !closed && (
        <PayPartSheet tab={tab} active={active} people={canPay} charges={charges} onClose={() => setShowPay(false)} onDone={() => { setShowPay(false); load(); }} />
      )}
    </section>
  );
}

const ME_KEY = 'rp-tab-me';
const TIPS = [0, 5, 10];

// Pagar lo de una persona: sus pedidos aún sin pagar, con su ITBIS y ley. La gift card se descuenta al
// momento; efectivo, tarjeta o transferencia avisan al camarero, que cobra y lo confirma.
function PayPartSheet({ tab, active, people, charges, onClose, onDone }) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [who, setWho] = useState(() => {
    try { const m = window.localStorage.getItem(ME_KEY); if (m && people.includes(m)) return m; } catch (e) { /* nada */ }
    return people[0] || '';
  });
  const [tipPct, setTipPct] = useState(0);
  const [method, setMethod] = useState('tarjeta');
  const [fiscalOn, setFiscalOn] = useState(false);
  const [rnc, setRnc] = useState('');
  const [fiscalName, setFiscalName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mine = tab.orders.filter((o) => !o.paid && o.customer_name === who);
  const base = tabTotals(mine, charges);
  const tip = Math.round((base.gross * tipPct) / 100);
  const total = base.total + tip;
  const balance = profile ? Number(profile.gift_card_balance || 0) : 0;
  const methods = [
    { id: 'tarjeta', label: 'Tarjeta' },
    { id: 'efectivo', label: 'Efectivo' },
    { id: 'transferencia', label: 'Transferencia' },
    ...(profile ? [{ id: 'gift_card', label: 'Gift card', note: money(balance), off: balance < total }] : []),
  ];

  async function pay() {
    const digits = rnc.replace(/\D/g, '');
    if (fiscalOn && digits.length !== 9 && digits.length !== 11) { setError('El RNC tiene 9 dígitos o la cédula 11.'); return; }
    setBusy(true);
    setError('');
    const { data, error: err } = await sb.rpc('tab_pay_part', {
      tab_input: tab.id, code_input: active.code, person_input: who, method_input: method, tip_input: tip,
      fiscal_input: fiscalOn ? { rnc: digits, name: fiscalName.trim() } : null,
    });
    setBusy(false);
    if (err) { setError(/tab_pay_part|schema cache/i.test(err.message) ? 'Pagar por persona todavía no está disponible en este restaurante.' : err.message); return; }
    try { window.localStorage.setItem(ME_KEY, who); } catch (e) { /* nada */ }
    showToast(data && data.status === 'paid' ? '¡Listo, tu parte está pagada!' : 'Listo: el camarero viene a cobrarte');
    if (data && data.status === 'paid') kickEcf();
    onDone();
  }

  return (
    <Modal onClose={onClose}>
      <div className="pe paypart">
        <div className="pe-head">
          <p className="eyebrow">{tab.table_label}</p>
          <h3>Pagar mi parte</h3>
        </div>

        {people.length > 1 && (
          <div className="field">
            <label>¿Quién paga?</label>
            <div className="ticket-people">
              {people.map((p) => <button key={p} type="button" className={who === p ? 'on' : ''} onClick={() => setWho(p)}>{p}</button>)}
            </div>
          </div>
        )}

        <div className="paypart-lines">
          {mine.flatMap((o) => o.items).map((it, i) => (
            <div key={i}><span>{it.qty}× {it.name}</span><span>{money(it.price * it.qty)}</span></div>
          ))}
          <div className="paypart-sub"><span>Consumo</span><span>{money(base.gross)}</span></div>
          {base.taxLines.map((l) => <div key={l.label} className="paypart-sub"><span>{l.label} ({l.percent}%)</span><span>{money(l.amount)}</span></div>)}
          {tip > 0 && <div className="paypart-sub"><span>Propina</span><span>{money(tip)}</span></div>}
          <div className="paypart-total"><span>Total</span><span>{money(total)}</span></div>
        </div>

        <div className="field">
          <label>Propina</label>
          <div className="ticket-people">
            {TIPS.map((n) => <button key={n} type="button" className={tipPct === n ? 'on' : ''} onClick={() => setTipPct(n)}>{n === 0 ? 'Sin propina' : `${n}%`}</button>)}
          </div>
        </div>

        <div className="field">
          <label>¿Cómo pagas?</label>
          <div className="paypart-methods">
            {methods.map((m) => (
              <button key={m.id} type="button" className={method === m.id ? 'on' : ''} disabled={m.off} onClick={() => setMethod(m.id)}>
                {m.label}{m.note && <small>{m.note}</small>}
              </button>
            ))}
          </div>
        </div>

        <label className="paypart-fiscal">
          <input type="checkbox" checked={fiscalOn} onChange={(e) => setFiscalOn(e.target.checked)} />
          <span>Factura con RNC</span>
        </label>
        {fiscalOn && (
          <div className="pe-money-row">
            <div className="field"><label htmlFor="ppRnc">RNC o cédula</label><input id="ppRnc" type="text" inputMode="numeric" maxLength={13} value={rnc} onChange={(e) => setRnc(e.target.value)} /></div>
            <div className="field"><label htmlFor="ppName">Razón social</label><input id="ppName" type="text" maxLength={80} value={fiscalName} onChange={(e) => setFiscalName(e.target.value)} /></div>
          </div>
        )}

        {error && <div className="form-msg show error">{error}</div>}
        <button type="button" className="btn btn-amber btn-block" onClick={pay} disabled={busy || !who || !mine.length}>
          {busy ? 'Un momento…' : method === 'gift_card' ? `Pagar ${money(total)} con gift card` : `Avisar al camarero · ${money(total)}`}
        </button>
      </div>
    </Modal>
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
      {(tab.payments || []).some((p) => p.status === 'paid' && p.invoice_id) ? (
        <div className="mimesa-invoices">
          {(tab.payments || []).filter((p) => p.status === 'paid' && p.invoice_id).map((p) => (
            <Link key={p.id} href={`/factura/${p.invoice_id}?c=${encodeURIComponent(active.code)}`} className="btn btn-ghost">Factura de {p.person}</Link>
          ))}
          {tab.invoice_id && <Link href={`/factura/${tab.invoice_id}?c=${encodeURIComponent(active.code)}`} className="btn btn-ghost">Factura del resto</Link>}
        </div>
      ) : tab.invoice_id && (
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
