'use client';
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { DEFAULT_SETTINGS, setCurrencyFormat } from '@/lib/settingsDefaults';
import { applyTheme } from '@/lib/theme';

const SettingsContext = createContext(null);

function prepare(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  // el formato de dinero debe estar listo ANTES de que los componentes hijos se pinten
  setCurrencyFormat({ symbol: merged.currency_symbol, position: merged.currency_position, locale: merged.locale });
  return merged;
}

export function SettingsProvider({ initial, children }) {
  const [settings, setSettings] = useState(() => prepare(initial));
  const [loading, setLoading] = useState(BARRO_CONFIGURED);

  const reload = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setLoading(false); return; }
    const { data } = await sb.from('site_settings').select('*').eq('id', 1).maybeSingle();
    if (data) setSettings(prepare(data));
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { applyTheme(settings.primary_color, settings.background_color); }, [settings.primary_color, settings.background_color]);

  // Guarda cambios (solo el dueño puede: lo exige la base de datos con RLS).
  const saveSettings = useCallback(async (patch) => {
    if (!BARRO_CONFIGURED) { setSettings((s) => prepare({ ...s, ...patch })); return { error: null }; }
    const { data, error } = await sb.from('site_settings')
      .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() })
      .select().single();
    if (error) return { error };
    setSettings(prepare(data));
    return { error: null };
  }, []);

  const value = useMemo(() => ({ settings, loading, reload, saveSettings }), [settings, loading, reload, saveSettings]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings debe usarse dentro de <SettingsProvider>');
  return ctx;
}
