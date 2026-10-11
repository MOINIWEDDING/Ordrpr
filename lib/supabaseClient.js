'use client';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const BARRO_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Si no está configurado, exportamos un cliente "falso" que nunca se usa
// (todo el código revisa BARRO_CONFIGURED antes de llamar a sb.*),
// para no reventar el build cuando faltan las variables de entorno.
export const sb = BARRO_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
