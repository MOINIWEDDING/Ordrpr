'use client';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { playNotificationSound } from '@/lib/notificationSound';
import { money } from '@/hooks/useMenuItems';
import { useSettings } from '@/context/SettingsContext';

export default function GiftCardNotifier() {
  const { isStaff, isComensal } = useAuth();
  const { showToast } = useToast();
  const { settings } = useSettings();

  useEffect(() => {
    if ((!isStaff && !isComensal) || !BARRO_CONFIGURED) return undefined;

    const channel = sb
      .channel('gift-cards-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_cards' }, (payload) => {
        const gc = payload.new;
        playNotificationSound();
        if (gc.is_gift) {
          showToast(`🎁 ${settings.brand_name.toUpperCase()} REGALÓ UNA GIFT CARD de ${money(gc.amount)} a ${gc.recipient_email}`);
        } else {
          showToast(`${gc.buyer_name || 'Alguien'} compró una gift card de ${money(gc.amount)} 🎁`);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gift_cards' }, (payload) => {
        const gc = payload.new;
        const prev = payload.old;
        if (prev.status !== 'canjeada' && gc.status === 'canjeada') {
          playNotificationSound();
          showToast(`${gc.redeemed_by_name || 'Alguien'} canjeó una gift card de ${money(gc.amount)}`);
        }
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [isStaff, isComensal, showToast, settings.brand_name]);

  return null;
}
