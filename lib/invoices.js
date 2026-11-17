'use client';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

// Abre la factura de un pedido. Un pedido suelto se factura al hacerlo; uno de una cuenta abierta,
// cuando la cuenta se cobra. Devuelve un mensaje si todavía no hay factura.
export async function openInvoiceForOrder(orderId, router) {
  if (!BARRO_CONFIGURED) return 'Conecta Supabase para ver facturas.';
  const { data, error } = await sb.rpc('invoice_for_order', { order_input: orderId });
  if (error) return /invoice_for_order|schema cache/i.test(error.message || '') ? 'Las facturas todavía no están disponibles.' : 'No se pudo abrir la factura.';
  if (!data) return 'La factura sale cuando se cobre la cuenta de la mesa.';
  router.push(`/factura/${data}`);
  return null;
}
