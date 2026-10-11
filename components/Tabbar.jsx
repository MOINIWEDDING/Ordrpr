'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useOrdersNotify } from '@/context/OrdersNotifyContext';

const GUEST_TABS = [
  { href: '/', label: 'Inicio', icon: <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /> },
  { href: '/menu', label: 'Menú', icon: <path d="M5 7h14M5 12h14M5 17h9" /> },
  { href: '/nosotros', label: 'Nosotros', icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></> },
  { href: '/pedidos', label: 'Pedidos', icon: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></> },
];

const STAFF_TABS = [
  { href: '/', label: 'Inicio', icon: <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /> },
  { href: '/menu', label: 'Menú', icon: <path d="M5 7h14M5 12h14M5 17h9" /> },
  { href: '/ordenes', label: 'Órdenes', icon: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>, badge: true },
  { href: '/estadisticas', label: 'Estadísticas', icon: <><path d="M4 20V10M11 20V4M18 20v-7" /></> },
];

const COMENSAL_TABS = [
  { href: '/ordenes', label: 'Órdenes', icon: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>, badge: true },
];

export default function Tabbar() {
  const pathname = usePathname();
  const { profile, isStaff, isComensal } = useAuth();
  const { unseenCount } = useOrdersNotify();

  // En la pantalla de bienvenida/login (Cuenta sin sesión) no mostramos la barra,
  // para que se sienta como una pantalla propia, sin navegación detrás.
  if (pathname === '/cuenta' && !profile) return null;

  const baseTabs = isStaff ? STAFF_TABS : isComensal ? COMENSAL_TABS : GUEST_TABS;
  const tabs = [...baseTabs, { href: '/cuenta', label: 'Cuenta', icon: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></> }];

  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? 'current' : ''}>
          <span style={{ position: 'relative' }}>
            <svg viewBox="0 0 24 24">{t.icon}</svg>
            {t.href === '/cuenta' && profile && <span className={`tab-dot${isStaff ? ' staff' : ''}`} />}
            {t.badge && unseenCount > 0 && <span className="tab-badge">{unseenCount > 9 ? '9+' : unseenCount}</span>}
          </span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
