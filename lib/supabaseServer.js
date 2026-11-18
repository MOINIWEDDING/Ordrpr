import { createClient } from '@supabase/supabase-js';

// Clientes de Supabase para las rutas del servidor. Cada restaurante tiene su propio proyecto de Supabase y
// su propio proyecto de Vercel, así que estas variables siempre apuntan a la base de ese restaurante.
const URL_ = () => process.env.NEXT_PUBLIC_SUPABASE_URL;

// Con la sesión de quien llama (respeta sus permisos).
export function userDb(token) {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!URL_() || !anon) return null;
  return createClient(URL_(), anon, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Con la clave de servicio (SUPABASE_SERVICE_ROLE_KEY, solo en Vercel). Nunca llega al navegador.
export function adminDb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_() || !key) return null;
  return createClient(URL_(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const bearer = (req) => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
