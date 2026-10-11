'use client';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useOrdersNotify } from '@/context/OrdersNotifyContext';
import { useBranch } from '@/context/BranchContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { playNotificationSound } from '@/lib/notificationSound';
import { money } from '@/hooks/useMenuItems';

export default function OrderNotifier() {
  const { isStaff, isComensal } = useAuth();
  const { branch } = useBranch();
  const { showToast } = useToast();
  const { notifyNewOrder } = useOrdersNotify();

  useEffect(() => {
    if ((!isStaff && !isComensal) || !BARRO_CONFIGURED || !branch) return undefined;

    const channel = sb
      .channel(`orders-realtime-${branch}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `branch=eq.${branch}` }, (payload) => {
        const order = payload.new;
        if (order.branch !== branch) return; // por si acaso, filtro también del lado del cliente
        playNotificationSound();
        notifyNewOrder();
        showToast(`Nuevo pedido de ${order.customer_name} · Mesa ${order.table_number} · ${money(order.subtotal)}`);
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [isStaff, isComensal, branch, showToast, notifyNewOrder]);

  return null;
}
