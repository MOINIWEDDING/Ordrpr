'use client';
import { useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

export function demoDesigns() {
  return [
    { id: 'gd1', name: 'Clásico', image_url: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23241C13'/%3E%3Cstop offset='1' stop-color='%235A4632'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='800' height='500' fill='url(%23g)'/%3E%3C/svg%3E", scope: 'global' },
    { id: 'gd2', name: 'Color de marca', image_url: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23D5402C'/%3E%3Cstop offset='1' stop-color='%238F2415'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='800' height='500' fill='url(%23g)'/%3E%3C/svg%3E", scope: 'global' },
  ];
}

export function useGiftCardDesigns() {
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    if (!BARRO_CONFIGURED) { setDesigns(demoDesigns()); setLoading(false); return; }
    const { data, error } = await sb.from('gift_card_designs').select('*').order('sort_order', { ascending: true });
    if (error) { setDesigns(demoDesigns()); setLoading(false); return; }
    setDesigns(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { designs, loading, reload: load };
}
