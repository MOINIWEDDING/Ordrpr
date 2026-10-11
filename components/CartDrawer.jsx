'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { useGuestInfo } from '@/context/GuestInfoContext';
import { useTables } from '@/hooks/useTables';
import { useTaxSettings } from '@/hooks/useTaxSettings';
import { money } from '@/hooks/useMenuItems';
import { useToast } from '@/context/ToastContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import EarlyBirdResult from './EarlyBirdResult';

const DELIVERY = 0; // no hay delivery; se sirve en el local

const PAYMENT_METHODS = [
  { id: 'gift_card', label: 'Gift Card', ready: true },
  { id: 'efectivo', label: 'Efectivo', ready: true },
  { id: 'tarjeta', label: 'Tarjeta', ready: true },
];

export default function CartDrawer() {
  const { lines, subtotal, setQty, setNotes, removeItem, clear, tableNumber, setTableNumber, customerName, setCustomerName, drawerOpen, closeDrawer } = useCart();
  const { profile, refreshProfile } = useAuth();
  const { branch, branchInfo } = useBranch();
  const { tables } = useTables(branch);
  const { charges: taxCharges, totalPercent: taxPercent } = useTaxSettings(branch);
  const guestInfo = useGuestInfo();
  const { showToast } = useToast();
  const [promo, setPromo] = useState('');
  const [orderType, setOrderType] = useState(null); // 'pickup' | 'dine_in' | null
  const [partySize, setPartySize] = useState(1);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState('');
  const [success, setSuccess] = useState(false);
  const [earlyBirdResult, setEarlyBirdResult] = useState(null); // {type:'winner'|'in_window_no_win', prize, discountApplied} | null
  const [lastOrderSummary, setLastOrderSummary] = useState(null); // {orderType, tableNumber, partySize, total} — copia para el mensaje de éxito

  // El sexo/edad del invitado se recolectan al entrar (después de "Continuar
  // como invitado"), nunca aquí en el checkout — si por algo faltan, el pedido
  // simplemente se manda sin ese dato, no se interrumpe la compra por eso.
  const effectiveGender = profile ? profile.gender : guestInfo.gender;
  const effectiveAge = profile ? profile.age : guestInfo.age;

  const effectiveName = customerName || (profile ? profile.name : '') || '';
  const taxAmount = Math.round((subtotal * taxPercent) / 100);
  const total = subtotal + taxAmount + DELIVERY;

  async function handlePay(method) {
    if (!lines.length) return;
    const chosen = PAYMENT_METHODS.find((m) => m.id === method);
    if (!chosen.ready) {
      showToast(`${chosen.label} llega pronto — por ahora paga con tarjeta de crédito.`);
      return;
    }
    if (!orderType) { setPlaceError('Elige si es pick up o para comer aquí antes de continuar.'); return; }
    if (orderType === 'dine_in' && !tableNumber) { setPlaceError('Elige tu mesa antes de continuar.'); return; }
    if (!effectiveName.trim()) { setPlaceError('Escribe tu nombre antes de continuar.'); return; }
    if (!branch) { setPlaceError('Elige la sucursal antes de continuar.'); return; }

    setPlaceError('');
    setPlacing(true);
    setEarlyBirdResult(null);

    // Se intenta el Early Bird ANTES de cobrar, para que si gana y el premio
    // aplica, el descuento ya esté restado del total antes de procesar el pago.
    let ebOutcome = null;
    let ebPrizeDescription = 'una bebida gratis';
    let ebDiscountApplied = false;
    let finalSubtotal = subtotal;

    if (BARRO_CONFIGURED) {
      const { data: ebData } = await sb.rpc('try_claim_early_bird', {
        branch_input: branch,
        order_id_input: null,
        customer_name_input: effectiveName.trim(),
        user_id_input: profile ? profile.id : null,
      });
      if (ebData) {
        ebOutcome = ebData.outcome;
        if (ebData.prize_description) ebPrizeDescription = ebData.prize_description;
        if (ebOutcome === 'winner') {
          let prizeLine = null;
          if (ebData.discount_any_beverage) {
            // se descuenta la bebida más barata del pedido (si tiene más de una)
            const beverageLines = lines.filter((l) => l.is_beverage);
            if (beverageLines.length) {
              prizeLine = beverageLines.reduce((cheapest, l) => (l.price < cheapest.price ? l : cheapest), beverageLines[0]);
            }
          } else if (ebData.prize_item_id) {
            prizeLine = lines.find((l) => l.id === ebData.prize_item_id) || null;
          }
          if (prizeLine) {
            finalSubtotal = Math.max(0, subtotal - prizeLine.price);
            ebDiscountApplied = true;
          }
        }
      }
    }

    const finalTaxAmount = Math.round((finalSubtotal * taxPercent) / 100);
    const finalTotal = finalSubtotal + finalTaxAmount + DELIVERY;

    if (method === 'gift_card') {
      if (!profile) { setPlaceError('Inicia sesión para pagar con tu gift card.'); setPlacing(false); return; }
      if ((profile.gift_card_balance || 0) < finalTotal) {
        setPlaceError(`No te alcanza el balance de gift card (tienes ${money(profile.gift_card_balance || 0)}, el total es ${money(finalTotal)}). Elige otro método o completa el pago con tarjeta.`);
        setPlacing(false);
        return;
      }
    }

    if (method === 'gift_card' && BARRO_CONFIGURED) {
      const { error: payError } = await sb.rpc('pay_with_gift_card', { amount_input: finalTotal });
      if (payError) { setPlaceError(payError.message.replace('exception: ', '')); setPlacing(false); return; }
    }

    const payload = {
      customer_name: effectiveName.trim(),
      table_number: orderType === 'pickup' ? 'Pick up' : tableNumber,
      items: lines.map((l) => ({ id: l.id, name: l.name, price: l.price, qty: l.qty, notes: l.notes || '', options: l.options || [] })),
      subtotal: finalSubtotal,
      tax_amount: finalTaxAmount,
      payment_method: method,
      user_id: profile ? profile.id : null,
      branch,
      customer_gender: effectiveGender || null,
      customer_age: effectiveAge || null,
      party_size: orderType === 'dine_in' ? partySize : 1,
    };

    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('orders').insert(payload);
      if (error) { setPlaceError('No se pudo enviar el pedido: ' + error.message); setPlacing(false); return; }
    }

    if (ebOutcome === 'winner' || ebOutcome === 'in_window_no_win') {
      setEarlyBirdResult({ type: ebOutcome, prize: ebPrizeDescription, discountApplied: ebDiscountApplied });
    }

    if (method === 'gift_card') await refreshProfile();

    const effectivePartySize = orderType === 'dine_in' ? partySize : 1;

    setPlacing(false);
    setSuccess(true);
    setLastOrderSummary({ orderType, tableNumber, partySize: effectivePartySize, total: finalTotal });
    clear();
    setOrderType(null);
    setPartySize(1);
    if (!ebOutcome && effectivePartySize <= 1) {
      setTimeout(() => { setSuccess(false); closeDrawer(); }, 2600);
    }
  }

  function handleClose() {
    if (success) return; // deja que la animación termine
    closeDrawer();
  }

  function handleEarlyBirdClose() {
    setEarlyBirdResult(null);
    setSuccess(false);
    closeDrawer();
  }

  return (
    <AnimatePresence>
      {drawerOpen && (
        <motion.div
          className="overlay show"
          style={{ alignItems: 'flex-end' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            className="modal cart-modal"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            {success ? (
              earlyBirdResult ? (
                <EarlyBirdResult
                  type={earlyBirdResult.type}
                  prize={earlyBirdResult.prize}
                  discountApplied={earlyBirdResult.discountApplied}
                  onClose={handleEarlyBirdClose}
                />
              ) : (
              <div className="order-success">
                <motion.div
                  className="order-check"
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}
                >
                  <motion.svg viewBox="0 0 24 24" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.25 }}>
                    <path d="M5 13l4 4L19 7" />
                  </motion.svg>
                </motion.div>
                <motion.h3 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                  ¡Muchas gracias por tu compra!
                </motion.h3>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
                  {lastOrderSummary?.orderType === 'pickup' ? 'Tu pedido está listo para recoger en el local.' : `Tu pedido ya va camino a ${lastOrderSummary?.tableNumber}.`}
                </motion.p>
                {lastOrderSummary?.partySize > 1 && (
                  <motion.div
                    className="split-bill-box"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
                  >
                    <span className="eyebrow">Cuenta dividida entre {lastOrderSummary.partySize}</span>
                    <div className="split-bill-row">
                      <span>{money(lastOrderSummary.total)} ÷ {lastOrderSummary.partySize} personas</span>
                      <span className="split-bill-each">{money(Math.round(lastOrderSummary.total / lastOrderSummary.partySize))} c/u</span>
                    </div>
                    <button type="button" className="btn btn-amber btn-block" style={{ marginTop: 16 }} onClick={() => { setSuccess(false); closeDrawer(); }}>Listo</button>
                  </motion.div>
                )}
              </div>
              )
            ) : (
              <>
                <div className="modal-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 60 }}>
                  <h3 style={{ margin: 0 }}>Carrito</h3>
                  {lines.length > 0 && (
                    <button type="button" className="icon-btn" aria-label="Vaciar carrito" onClick={clear}>
                      <svg className="icon" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
                    </button>
                  )}
                </div>
                <button type="button" className="modal-close" onClick={handleClose} aria-label="Cerrar">
                  <svg className="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>

                <div className="modal-body">
                  {lines.length === 0 ? (
                    <p className="empty-note">Tu carrito está vacío. Agrega algo desde el menú.</p>
                  ) : (
                    <>
                      <div className="cart-lines">
                        {lines.map((l) => (
                          <div className="cart-line-block" key={l.lineKey}>
                            <div className="cart-line">
                              <div className="cart-line-photo">
                                {l.image_url ? <img src={l.image_url} alt={l.name} /> : null}
                              </div>
                              <div className="cart-line-body">
                                <h4>{l.name}</h4>
                                {l.options && l.options.length > 0 && (
                                  <span className="cart-line-options">{l.options.map((o) => o.label).join(' · ')}</span>
                                )}
                                <span className="cart-line-price">{money(l.price)}</span>
                              </div>
                              <div className="qty-stepper">
                                <button type="button" onClick={() => setQty(l.lineKey, l.qty - 1)} aria-label="Menos">–</button>
                                <span>{l.qty}</span>
                                <button type="button" onClick={() => setQty(l.lineKey, l.qty + 1)} aria-label="Más">+</button>
                              </div>
                              <button type="button" className="cart-line-remove" onClick={() => removeItem(l.lineKey)} aria-label="Quitar">
                                <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                              </button>
                            </div>
                            <input
                              type="text"
                              className="cart-line-notes"
                              placeholder="Alguna nota para este producto (ej. sin azúcar)…"
                              value={l.notes || ''}
                              onChange={(e) => setNotes(l.lineKey, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="checkout-fields">
                        <div className="field">
                          <label htmlFor="cartName">Tu nombre</label>
                          <input id="cartName" type="text" placeholder="¿A nombre de quién?" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                        </div>

                        <div className="field">
                          <label>¿Cómo lo quieres?</label>
                          <div className="order-type-row">
                            <button
                              type="button"
                              className={`order-type-btn${orderType === 'pickup' ? ' active' : ''}`}
                              onClick={() => setOrderType('pickup')}
                            >
                              <svg viewBox="0 0 24 24"><path d="M20 8l-8-5-8 5v8l8 5 8-5z" /><path d="M12 3v18M4 8l8 5 8-5" /></svg>
                              Pick up
                            </button>
                            <button
                              type="button"
                              className={`order-type-btn${orderType === 'dine_in' ? ' active' : ''}`}
                              onClick={() => setOrderType('dine_in')}
                            >
                              <svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
                              Comer aquí
                            </button>
                          </div>
                        </div>

                        {orderType === 'dine_in' && (
                          <>
                            <div className="field">
                              <label htmlFor="cartTable">Tu mesa</label>
                              <select id="cartTable" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)}>
                                <option value="">Elige tu mesa…</option>
                                {tables.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
                              </select>
                            </div>
                            <div className="field">
                              <label htmlFor="cartPartySize">¿Cuántos son en la mesa?</label>
                              <div className="qty-stepper">
                                <button type="button" onClick={() => setPartySize((n) => Math.max(1, n - 1))} aria-label="Menos">–</button>
                                <span>{partySize}</span>
                                <button type="button" onClick={() => setPartySize((n) => Math.min(20, n + 1))} aria-label="Más">+</button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      {branch && (
                        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Pidiendo en: {branchInfo?.full}</p>
                      )}

                      <div className="promo-row">
                        <input type="text" placeholder="Código promocional" value={promo} onChange={(e) => setPromo(e.target.value)} />
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => showToast('Los códigos promocionales llegan pronto.')}>Aplicar</button>
                      </div>

                      <div className="cart-totals">
                        <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
                        {taxCharges.map((c, i) => (
                          <div key={i}><span>{c.label} ({c.percent}%)</span><span>{money(Math.round((subtotal * (Number(c.percent) || 0)) / 100))}</span></div>
                        ))}
                        <div><span>Entrega</span><span>{DELIVERY === 0 ? 'En el local' : money(DELIVERY)}</span></div>
                        <div className="cart-total-final"><span>Total</span><span>{money(total)}</span></div>
                      </div>

                      {placeError && <div className="form-msg show error" style={{ marginTop: 14 }}>{placeError}</div>}

                      <p className="pay-label">
                        Elige cómo pagar
                        {profile && <span className="muted" style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}> · tu balance de gift card: {money(profile.gift_card_balance || 0)}</span>}
                      </p>
                      <div className="pay-grid">
                        {PAYMENT_METHODS.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={`pay-btn${m.ready ? ' ready' : ''}`}
                            disabled={placing}
                            onClick={() => handlePay(m.id)}
                          >
                            {m.label}
                            {!m.ready && <span className="pay-soon">Próximamente</span>}
                          </button>
                        ))}
                      </div>
                      <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                        Efectivo y tarjeta se cobran en persona en el local — solo estás avisando cómo vas a pagar.
                      </p>
                    </>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
