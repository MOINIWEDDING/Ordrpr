'use client';
// Después de cada venta: pide al servidor que envíe a la DGII lo pendiente (no espera la respuesta).
export function kickEcf() {
  try { fetch('/api/ecf/emitir', { method: 'POST', keepalive: true }).catch(() => {}); } catch (e) { /* nada */ }
}
