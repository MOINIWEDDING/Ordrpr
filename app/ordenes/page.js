'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useOrdersNotify } from '@/context/OrdersNotifyContext';
import { useBranch } from '@/context/BranchContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { formatIn } from '@/lib/settingsDefaults';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { sendOrderPush, orderPushNotice } from '@/lib/push';

const STATUS_LABELS = {
  nueva: 'Nueva',
  en_preparacion: 'En preparación',
  lista: 'Lista',
  entregada: 'Entregada',
};
const STATUS_ORDER = ['nueva', 'en_preparacion', 'lista', 'entregada'];
const PAY_LABELS = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  gift_card: 'Tarjeta de regalo',
  dividido: 'Dividida entre varios',
};

function timeAgo(dateStr) {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  return `hace ${hrs} h`;
}

export default function OrdenesPage() {
  const { profile, isStaff, isComensal } = useAuth();
  const { markSeen } = useOrdersNotify();
  const { branchInfo } = useBranch();
  const router = useRouter();
  const [tab, setTab] = useState('pedidos'); // 'pedidos' | 'giftcards'

  useEffect(() => {
    if (profile && !isStaff && !isComensal) router.push('/');
  }, [profile, isStaff, isComensal, router]);

  useEffect(() => { markSeen(); }, [markSeen]);

  if (!profile || (!isStaff && !isComensal)) return null;

  return (
    <section className="ordenes-page">
      <div className="wrap">
        <div className="section-head" style={{ marginBottom: 20 }}>
          <p className="eyebrow">Panel del dueño</p>
          <h2 style={{ fontSize: 24 }}>Órdenes</h2>
          <p>{branchInfo ? `Mostrando ${branchInfo.full}.` : 'Los pedidos y las gift cards llegan aquí en tiempo real, con sonido incluido.'}</p>
        </div>

        <div className="tabs" style={{ marginBottom: 26 }}>
          <button type="button" className={`tab${tab === 'pedidos' ? ' active' : ''}`} onClick={() => setTab('pedidos')}>Pedidos</button>
          <button type="button" className={`tab${tab === 'giftcards' ? ' active' : ''}`} onClick={() => setTab('giftcards')}>Gift Cards</button>
        </div>

        {tab === 'pedidos' ? <OrdersList /> : <GiftCardsList />}
      </div>
    </section>
  );
}

