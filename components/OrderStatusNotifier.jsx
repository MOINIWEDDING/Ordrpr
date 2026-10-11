'use client';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { playNotificationSound } from '@/lib/notificationSound';

const STATUS_LABELS = {
  nueva: 'está registrado como nueva',
  en_preparacion: 'está en preparación',
  lista: 'ya está lista',
  entregada: 'fue entregado',
};

export default function OrderStatusNotifier() {
  const { profile, isStaff } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (!profile || isStaff || !BARRO_CONFIGURED) return undefined;

    const channel = sb
      .channel(`my-order-status-${profile.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders',
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        const before = payload.old;
        const after = payload.new;
        if (before.status === after.status) return;
        playNotificationSound();
        const label = STATUS_LABELS[after.status] || after.status;
        showToast(`Tu pedido de ${after.table_number} ${label}`);
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [profile, isStaff, showToast]);

  return null;
}
