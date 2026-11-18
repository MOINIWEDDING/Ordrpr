import { Suspense } from 'react';
import InvoicesPrint from '@/components/InvoicesPrint';

export const metadata = { title: 'Facturas' };

export default function FacturasImprimirPage() {
  return (
    <Suspense fallback={null}>
      <InvoicesPrint />
    </Suspense>
  );
}
