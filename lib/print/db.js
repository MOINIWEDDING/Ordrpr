import { createClient } from '@supabase/supabase-js';

// Las impresoras entran sin sesión: las funciones print_* revisan el token de su dirección.
export function printDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const validToken = (t) => /^[0-9a-f]{64}$/.test(t || '');
