'use client';
import { useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

export function useAvatars() {
  const [avatars, setAvatars] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    if (!BARRO_CONFIGURED) { setAvatars([]); setLoading(false); return; }
    const { data, error } = await sb.from('avatars').select('*').order('sort_order', { ascending: true });
    setAvatars(!error && data ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { avatars, loading, reload: load };
}
