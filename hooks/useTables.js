'use client';
import { useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

export function demoTables() {
  return Array.from({ length: 14 }, (_, i) => ({ id: `demo-${i + 1}`, label: `Mesa ${i + 1}`, sort_order: i + 1 }));
}

export function useTables(branch) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    if (!BARRO_CONFIGURED || !branch) { setTables(demoTables()); setLoading(false); return; }
    const { data, error } = await sb.from('dining_tables').select('*').eq('branch', branch).order('sort_order', { ascending: true });
    if (error) { setTables(demoTables()); setLoading(false); return; }
    setTables(data || []);
    setLoading(false);
  }, [branch]);

  useEffect(() => { load(); }, [load]);

  return { tables, loading, reload: load };
}
