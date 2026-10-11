'use client';
import { useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

export function useEarlyBirdSettings(branch) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    if (!BARRO_CONFIGURED || !branch) { setSettings(null); setLoading(false); return; }
    const { data, error } = await sb.from('early_bird_settings').select('*').eq('branch', branch).single();
    setSettings(!error && data ? data : null);
    setLoading(false);
  }, [branch]);

  useEffect(() => { load(); }, [load]);

  return { settings, loading, reload: load };
}
