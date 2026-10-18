'use client';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { playNotificationSound } from '@/lib/notificationSound';
import { orderNotice } from '@/lib/orderMessages';
import { getGuestOrderIds, keepGuestOrders } from '@/lib/guestOrders';

const GUEST_POLL_MS = 8000;

// Avisa al cliente cuando el local cambia el estado de su pedido, con el mensaje que eligió el dueño
// (Cuenta → Avisos de pedidos). Con cuenta, llega en tiempo real; como invitado, se consulta cada pocos
// segundos mientras haya un pedido sin entregar.
export default function OrderStatusNotifier() {
  const { profile, isStaff, isComensal } = useAuth();
  const { showToast } = useToast();
  const { settings } = useSettings();

  // siempre lo último que configuró el dueño, sin reiniciar las suscripciones
  const cfg = useRef({ messages: settings.order_messages, brand: settings.brand_name });
  cfg.current = { messages: settings.order_messages, brand: settings.brand_name };
  const toastRef = useRef(showToast);
  toastRef.current = showToast;

  function announce(status, order) {
    const n = orderNotice(cfg.current.messages, status, order, cfg.current.brand);
    if (!n) return;
    if (n.sound) playNotificationSound();
    toastRef.current(n.text);
  }

  // Cliente con cuenta: tiempo real
  useEffect(() => {
    if (!profile || isStaff || isComensal || !BARRO_CONFIGURED) return undefined;
    const channel = sb
      .channel(`my-order-status-${profile.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders',
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        if (payload.old.status === payload.new.status) return;
        announce(payload.new.status, payload.new);
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, isStaff, isComensal]);

  // Invitado: consulta periódica de sus pedidos sin entregar
  useEffect(() => {
    if (profile || !BARRO_CONFIGURED) return undefined;
    const known = {}; // id -> { status, customer_name, table_number }
    let stopped = false;

    async function poll() {
      const ids = getGuestOrderIds();
      if (!ids.length) return;
      const { data, error } = await sb.rpc('guest_orders', { p_ids: ids });
      if (stopped || error || !Array.isArray(data)) return;
      const now = new Set(data.map((o) => o.id));
      data.forEach((o) => {
        const before = known[o.id];
        // la primera vez que se ve un pedido solo se recuerda su estado
        if (before && before.status !== o.status) announce(o.status, o);
        known[o.id] = { status: o.status, customer_name: o.customer_name, table_number: o.table_number };
      });
      // los que estaban y ya no vienen se entregaron
      Object.keys(known).forEach((id) => {
        if (!now.has(id)) { announce('entregada', known[id]); delete known[id]; }
      });
      keepGuestOrders(data.map((o) => o.id));
    }

    poll();
    const t = setInterval(poll, GUEST_POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  return null;
}
