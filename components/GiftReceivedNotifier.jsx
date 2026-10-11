'use client';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { playNotificationSound } from '@/lib/notificationSound';
import { money } from '@/hooks/useMenuItems';
import { useSettings } from '@/context/SettingsContext';

export default function GiftReceivedNotifier() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { settings } = useSettings();

  useEffect(() => {
    if (!profile || !profile.email || !BARRO_CONFIGURED) return undefined;

    const channel = sb
      .channel(`gift-received-${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'gift_cards',
        filter: `recipient_email=eq.${profile.email}`,
      }, (payload) => {
        const gc = payload.new;
        if (!gc.is_gift) return;
        playNotificationSound();
        showToast(`🎁 ${settings.brand_name} te ha regalado una gift card de ${money(gc.amount)}`);
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [profile, showToast, settings.brand_name]);

  return null;
}
