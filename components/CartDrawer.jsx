'use client';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { useGuestInfo } from '@/context/GuestInfoContext';
import { useTables } from '@/hooks/useTables';
import { useTaxSettings } from '@/hooks/useTaxSettings';
import { money } from '@/hooks/useMenuItems';
import { useToast } from '@/context/ToastContext';
import { convertFromBase, formatIn } from '@/lib/settingsDefaults';
import { useCurrency, linePriceFor } from '@/context/CurrencyContext';
import CurrencySwitcher from './CurrencySwitcher';
import { describeOptions } from '@/lib/productOptions';
import { promoDiscount, promoError, promoSummary } from '@/lib/promo';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { newOrderId, rememberGuestOrder, getGuestPushRef } from '@/lib/guestOrders';
import EarlyBirdResult from './EarlyBirdResult';
import { useLoyaltySettings } from '@/lib/loyalty';
import { useActiveTab, setActiveTab } from '@/lib/activeTab';
import Link from 'next/link';
import { kickEcf } from '@/lib/ecf/kick';

const DELIVERY = 0; // no hay delivery; se sirve en el local

const PAYMENT_METHODS = [
  { id: 'tarjeta', label: 'Tarjeta', ready: true },
  { id: 'efectivo', label: 'Efectivo', ready: true },
  { id: 'gift_card', label: 'Gift card', ready: true },
];

