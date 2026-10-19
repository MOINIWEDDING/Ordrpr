import { createClient } from '@supabase/supabase-js';

// Cliente de Supabase para las rutas de /api/wallet. Sin token, entra como visitante (las funciones
// wallet_* revisan el token de cada pase); con token, actúa con la sesión de quien llama.
export function walletDb(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Fecha HTTP sin milisegundos (Last-Modified / If-Modified-Since trabajan en segundos).
export const httpDate = (d) => new Date(Math.floor(new Date(d).getTime() / 1000) * 1000).toUTCString();
