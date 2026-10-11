'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';

// Aviso fijo para el dueño mientras no termine de configurar su negocio.
export default function SetupBanner() {
  const { isStaff } = useAuth();
  const { settings, loading } = useSettings();
  const pathname = usePathname();
  if (!isStaff || loading || settings.setup_completed || pathname === '/setup') return null;
  return (
    <Link href="/setup" className="setup-banner">
      Termina de configurar tu negocio (nombre, logo, colores y sucursales) →
    </Link>
  );
}
