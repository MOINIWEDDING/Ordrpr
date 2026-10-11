'use client';
import { useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

export function useTaxSettings(branch) {
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    if (!BARRO_CONFIGURED || !branch) { setCharges([]); setLoading(false); return; }
    const { data, error } = await sb.from('tax_settings').select('charges').eq('branch', branch).single();
    setCharges(!error && data && Array.isArray(data.charges) ? data.charges : []);
    setLoading(false);
  }, [branch]);

  useEffect(() => { load(); }, [load]);

  const totalPercent = charges.reduce((s, c) => s + (Number(c.percent) || 0), 0);

  return { charges, totalPercent, loading, reload: load };
}
