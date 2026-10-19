import { Suspense } from 'react';
import StatsReport from '@/components/StatsReport';

export const metadata = { title: 'Reporte de estadísticas' };

export default function ReportePage() {
  return (
    <Suspense fallback={null}>
      <StatsReport />
    </Suspense>
  );
}
