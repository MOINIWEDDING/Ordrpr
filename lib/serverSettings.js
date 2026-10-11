import { DEFAULT_SETTINGS } from './settingsDefaults';

// Lee la configuración del negocio desde el servidor (para el título de la pestaña,
// el color de marca y el ícono) sin depender del navegador. Se refresca cada 60 s.
export async function getServerSettings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ...DEFAULT_SETTINGS };
  try {
    const res = await fetch(`${url}/rest/v1/site_settings?id=eq.1&select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { ...DEFAULT_SETTINGS };
    const rows = await res.json();
    return { ...DEFAULT_SETTINGS, ...(rows[0] || {}) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}
