'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

const SiteContentContext = createContext(null);

export function SiteContentProvider({ children }) {
  const [map, setMap] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      if (!BARRO_CONFIGURED) { setLoaded(true); return; }
      const { data, error } = await sb.from('site_content').select('key, value');
      if (!error && data) {
        const next = {};
        data.forEach((row) => { next[row.key] = row.value; });
        setMap(next);
      }
      setLoaded(true);
    }
    load();
  }, []);

  const get = useCallback((key, fallback) => (map[key] !== undefined && map[key] !== '' ? map[key] : fallback), [map]);

  const save = useCallback(async (key, value) => {
    setMap((prev) => ({ ...prev, [key]: value })); // optimista
    if (!BARRO_CONFIGURED) return { error: null };
    const { error } = await sb.from('site_content').upsert({ key, value, updated_at: new Date().toISOString() });
    return { error };
  }, []);

  return (
    <SiteContentContext.Provider value={{ get, save, loaded }}>
      {children}
    </SiteContentContext.Provider>
  );
}

export function useSiteContent() {
  const ctx = useContext(SiteContentContext);
  if (!ctx) throw new Error('useSiteContent debe usarse dentro de <SiteContentProvider>');
  return ctx;
}
