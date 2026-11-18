import { adminDb } from '@/lib/supabaseServer';
import { json, processQueue } from '@/lib/ecf/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Envía a la DGII (por Alanube) las facturas pendientes y consulta las que esperan respuesta.
// No recibe datos: solo trabaja la cola de la base, así que cualquiera puede pedir que avance.
export async function POST() {
  const admin = adminDb();
  if (!admin) return json({ processed: 0, reason: 'sin clave de servicio' }, 501);
  return json(await processQueue(admin, 10));
}