export default function CartDrawer() {
  const { lines, setQty, setNotes, setPerson, removeItem, clear, tableNumber, setTableNumber, customerName, setCustomerName, drawerOpen, closeDrawer } = useCart();
  const { profile, refreshProfile } = useAuth();
  const { loyalty } = useLoyaltySettings();
  // con una cuenta abierta en la mesa, el carrito solo manda el pedido a la cocina (se paga al cerrar la cuenta)
  const activeTab = useActiveTab();
  const [sentToTab, setSentToTab] = useState(false);
  const [payLater, setPayLater] = useState(true);
  const [companions, setCompanions] = useState([]);
  const [newCompanion, setNewCompanion] = useState('');
  const [tabInfo, setTabInfo] = useState(null); // la cuenta tal como está (quiénes ya pidieron)
  const [joinTab, setJoinTab] = useState(null); // la mesa ya tiene cuenta: { tab_id, opened_name }
  const [joinCode, setJoinCode] = useState('');
  const [payMethod, setPayMethod] = useState('tarjeta');
  const [noteKey, setNoteKey] = useState(null); // la línea cuya nota se está escribiendo
  const [showPromo, setShowPromo] = useState(false);
  const [step, setStep] = useState('items');
  const [dir, setDir] = useState(1);
  // en pantallas anchas el carrito entra por la derecha como panel lateral
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const on = () => setIsWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => { if (!drawerOpen) { setSentToTab(false); setStep('items'); setNoteKey(null); } }, [drawerOpen]);
  useEffect(() => { if (!lines.length) setStep('items'); }, [lines.length]);
  useEffect(() => {
    if (!drawerOpen || !activeTab || !BARRO_CONFIGURED) { setTabInfo(null); return; }
    let live = true;
    sb.rpc('tab_get', { tab_input: activeTab.id, code_input: activeTab.code }).then(({ data, error }) => {
      if (!live || error) return;
      // la cuenta ya se cerró (o ya no existe): el carrito vuelve a lo normal
      if (!data || data.status === 'closed' || data.status === 'cancelled') { setActiveTab(null); return; }
      setTabInfo(data);
    });
    return () => { live = false; };
  }, [drawerOpen, activeTab]);
  const { branch, branchInfo } = useBranch();
  const { tables } = useTables(branch);
  const { charges: taxCharges, totalPercent: taxPercent } = useTaxSettings(branch);
  const guestInfo = useGuestInfo();
  const { showToast } = useToast();
  // la moneda que eligió el cliente (la misma del inicio y el menú); solo monedas con tasa de hoy
  const { currencies, currency } = useCurrency();
  const inCurrency = (n) => formatIn(convertFromBase(n, currency), currency);
  // subtotal en moneda principal con los precios que aplican a esa moneda (precio especial si lo hay)
  const viewSubtotal = lines.reduce((s, l) => s + l.qty * linePriceFor(l, currency), 0);
  const [promo, setPromo] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null); // lo que devolvió check_promo_code
  const [promoMsg, setPromoMsg] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [orderType, setOrderType] = useState(null); // 'pickup' | 'dine_in' | null
  const [partySize, setPartySize] = useState(1);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState('');
  const [success, setSuccess] = useState(false);
  const [earlyBirdResult, setEarlyBirdResult] = useState(null); // {type:'winner'|'in_window_no_win', prize, discountApplied} | null
  const [lastOrderSummary, setLastOrderSummary] = useState(null); // {orderType, tableNumber, partySize, total, currency} — copia para el mensaje de éxito

  // El sexo/edad del invitado se recolectan al entrar (después de "Continuar
  // como invitado"), nunca aquí en el checkout — si por algo faltan, el pedido
  // simplemente se manda sin ese dato, no se interrumpe la compra por eso.
  const effectiveGender = profile ? profile.gender : guestInfo.gender;
  const effectiveAge = profile ? profile.age : guestInfo.age;

  const effectiveName = customerName || (profile ? profile.name : '') || '';
  // Cuenta abierta: si ya hay una en este aparato, o si come aquí en una mesa real y elige pagar al final.
  const realTables = BARRO_CONFIGURED && tables.length > 0 && !String(tables[0].id).startsWith('demo-');
  const tabFlow = !!activeTab || (orderType === 'dine_in' && realTables && payLater);
  const tabPeopleNames = tabInfo ? [tabInfo.opened_name, ...(tabInfo.orders || []).map((o) => o.customer_name)] : [];
  const people = [...new Set([effectiveName.trim(), ...companions, ...tabPeopleNames].map((n) => (n || '').trim()).filter(Boolean))];
  const personOf = (l) => (l.person && people.includes(l.person) ? l.person : effectiveName.trim());
  const viewPromo = promoDiscount(appliedPromo, lines.map((l) => ({ ...l, price: linePriceFor(l, currency) })), viewSubtotal);
  const taxBase = viewSubtotal - viewPromo.amount;
  const taxAmount = Math.round((taxBase * taxPercent) / 100);
  const total = taxBase + taxAmount + DELIVERY;

  async function applyPromo() {
    const code = promo.trim();
    if (!code) return;
    setPromoMsg('');
    if (!BARRO_CONFIGURED) { setPromoMsg('Conecta Supabase para usar códigos.'); return; }
    setPromoBusy(true);
    const { data, error } = await sb.rpc('check_promo_code', { code_input: code, subtotal_input: viewSubtotal });
    setPromoBusy(false);
    if (error) { setPromoMsg(/function|schema cache/i.test(error.message || '') ? 'Los códigos todavía no están disponibles.' : error.message); return; }
    if (!data || !data.ok) { setPromoMsg(promoError(data)); return; }
    setAppliedPromo(data);
    setPromo('');
  }

  function removePromo() {
    setAppliedPromo(null);
    setPromoMsg('');
  }

  function addCompanion() {
    const n = newCompanion.trim().slice(0, 30);
    if (n && !people.includes(n)) setCompanions((c) => [...c, n]);
    setNewCompanion('');
  }

  async function shareCode() {
    if (!activeTab) return;
    const url = `${window.location.origin}/mesa/${activeTab.table_id}`;
    const text = `Únete a nuestra cuenta (${activeTab.table_label}). Código: ${activeTab.code}`;
    try {
      if (navigator.share) { await navigator.share({ text, url }); return; }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      showToast('Copiado: compártelo con tu mesa');
    } catch (e) { /* cancelado */ }
  }

  // Abre la cuenta de la mesa (o se une con el código) y manda un pedido por cada persona.
  async function handleSendToTab() {
    if (!lines.length) return;
    if (!effectiveName.trim()) { setPlaceError('Escribe tu nombre antes de continuar.'); return; }
    if (!BARRO_CONFIGURED) { setPlaceError('Conecta Supabase para enviar pedidos.'); return; }
    setPlaceError('');
    setPlacing(true);
    try {
      let tab = activeTab;
      if (!tab) {
        if (joinTab) {
          const { data } = await sb.rpc('tab_get', { tab_input: joinTab.tab_id, code_input: joinCode.trim() });
          if (!data) throw new Error('Ese código no es el de esta mesa.');
          tab = data;
        } else {
          const table = tables.find((t) => t.label === tableNumber);
          if (!table) throw new Error('Elige tu mesa antes de continuar.');
          const { data, error } = await sb.rpc('tab_open', { table_input: table.id, name_input: effectiveName.trim(), guests_input: partySize });
          if (error) throw error;
          if (data && data.reason === 'exists' && data.tab_id) { setJoinTab({ tab_id: data.tab_id, opened_name: data.opened_name }); return; }
          if (!data || !data.ok) throw new Error('No se pudo abrir la cuenta. Intenta de nuevo.');
          tab = data.tab;
        }
        setActiveTab(tab);
      }
      // la cuenta se cobra en la moneda principal, con los precios normales
      const groups = new Map();
      lines.forEach((l) => { const who = personOf(l); if (!groups.has(who)) groups.set(who, []); groups.get(who).push(l); });
      for (const [who, group] of groups) {
        const items = group.map((l) => ({ id: l.id, name: l.name, price: linePriceFor(l, currencies[0]), qty: l.qty, notes: l.notes || '', options: l.options || [] }));
        const subtotal = items.reduce((sum, l) => sum + l.qty * l.price, 0);
        const { error } = await sb.rpc('tab_add_order', {
          tab_input: tab.id,
          code_input: tab.code,
          order_input: { customer_name: who, items, subtotal, tax_amount: Math.round((subtotal * taxPercent) / 100), push_ref: profile ? null : getGuestPushRef() },
        });
        if (error) throw error;
        group.forEach((l) => removeItem(l.lineKey)); // lo enviado ya no se repite si algo falla después
      }
      clear();
      setJoinTab(null);
      setJoinCode('');
      setSentToTab(true);
    } catch (e) {
      const msg = e.message || '';
      setPlaceError(/cerrada/i.test(msg) ? 'Esta cuenta ya está cerrada. Abre una nueva desde el QR de tu mesa.'
        : /tab_open|tab_add_order|schema cache/i.test(msg) ? 'Las cuentas abiertas todavía no están disponibles en este restaurante.'
        : msg);
    } finally {
      setPlacing(false);
    }
  }

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

    // Precios con los que se cobra: los de la moneda elegida (con su precio especial si lo hay).
    // La gift card siempre se cobra en la moneda principal, con los precios normales.
    const payCurrency = method === 'gift_card' ? currencies[0] : currency;
    const payLines = lines.map((l) => ({ ...l, price: linePriceFor(l, payCurrency) }));
    const paySubtotal = payLines.reduce((s, l) => s + l.qty * l.price, 0);

    // Se intenta el Early Bird ANTES de cobrar, para que si gana y el premio
    // aplica, el descuento ya esté restado del total antes de procesar el pago.
    let ebOutcome = null;
    let ebPrizeDescription = 'una bebida gratis';
    let ebDiscountApplied = false;
    // El código promocional se descuenta primero; se canjea más abajo, justo antes de cobrar.
    const promoAmount = appliedPromo ? promoDiscount(appliedPromo, payLines, paySubtotal).amount : 0;
    let finalSubtotal = paySubtotal - promoAmount;

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
            const beverageLines = payLines.filter((l) => l.is_beverage);
            if (beverageLines.length) {
              prizeLine = beverageLines.reduce((cheapest, l) => (l.price < cheapest.price ? l : cheapest), beverageLines[0]);
            }
          } else if (ebData.prize_item_id) {
            prizeLine = payLines.find((l) => l.id === ebData.prize_item_id) || null;
          }
          if (prizeLine) {
            finalSubtotal = Math.max(0, finalSubtotal - prizeLine.price);
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

    // Canjear el código gasta un uso: se hace después de revisar todo lo demás y antes de cobrar.
    if (appliedPromo && BARRO_CONFIGURED) {
      const { data: promoRes, error: promoErr } = await sb.rpc('redeem_promo_code', { code_input: appliedPromo.code, subtotal_input: paySubtotal });
      if (promoErr || !promoRes || !promoRes.ok) {
        setPlaceError(promoErr ? promoErr.message : `${promoError(promoRes)} Quítalo para continuar.`);
        setPlacing(false);
        return;
      }
    }

    if (method === 'gift_card' && BARRO_CONFIGURED) {
      const { error: payError } = await sb.rpc('pay_with_gift_card', { amount_input: finalTotal });
      if (payError) { setPlaceError(payError.message.replace('exception: ', '')); setPlacing(false); return; }
    }

    // Sin cuenta, el pedido lleva un id generado aquí para poder seguirlo luego en Pedidos.
    const orderId = profile ? null : newOrderId();
    const payload = {
      ...(orderId ? { id: orderId, push_ref: getGuestPushRef() } : {}), // push_ref: a qué aparato avisar (invitado)
      customer_name: effectiveName.trim(),
      table_number: orderType === 'pickup' ? 'Pick up' : tableNumber,
      items: payLines.map((l) => ({ id: l.id, name: l.name, price: l.price, qty: l.qty, notes: l.notes || '', options: l.options || [] })),
      subtotal: finalSubtotal,
      tax_amount: finalTaxAmount,
      payment_method: method,
      user_id: profile ? profile.id : null,
      branch,
      customer_gender: effectiveGender || null,
      customer_age: effectiveAge || null,
      party_size: orderType === 'dine_in' ? partySize : 1,
      ...(appliedPromo ? { promo: { code_id: appliedPromo.id, code: appliedPromo.code, kind: appliedPromo.kind, discount: promoAmount } } : {}),
    };
    // Pago en otra moneda: se guarda con el tipo de cambio y el total convertido para que el local sepa cuánto cobrar.
    // La gift card siempre se descuenta en la moneda principal.
    const paidCurrency = method === 'gift_card' || currency.base ? null : currency;
    if (paidCurrency) {
      payload.payment_currency = {
        code: paidCurrency.code, name: paidCurrency.name, symbol: paidCurrency.symbol, position: paidCurrency.position,
        rate: paidCurrency.rate, source: paidCurrency.source, total: convertFromBase(finalTotal, paidCurrency),
      };
    }

    if (BARRO_CONFIGURED) {
      let sent = payload;
      let { error } = await sb.from('orders').insert(sent);
      // si la base de datos aún no tiene alguna columna opcional (falta aplicar su migración), el pedido se envía sin ella
      for (const col of ['push_ref', 'payment_currency', 'promo']) {
        if (error && sent[col] !== undefined && new RegExp(col, 'i').test(error.message || '')) {
          sent = { ...sent };
          delete sent[col];
          ({ error } = await sb.from('orders').insert(sent));
        }
      }
      if (error) { setPlaceError('No se pudo enviar el pedido: ' + error.message); setPlacing(false); return; }
      if (orderId) rememberGuestOrder(orderId);
      kickEcf(); // su factura electrónica sale a la DGII
    }

    if (ebOutcome === 'winner' || ebOutcome === 'in_window_no_win') {
      setEarlyBirdResult({ type: ebOutcome, prize: ebPrizeDescription, discountApplied: ebDiscountApplied });
    }

    if (method === 'gift_card') await refreshProfile();

    const effectivePartySize = orderType === 'dine_in' ? partySize : 1;

    setPlacing(false);
    setSuccess(true);
    const promoMessage = appliedPromo ? { code: appliedPromo.code, text: appliedPromo.message || '' } : null;
    setLastOrderSummary({ orderType, tableNumber, partySize: effectivePartySize, total: finalTotal, currency: paidCurrency, promo: promoMessage });
    clear();
    setAppliedPromo(null);
    setPromoMsg('');
    setOrderType(null);
    setPartySize(1);
    if (!ebOutcome && effectivePartySize <= 1 && !(promoMessage && promoMessage.text)) {
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

  // Pasos del carrito: cada pantalla pide una sola cosa. Con cuenta abierta: productos → quiénes.
  // Si no: productos → cómo lo quieres → (mesa) → quiénes (cuenta nueva) o pago.
  const steps = activeTab
    ? ['items', 'people']
    : ['items', 'how', ...(orderType === 'dine_in' ? ['table'] : []), tabFlow ? 'people' : 'pay'];
  const stepIdx = Math.max(0, steps.indexOf(step));
  const current = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;
  function goTo(next, d = 1) { setPlaceError(''); setDir(d); setStep(next); }
  function back() { if (stepIdx > 0) goTo(steps[stepIdx - 1], -1); }
  function chooseHow(type) {
    setOrderType(type);
    goTo(type === 'dine_in' ? 'table' : 'pay');
  }
  function next() {
    if (current === 'table' && !tableNumber) { setPlaceError('Toca tu mesa para seguir.'); return; }
    if (!isLast) { goTo(steps[stepIdx + 1]); return; }
    if (tabFlow) handleSendToTab(); else handlePay(payMethod);
  }

  const STEP_TITLE = {
    items: 'Tu pedido',
    how: '¿Cómo lo quieres?',
    table: '¿En qué mesa estás?',
    people: activeTab ? '¿Para quién es?' : '¿Quiénes están?',
    pay: '¿Cómo pagas?',
  };
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);
  const tabTotal = lines.reduce((sum, l) => sum + l.qty * linePriceFor(l, currencies[0]), 0);
  const ctaLabel = current === 'items' && !isLast ? 'Continuar'
    : !isLast ? 'Continuar'
    : tabFlow ? (activeTab ? 'Enviar a la cocina' : joinTab ? 'Unirme y enviar' : 'Abrir cuenta y enviar')
    : payMethod === 'gift_card' ? 'Pagar con gift card' : 'Confirmar pedido';
  const balance = profile ? Number(profile.gift_card_balance || 0) : 0;
  const done = sentToTab || success;
  const reduce = useReducedMotion();
  const slide = {
    enter: (d) => ({ opacity: 0, x: reduce ? 0 : d * 44 }),
    center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.22, 0.61, 0.36, 1], staggerChildren: 0.045, delayChildren: 0.05 } },
    exit: (d) => ({ opacity: 0, x: reduce ? 0 : d * -44, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }),
  };
  const rise = { enter: { opacity: 0, y: reduce ? 0 : 12 }, center: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 0.61, 0.36, 1] } }, exit: { opacity: 1 } };

  const nameField = (
    <TextField id="cartName" label="Tu nombre" value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={60} autoComplete="given-name" />
  );

  return (
    <AnimatePresence>
      {drawerOpen && (
        <motion.div
          className="overlay show cart-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            className={`cart-sheet${!done && lines.length ? ' is-steps' : ''}`}
            role="dialog" aria-modal="true" aria-label="Tu pedido"
            initial={isWide ? { x: '110%' } : { y: '100%' }} animate={isWide ? { x: 0 } : { y: 0 }} exit={isWide ? { x: '110%' } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          >
            {done ? (
              <div className="cart-scroll cart-done">
                {sentToTab ? (
              <div className="order-success">
                <motion.div className="order-check" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}>
                  <motion.svg viewBox="0 0 24 24" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.25 }}><path d="M5 13l4 4L19 7" /></motion.svg>
                </motion.div>
                <motion.h3 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>¡Va para la cocina!</motion.h3>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>Se sumó a la cuenta de {activeTab ? activeTab.table_label : 'tu mesa'}.</motion.p>
                <Link href="/mi-mesa" className="btn btn-amber btn-block" style={{ marginTop: 18 }} onClick={() => { setSentToTab(false); closeDrawer(); }}>Ver mi cuenta</Link>
                <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => { setSentToTab(false); closeDrawer(); }}>Seguir viendo el menú</button>
              </div>
            ) : success ? (
              earlyBirdResult ? (
                <>
                {lastOrderSummary?.promo?.text && <PromoRedeemed promo={lastOrderSummary.promo} />}
                <EarlyBirdResult
                  type={earlyBirdResult.type}
                  prize={earlyBirdResult.prize}
                  discountApplied={earlyBirdResult.discountApplied}
                  onClose={handleEarlyBirdClose}
                />
                </>
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
                {loyalty.enabled && (
                  <motion.p className="order-success-stamp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                    {profile ? `Sumarás un sello en tu ${loyalty.title.toLowerCase()} cuando el local confirme tu pedido.` : 'Crea una cuenta para juntar sellos con tus pedidos.'}
                  </motion.p>
                )}
                {lastOrderSummary?.currency && (
                  <motion.p className="order-success-currency" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                    Vas a pagar <b>{formatIn(convertFromBase(lastOrderSummary.total, lastOrderSummary.currency), lastOrderSummary.currency)}</b> ({money(lastOrderSummary.total)})
                  </motion.p>
                )}
                {lastOrderSummary?.promo?.text && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}>
                    <PromoRedeemed promo={lastOrderSummary.promo} />
                    {!(lastOrderSummary.partySize > 1) && (
                      <button type="button" className="btn btn-amber btn-block" style={{ marginTop: 16 }} onClick={() => { setSuccess(false); closeDrawer(); }}>Listo</button>
                    )}
                  </motion.div>
                )}
                {lastOrderSummary?.partySize > 1 && (
                  <motion.div
                    className="split-bill-box"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
                  >
                    <span className="eyebrow">Cuenta dividida entre {lastOrderSummary.partySize}</span>
                    <div className="split-bill-row">
                      <span>{formatIn(convertFromBase(lastOrderSummary.total, lastOrderSummary.currency), lastOrderSummary.currency)} ÷ {lastOrderSummary.partySize} personas</span>
                      <span className="split-bill-each">
                        {lastOrderSummary.currency
                          ? formatIn(Math.round((convertFromBase(lastOrderSummary.total, lastOrderSummary.currency) / lastOrderSummary.partySize) * 100) / 100, lastOrderSummary.currency)
                          : money(Math.round(lastOrderSummary.total / lastOrderSummary.partySize))} c/u
                      </span>
                    </div>
                    <button type="button" className="btn btn-amber btn-block" style={{ marginTop: 16 }} onClick={() => { setSuccess(false); closeDrawer(); }}>Listo</button>
                  </motion.div>
                )}
              </div>
              )) : null}
              </div>
            ) : (
              <>
                <div className="cart-head">
                  {stepIdx > 0 ? (
                    <button type="button" className="cart-x cart-back" onClick={back} aria-label="Atrás">
                      <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
                    </button>
                  ) : <span className="cart-head-gap" />}
                  <div className="cart-head-title">
                    <p className="eyebrow">{lines.length === 0 ? (branchInfo ? branchInfo.full : 'Tu pedido') : activeTab ? `${activeTab.table_label} · paso ${stepIdx + 1} de ${steps.length}` : `Paso ${stepIdx + 1} de ${steps.length}`}</p>
                    <h3>{STEP_TITLE[current]}{current === 'items' && itemCount > 0 && <span className="cart-count">{itemCount}</span>}</h3>
                  </div>
                  <button type="button" className="cart-x" onClick={handleClose} aria-label="Cerrar">
                    <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </div>
                {lines.length > 0 && (
                  <div className="cart-progress" aria-hidden="true">
                    {steps.map((st, i) => <span key={st} className={i <= stepIdx ? 'on' : ''} />)}
                  </div>
                )}

                {lines.length === 0 ? (
                  <div className="cart-scroll cart-empty">
                    <span className="cart-empty-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M5 7h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 7Z" /><path d="M9 7V6a3 3 0 0 1 6 0v1" /></svg>
                    </span>
                    <h4>Todavía no hay nada aquí</h4>
                    <p>Lo que agregues desde el menú aparece en este pedido.</p>
                    <Link href="/menu" className="btn btn-amber" onClick={closeDrawer}>Ver el menú</Link>
                  </div>
                ) : (
                  <>
                    <div className="cart-stage">
                      <AnimatePresence mode="wait" custom={dir} initial={false}>
                        <motion.div key={current} className="cart-scroll" custom={dir} variants={slide} initial="enter" animate="center" exit="exit">

                          {current === 'items' && (
                            <ul className="cart-items">
                              {lines.map((l) => {
                                const unit = tabFlow ? linePriceFor(l, currencies[0]) : linePriceFor(l, currency);
                                const fmt = tabFlow ? money : inCurrency;
                                const noteOpen = noteKey === l.lineKey;
                                return (
                                  <motion.li key={l.lineKey} className="ci" variants={rise}>
                                    <div className={`ci-thumb${l.image_url ? '' : ' is-empty'}`} aria-hidden="true">
                                      {l.image_url ? <img src={l.image_url} alt="" /> : <span>{(l.name || '?').trim().charAt(0)}</span>}
                                    </div>
                                    <div className="ci-main">
                                      <div className="ci-top">
                                        <h4>{l.name}</h4>
                                        <b className="ci-price">{fmt(unit * l.qty)}</b>
                                      </div>
                                      {l.options && l.options.length > 0 && <p className="ci-opts">{describeOptions(l.options)}</p>}
                                      {l.qty > 1 && <p className="ci-each">{fmt(unit)} c/u</p>}
                                      {noteOpen ? (
                                        <TextField
                                          id={`note-${l.lineKey}`} label="Nota para la cocina" small autoFocus maxLength={140}
                                          value={l.notes || ''}
                                          onChange={(e) => setNotes(l.lineKey, e.target.value)}
                                          onBlur={() => setNoteKey(null)}
                                          onKeyDown={(e) => { if (e.key === 'Enter') setNoteKey(null); }}
                                        />
                                      ) : l.notes ? (
                                        <button type="button" className="ci-note" onClick={() => setNoteKey(l.lineKey)}>“{l.notes}”</button>
                                      ) : null}
                                      <div className="ci-bottom">
                                        <div className="ci-step">
                                          <button type="button" onClick={() => setQty(l.lineKey, l.qty - 1)} aria-label={l.qty === 1 ? `Quitar ${l.name}` : 'Uno menos'}>
                                            {l.qty === 1
                                              ? <svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>
                                              : <svg viewBox="0 0 24 24"><path d="M6 12h12" /></svg>}
                                          </button>
                                          <span aria-live="polite">{l.qty}</span>
                                          <button type="button" onClick={() => setQty(l.lineKey, l.qty + 1)} aria-label="Uno más">
                                            <svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12" /></svg>
                                          </button>
                                        </div>
                                        {!noteOpen && !l.notes && <button type="button" className="ci-link" onClick={() => setNoteKey(l.lineKey)}>Nota</button>}
                                      </div>
                                    </div>
                                  </motion.li>
                                );
                              })}
                              <motion.li className="ci-clear" variants={rise}><button type="button" className="ci-link" onClick={clear}>Vaciar el pedido</button></motion.li>
                            </ul>
                          )}

                          {current === 'how' && (
                            <div className="cart-choices">
                              <motion.button variants={rise} type="button" className={`cart-choice${orderType === 'dine_in' ? ' on' : ''}`} onClick={() => chooseHow('dine_in')}>
                                <span className="cart-choice-icon"><svg viewBox="0 0 24 24"><path d="M3 10h18M6 10v9M18 10v9M8 10V6h8v4" /></svg></span>
                                <b>Comer aquí</b>
                                <svg className="cart-choice-go" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
                              </motion.button>
                              <motion.button variants={rise} type="button" className={`cart-choice${orderType === 'pickup' ? ' on' : ''}`} onClick={() => chooseHow('pickup')}>
                                <span className="cart-choice-icon"><svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></svg></span>
                                <b>Para llevar</b>
                                <svg className="cart-choice-go" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
                              </motion.button>
                            </div>
                          )}

                          {current === 'table' && (
                            <>
                              <motion.div variants={rise} className="cart-tables" role="radiogroup" aria-label="Mesa">
                                {tables.map((t) => (
                                  <button key={t.id} type="button" role="radio" aria-checked={tableNumber === t.label}
                                    className={`cart-table${tableNumber === t.label ? ' on' : ''}`}
                                    onClick={() => { setTableNumber(t.label); setJoinTab(null); setJoinCode(''); setPlaceError(''); }}>
                                    <b>{t.label}</b>
                                    {tableNumber === t.label && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>}
                                  </button>
                                ))}
                              </motion.div>
                              <motion.div variants={rise} className="cart-row">
                                <span className="cart-row-label">Personas</span>
                                <div className="ci-step is-big">
                                  <button type="button" onClick={() => setPartySize((n) => Math.max(1, n - 1))} aria-label="Menos"><svg viewBox="0 0 24 24"><path d="M6 12h12" /></svg></button>
                                  <span>{partySize}</span>
                                  <button type="button" onClick={() => setPartySize((n) => Math.min(20, n + 1))} aria-label="Más"><svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12" /></svg></button>
                                </div>
                              </motion.div>
                              {realTables && (
                                <motion.div variants={rise} className="cart-row is-col">
                                  <span className="cart-row-label">¿Cuándo pagas?</span>
                                  <div className="cart-seg" role="radiogroup" aria-label="Cuándo pagas">
                                    <button type="button" role="radio" aria-checked={payLater} className={payLater ? 'on' : ''} onClick={() => setPayLater(true)}>Al final</button>
                                    <button type="button" role="radio" aria-checked={!payLater} className={!payLater ? 'on' : ''} onClick={() => { setPayLater(false); setJoinTab(null); }}>Ahora</button>
                                  </div>
                                </motion.div>
                              )}
                            </>
                          )}

                          {current === 'people' && (
                            <>
                              {activeTab && (
                                <motion.div variants={rise} className="cart-tabcard">
                                  <div>
                                    <b>{activeTab.table_label}</b>
                                    <span>Se suma a tu cuenta. Pagas al final.</span>
                                  </div>
                                  <button type="button" className="cart-tabcode" onClick={shareCode} aria-label="Compartir el código con la mesa">
                                    <small>Código</small>
                                    <b>{activeTab.code}</b>
                                    <small>Compartir</small>
                                  </button>
                                </motion.div>
                              )}
                              {joinTab && !activeTab && (
                                <motion.div variants={rise} className="cart-join">
                                  <p>{tableNumber} ya tiene una cuenta abierta{joinTab.opened_name ? ` a nombre de ${joinTab.opened_name}` : ''}. Pídele el código para unirte.</p>
                                  <input className="cart-code-input" type="text" autoCapitalize="characters" maxLength={6} placeholder="CÓDIGO" aria-label="Código de la cuenta" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} />
                                </motion.div>
                              )}
                              <motion.div variants={rise}>{nameField}</motion.div>
                              <motion.div variants={rise} className="cart-people">
                                {people.map((p) => (
                                  <span key={p} className="cart-person">
                                    {p}
                                    {companions.includes(p) && <button type="button" onClick={() => setCompanions((c) => c.filter((x) => x !== p))} aria-label={`Quitar a ${p}`}>×</button>}
                                  </span>
                                ))}
                                <span className="cart-person-add">
                                  <input type="text" placeholder="Agregar persona" aria-label="Agregar a alguien de la mesa" maxLength={30} value={newCompanion}
                                    onChange={(e) => setNewCompanion(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCompanion(); } }} />
                                  <button type="button" onClick={addCompanion} disabled={!newCompanion.trim()} aria-label="Agregar">
                                    <svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12" /></svg>
                                  </button>
                                </span>
                              </motion.div>
                              {people.length > 1 && (
                                <motion.ul variants={rise} className="cart-assign">
                                  {lines.map((l) => (
                                    <li key={l.lineKey}>
                                      <span>{l.qty > 1 ? `${l.qty}× ` : ''}{l.name}</span>
                                      <label className="ci-for">
                                        <select value={personOf(l)} onChange={(e) => setPerson(l.lineKey, e.target.value)} aria-label={`Para quién es ${l.name}`}>
                                          {people.map((p) => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                      </label>
                                    </li>
                                  ))}
                                </motion.ul>
                              )}
                            </>
                          )}

                          {current === 'pay' && (
                            <>
                              <motion.div variants={rise}>{nameField}</motion.div>
                              <motion.div variants={rise} className="cart-pay" role="radiogroup" aria-label="Cómo pagas">
                                {PAYMENT_METHODS.map((m) => (
                                  <button key={m.id} type="button" role="radio" aria-checked={payMethod === m.id} className={payMethod === m.id ? 'on' : ''} onClick={() => setPayMethod(m.id)}>
                                    <span>{m.label}</span>
                                    {m.id === 'gift_card' && profile && <small>{money(balance)}</small>}
                                  </button>
                                ))}
                              </motion.div>
                              <motion.p variants={rise} className="cart-hint">{payMethod === 'gift_card' ? 'Se descuenta de tu balance al confirmar.' : 'Se cobra en el local. Aquí solo nos avisas.'}</motion.p>
                              <motion.div variants={rise}><CurrencySwitcher label="Pagar en" idSuffix="cart" className="cart-currency" /></motion.div>
                              <motion.div variants={rise}>
                                {appliedPromo ? (
                                  <div className="promo-applied">
                                    <span className="promo-applied-icon" aria-hidden="true">
                                      <svg viewBox="0 0 24 24"><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z" /><circle cx="8" cy="8" r="1.6" /></svg>
                                    </span>
                                    <span className="promo-applied-text">
                                      <b>{appliedPromo.code}</b>
                                      <span>{viewPromo.missingItem ? 'Agrega el producto del código a tu pedido' : promoSummary(appliedPromo, (lines.find((l) => l.id === appliedPromo.item_id) || {}).name)}</span>
                                    </span>
                                    <button type="button" className="promo-applied-remove" onClick={removePromo} aria-label="Quitar código">
                                      <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                                    </button>
                                  </div>
                                ) : showPromo ? (
                                  <form className="cart-promo" onSubmit={(e) => { e.preventDefault(); applyPromo(); }}>
                                    <TextField id="cartPromo" label="Código promocional" autoFocus value={promo} onChange={(e) => { setPromo(e.target.value.toUpperCase()); setPromoMsg(''); }} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
                                    <button type="submit" disabled={promoBusy || !promo.trim()}>{promoBusy ? '…' : 'Aplicar'}</button>
                                  </form>
                                ) : (
                                  <button type="button" className="ci-link" onClick={() => setShowPromo(true)}>¿Tienes un código promocional?</button>
                                )}
                                {promoMsg && <p className="promo-msg">{promoMsg}</p>}
                              </motion.div>
                              <motion.div variants={rise} className="cart-break">
                                <div><span>Subtotal</span><span>{inCurrency(viewSubtotal)}</span></div>
                                {viewPromo.amount > 0 && <div className="is-discount"><span>Código {appliedPromo.code}</span><span>−{inCurrency(viewPromo.amount)}</span></div>}
                                {taxCharges.map((c, i) => (
                                  <div key={i}><span>{c.label} ({c.percent}%)</span><span>{inCurrency(Math.round((taxBase * (Number(c.percent) || 0)) / 100))}</span></div>
                                ))}
                                {!currency.base && <div><span>1 {currency.symbol} = {money(currency.rate)}</span><span>Equivale a {money(total)}</span></div>}
                              </motion.div>
                            </>
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    <div className="cart-foot">
                      <div className="cart-sum">
                        <span className="cart-sum-label">
                          {tabFlow ? 'Este pedido' : current === 'pay' ? 'Total' : 'Subtotal'}
                          <small>{tabFlow ? 'Impuestos al cerrar la cuenta' : current === 'pay' ? `Con ${taxCharges.map((c) => c.label).join(' y ') || 'impuestos'}` : `${itemCount} ${itemCount === 1 ? 'producto' : 'productos'}`}</small>
                        </span>
                        <b className="cart-sum-total">{tabFlow ? money(tabTotal) : current === 'pay' ? inCurrency(total) : inCurrency(viewSubtotal)}</b>
                      </div>
                      {placeError && <div className="form-msg show error">{placeError}</div>}
                      {current !== 'how' && (
                        <button
                          type="button" className="cart-cta"
                          onClick={next}
                          disabled={placing || (isLast && tabFlow && joinTab && !activeTab && joinCode.trim().length < 4)}
                        >
                          <span>{placing ? 'Enviando…' : ctaLabel}</span>
                          {!placing && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
                        </button>
                      )}
                      {activeTab && current === 'items' && <Link href="/mi-mesa" className="cart-foot-link" onClick={closeDrawer}>Ver mi cuenta</Link>}
                    </div>
                  </>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Caja de texto con la etiqueta adentro: sube cuando escribes o tocas la caja.
function TextField({ id, label, small, value, ...rest }) {
  return (
    <div className={`tfield${small ? ' is-small' : ''}`}>
      <input id={id} placeholder=" " value={value} {...rest} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

// El mensaje que el dueño escribió para cuando se canjea el código.
function PromoRedeemed({ promo }) {
  return (
    <div className="promo-redeemed">
      <span className="promo-redeemed-code">{promo.code}</span>
      <p>{promo.text}</p>
    </div>
  );
}
