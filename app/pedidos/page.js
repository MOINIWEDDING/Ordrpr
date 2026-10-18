'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { useBranch } from '@/context/BranchContext';
import AuthGate from '@/components/AuthGate';
import Reveal from '@/components/Reveal';
import BrandLogo from '@/components/BrandLogo';
import { getGuestOrderIds, keepGuestOrders } from '@/lib/guestOrders';

const ORDER_STATUS_LABELS = {
  nueva: 'Nueva',
  en_preparacion: 'En preparación',
  lista: 'Lista',
  entregada: 'Entregada',
};

const PAY_LABELS = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  gift_card: 'Tarjeta de regalo',
};

function timeAgo(dateStr) {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  return `hace ${hrs} h`;
}

export default function PedidosPage() {
  const { profile, isStaff } = useAuth();

  if (!profile) return <GuestOrders />;
  if (isStaff) return <StaffRedirectNote />;
  return <MyOrders profile={profile} />;
}

// Quien no ha iniciado sesión ve aquí los pedidos que hizo como invitado, y solo mientras no se
// hayan entregado (al entregarse desaparecen). Si no tiene ninguno activo, ve la pantalla de entrada.
function GuestOrders() {
  const [state, setState] = useState({ loading: true, orders: [] });

  const load = useCallback(async () => {
    const ids = getGuestOrderIds();
    if (!ids.length || !BARRO_CONFIGURED) { setState({ loading: false, orders: [] }); return; }
    const { data, error } = await sb.rpc('guest_orders', { p_ids: ids });
    if (error || !Array.isArray(data)) { setState((p) => ({ ...p, loading: false })); return; }
    keepGuestOrders(data.map((o) => o.id));
    setState({ loading: false, orders: data });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const { branches } = useBranch();
  const branchName = (id) => branches.find((b) => b.id === id)?.full || id;

  if (state.loading) return null;
  if (!state.orders.length) return <AuthGate />;

  return (
    <section className="cuenta-page">
      <div className="wrap">
        <Reveal className="section-head">
          <p className="eyebrow">Pedido en curso</p>
          <h2 style={{ fontSize: 24 }}>Tus pedidos</h2>
        </Reveal>
        <div className="orders-list" style={{ marginTop: 24 }}>
          {state.orders.map((order) => (
            <OrderCard key={order.id} order={order} branchName={branchName} />
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 18, textAlign: 'center' }}>
          Pediste como invitado. <Link href="/cuenta" style={{ textDecoration: 'underline' }}>Crea una cuenta</Link> para guardar tu historial de pedidos.
        </p>
      </div>
    </section>
  );
}

function OrderCard({ order, branchName }) {
  return (
    <div className="order-card">
      <BrandLogo alt="" className="card-logo-mark" />
      <div className="order-card-top">
        <div>
          <h4>{order.table_number}</h4>
          <span className="order-meta">{order.branch ? branchName(order.branch) : ''} · {timeAgo(order.created_at)}</span>
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
        <p className="muted" style={{ fontSize: 11.5, marginTop: -4, marginBottom: 10 }}>
          Dividida entre {order.party_size}: {money(Math.round((order.subtotal + (order.tax_amount || 0)) / order.party_size))} c/u
        </p>
      )}
      <div className="order-card-bottom">
        <span className="order-pay">{PAY_LABELS[order.payment_method] || order.payment_method}</span>
        <span className={`order-status-badge status-${order.status}`}>{ORDER_STATUS_LABELS[order.status] || order.status}</span>
      </div>
    </div>
  );
}

function StaffRedirectNote() {
  return (
    <section className="cuenta-page">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">Pedidos</p>
          <h2 style={{ fontSize: 22 }}>Como dueño, mira todos los pedidos en Órdenes</h2>
          <p>Esta pestaña muestra el historial personal de un cliente. Tú ya ves todos los pedidos del local ahí.</p>
        </div>
        <Link href="/ordenes" className="btn btn-amber btn-block" style={{ marginTop: 20 }}>Ir a Órdenes</Link>
      </div>
    </section>
  );
}

function MyOrders({ profile }) {
  const { branches } = useBranch();
  const branchName = (id) => branches.find((b) => b.id === id)?.full || id;
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setLoading(false); return; }
    const { data, error } = await sb.from('orders').select('*').eq('user_id', profile.id).order('created_at', { ascending: false });
    if (!error && data) setOrders(data);
    setLoading(false);
  }, [profile.id]);

  useEffect(() => {
    load();
    if (!BARRO_CONFIGURED) return undefined;
    const channel = sb
      .channel(`my-orders-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [load, profile.id]);

  return (
    <section className="cuenta-page">
      <div className="wrap">
        <Reveal className="section-head">
          <p className="eyebrow">Tu cuenta</p>
          <h2 style={{ fontSize: 24 }}>Tus pedidos</h2>
          <p>El estado se actualiza solo, en tiempo real, conforme el local lo va cambiando.</p>
        </Reveal>

        {loading ? null : orders.length === 0 ? (
          <p className="empty-note" style={{ marginTop: 20 }}>Todavía no has hecho ningún pedido.</p>
        ) : (
          <div className="orders-list" style={{ marginTop: 24 }}>
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} branchName={branchName} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
