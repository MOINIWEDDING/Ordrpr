import { Suspense } from 'react';
import PromoReport from '@/components/PromoReport';

export const metadata = { title: 'Reporte de códigos promocionales' };

export default function PromoReportePage() {
  return (
    <Suspense fallback={null}>
      <PromoReport />
    </Suspense>
  );
}
