'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useLoyaltySettings } from '@/lib/loyalty';
import { useActiveTab } from '@/lib/activeTab';
import { navForRole } from '@/lib/roleNav';
import { useOrdersNotify } from '@/context/OrdersNotifyContext';

export default function Header() {
  const pathname = usePathname();
  const { count, openDrawer } = useCart();
  const { profile, userRole } = useAuth();
  const activeTab = useActiveTab();
  const { unseenCount } = useOrdersNotify();
  const { settings } = useSettings();
  const { loyalty } = useLoyaltySettings();
  const [solid, setSolid] = useState(false);
  const links = navForRole(userRole, { showNosotros: settings.show_nosotros !== false, loyalty: loyalty.enabled, activeTab: Boolean(activeTab) }).desktop;

  useEffect(() => {
    function onScroll() { setSolid(window.scrollY > 40); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Misma pantalla de bienvenida/login: tampoco mostramos el header en escritorio.
  if (pathname === '/cuenta' && !profile) return null;

  return (
    <header id="siteHeader" className={solid ? 'solid' : ''}>
      <div className="wrap">
        <nav className="links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`nav-icon${pathname === l.href || (l.href !== '/' && pathname.startsWith(`${l.href}/`)) ? ' current' : ''}`} aria-label={l.desktop || l.label} data-label={l.desktop || l.label}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{l.icon}</svg>
              {l.badge && unseenCount > 0 && <span className="nav-icon-badge">{unseenCount > 9 ? '9+' : unseenCount}</span>}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          <button type="button" className="icon-round" aria-label="Carrito" onClick={openDrawer} style={{ position: 'relative' }}>
            <svg className="icon" viewBox="0 0 24 24"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" /></svg>
            {count > 0 && <span className="cart-badge">{count}</span>}
          </button>
          <Link href="/cuenta" className="icon-round" aria-label="Cuenta">
            <svg className="icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