function OrdersList() {
  const { branch } = useBranch();
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setOrders([]); setLoading(false); return; }
    let query = sb.from('orders').select('*').order('created_at', { ascending: false });
    if (branch) query = query.eq('branch', branch);
    const { data, error } = await query;
    setOrders(!error && data ? data : []);
    setLoading(false);
  }, [branch]);

  useEffect(() => {
    load();
    if (!BARRO_CONFIGURED) return undefined;
    const channel = sb
      .channel('orders-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [load]);

  async function updateStatus(id, status) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('orders').update({ status }).eq('id', id);
      if (!error && status !== 'nueva') {
        // aviso al teléfono del cliente (si lo activó); el dueño ve qué pasó
        sendOrderPush(id).then((res) => { const note = orderPushNotice(res); if (note) showToast(note); });
      }
    }
  }

  async function handleDelete(id) {
    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('orders').delete().eq('id', id);
      if (error) { alert('No se pudo eliminar: ' + error.message); setDeletingId(null); return; }
    }
    setDeletingId(null);
    setOrders((prev) => prev.filter((o) => o.id !== id));
  }

  if (loading) return null;
  if (orders.length === 0) return <p className="empty-note">Todavía no hay pedidos.</p>;

  return (
    <div className="orders-list">
      {orders.map((order) => (
        <motion.div
          key={order.id}
          className="order-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <button type="button" className="order-delete-btn" aria-label="Eliminar pedido" onClick={() => setDeletingId(order.id)}>
            <svg className="icon" style={{ width: 14, height: 14 }} viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
          </button>

          {deletingId === order.id && (
            <div className="order-confirm-del">
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>¿Eliminar este pedido de {order.customer_name}?</span>
              <span className="muted" style={{ fontSize: 12 }}>También desaparece de "Tus pedidos" en su cuenta.</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-amber btn-sm" style={{ background: 'var(--err)' }} onClick={() => handleDelete(order.id)}>Sí, eliminar</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeletingId(null)}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="order-card-top">
            <div>
              <h4>{order.customer_name}</h4>
              <span className="order-meta">{order.table_number} · {timeAgo(order.created_at)}</span>
            </div>
            <span className="order-price">{money(order.subtotal + (order.tax_amount || 0))}</span>
          </div>

          <ul className="order-items">
            {(order.items || []).map((it, i) => (
              <li key={i}>
                <span>{it.qty}× {it.name}</span>
                {it.notes && <span className="order-item-note">— {it.notes}</span>}
              </li>
            ))}
          </ul>
          {order.party_size > 1 && (
            <div className="split-bill-note">
              <span className="eyebrow">Dividida entre {order.party_size}</span>
              {(order.payment_breakdown || []).map((b) => (
                <div className="split-bill-note-row" key={b.person}>
                  <span>Persona {b.person} · {PAY_LABELS[b.method] || b.method}</span>
                  <span>{money(b.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="order-card-bottom">
            <span className="order-pay">{PAY_LABELS[order.payment_method] || order.payment_method}{order.payment_currency ? ` · ${formatIn(order.payment_currency.total, order.payment_currency)}` : ''}</span>
            <select
              className="order-status"
              value={order.status}
              onChange={(e) => updateStatus(order.id, e.target.value)}
            >
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function GiftCardsList() {
  const { settings } = useSettings();
  const { showToast } = useToast();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setCards([]); setLoading(false); return; }
    const { data, error } = await sb.from('gift_cards').select('*').order('created_at', { ascending: false });
    setCards(!error && data ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (!BARRO_CONFIGURED) return undefined;
    const channel = sb
      .channel('gift-cards-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gift_cards' }, () => load())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [load]);

  async function confirmPayment(gc) {
    const { error } = await sb.from('gift_cards').update({ status: 'activa' }).eq('id', gc.id).eq('status', 'pendiente');
    if (error) { showToast('No se pudo activar: ' + error.message); return; }
    showToast('Gift card activada. Ya se puede canjear.');
    load();
  }

  if (loading) return null;
  if (cards.length === 0) return <p className="empty-note">Todavía no se ha comprado ninguna gift card.</p>;

  return (
    <div className="orders-list">
      {cards.map((gc) => (
        <motion.div
          key={gc.id}
          className="order-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="order-card-top">
            <div>
              <h4>{gc.is_gift ? `${settings.brand_name.toUpperCase()} REGALÓ UNA GIFT CARD` : (gc.buyer_name || 'Cliente')}</h4>
              <span className="order-meta">
                {gc.is_gift ? `a ${gc.recipient_email}` : gc.code} · {timeAgo(gc.created_at)}
              </span>
            </div>
            <span className="order-price">{money(gc.amount)}</span>
          </div>
          <div className="order-card-bottom" style={{ marginTop: 12, paddingTop: 12 }}>
            <span className="order-pay">
              {gc.status === 'canjeada' && gc.redeemed_by_name ? `Canjeada por ${gc.redeemed_by_name}` : gc.status === 'pendiente' ? 'Esperando que cobres el pago' : 'Todavía sin canjear'}
            </span>
            {gc.status === 'pendiente' ? (
              <button type="button" className="pill-btn-dark" onClick={() => confirmPayment(gc)}>Confirmar pago y activar</button>
            ) : (
              <span className={`giftcard-item-status${gc.status === 'activa' ? ' active' : ''}`} style={{ margin: 0 }}>
                {gc.status === 'activa' ? 'Activa' : 'Canjeada'}
              </span>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
