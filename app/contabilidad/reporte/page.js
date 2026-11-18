import { Suspense } from 'react';
import AccountingReport from '@/components/AccountingReport';

export const metadata = { title: 'Reporte contable' };

export default function ReporteContablePage() {
  return (
    <Suspense fallback={null}>
      <AccountingReport />
    </Suspense>
  );
}
