'use client';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

// Manda un ticket (prefactura, factura o prueba) a las impresoras de un uso ('caja', 'cocina' o 'bar')
// de la sucursal. Cada impresora lo recoge por internet (ver /api/print). Devuelve cuántas lo recibirán.
export async function sendToPrinters({ role, kind, payload, branch, printerId }) {
  if (!BARRO_CONFIGURED) return { sent: 0, error: 'Conecta Supabase para imprimir.' };
  let q = sb.from('printers').select('id, branch').eq('enabled', true);
  q = printerId ? q.eq('id', printerId) : q.eq('role', role);
  const { data: printers, error } = await q;
  if (error) return { sent: 0, error: /printers|schema cache/i.test(error.message || '') ? 'Las impresoras todavía no están disponibles.' : error.message };
  const targets = (printers || []).filter((p) => printerId || !p.branch || !branch || p.branch === branch);
  if (!targets.length) return { sent: 0, error: 'No hay impresoras de caja. Agrégalas en Cuenta → Tu negocio → Impresoras.' };
  const { error: insErr } = await sb.from('print_jobs').insert(targets.map((p) => ({ printer_id: p.id, kind, payload })));
  if (insErr) return { sent: 0, error: insErr.message };
  return { sent: targets.length };
}
