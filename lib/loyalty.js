'use client';
import { useCallback, useEffect, useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { promoSummary } from '@/lib/promo';

// Pase de sellos (tabla loyalty_settings, ver la migración 20261020180000_pase_de_sellos.sql).

export const LOYALTY_DEFAULTS = {
  enabled: false,
  title: 'Pase de sellos',
  description: '',
  stamps_required: 8,
  reward_label: 'Un regalo de la casa',
  reward_kind: 'message',
  reward_value: 0,
  reward_item_id: null,
  reward_message: '',
  reward_days: null,
  min_subtotal: 0,
  max_per_day: 0,
  stamp_icon: 'star',
  stamp_image_url: '',
  logo_url: '',
  strip_image_url: '',
  bg_color: '#241C13',
  fg_color: '#FBF8F2',
  label_color: '#C9B79C',
  stamp_color: '#D5402C',
  terms: '',
};

// Una sola lectura por visita, compartida por la barra, la página del pase y el carrito.
let cache = null;
let inflight = null;
const listeners = new Set();

async function fetchSettings() {
  if (!BARRO_CONFIGURED) return { ...LOYALTY_DEFAULTS };
  const { data, error } = await sb.from('loyalty_settings').select('*').eq('id', 1).maybeSingle();
  if (error) return { ...LOYALTY_DEFAULTS, missing: true }; // falta la migración en este restaurante
  return { ...LOYALTY_DEFAULTS, ...(data || {}) };
}

export function useLoyaltySettings() {
  const [loyalty, setLoyalty] = useState(cache);
  useEffect(() => {
    const on = (v) => setLoyalty(v);
    listeners.add(on);
    if (!cache) {
      inflight = inflight || fetchSettings().then((v) => { cache = v; inflight = null; listeners.forEach((l) => l(v)); return v; });
    }
    return () => listeners.delete(on);
  }, []);
  const reload = useCallback(async () => {
    cache = await fetchSettings();
    listeners.forEach((l) => l(cache));
    return cache;
  }, []);
  return { loyalty: loyalty || LOYALTY_DEFAULTS, loaded: Boolean(loyalty), reload };
}

// Qué gana el cliente, en pocas palabras (la etiqueta que escribió el dueño manda).
export const rewardText = (s, itemName) => s.reward_label || promoSummary({ kind: s.reward_kind, value: s.reward_value }, itemName);

// Pide a Apple Wallet que actualice los pases afectados ({ orderId } | { userId } | { all: true }).
export async function notifyWallet(target) {
  try {
    if (!BARRO_CONFIGURED) return null;
    const { data } = await sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) return null;
    const res = await fetch('/api/wallet/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(target),
    });
    return res.json().catch(() => null);
  } catch (e) { return null; }
}

// Si este servidor tiene los certificados de Apple Wallet.
let walletStatusCache = null;
export function useWalletStatus() {
  const [status, setStatus] = useState(walletStatusCache);
  useEffect(() => {
    if (walletStatusCache) return;
    fetch('/api/wallet/status').then((r) => r.json()).then((j) => { walletStatusCache = j; setStatus(j); }).catch(() => setStatus({ enabled: false, missing: [] }));
  }, []);
  return status;
}
