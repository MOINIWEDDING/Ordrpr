'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useLoyaltySettings } from '@/lib/loyalty';
import { useActiveTab } from '@/lib/activeTab';
import { navForRole, ACCOUNT_TAB, MORE_ICON } from '@/lib/roleNav';
import { useOrdersNotify } from '@/context/OrdersNotifyContext';

const isCurrent = (pathname, href) => pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));

export default function Tabbar() {
  const pathname = usePathname();
  const { profile, userRole, isStaff } = useAuth();
  const { unseenCount } = useOrdersNotify();
  const { settings } = useSettings();
  const { loyalty } = useLoyaltySettings();
  const activeTab = useActiveTab();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  // En la pantalla de bienvenida/login (Cuenta sin sesión) no mostramos la barra,
  // para que se sienta como una pantalla propia, sin navegación detrás.
  if (pathname === '/cuenta' && !profile) return null;

  const nav = navForRole(userRole, { showNosotros: settings.show_nosotros !== false, loyalty: loyalty.enabled, activeTab: Boolean(activeTab) });
  const moreActive = nav.more.some((t) => isCurrent(pathname, t.href));

  const item = (t) => (
    <Link key={t.href} href={t.href} className={isCurrent(pathname, t.href) ? 'current' : ''}>
      <span style={{ position: 'relative' }}>
        <svg viewBox="0 0 24 24">{t.icon}</svg>
        {t.href === '/cuenta' && profile && <span className={`tab-dot${isStaff ? ' staff' : ''}`} />}
        {t.badge && unseenCount > 0 && <span className="tab-badge">{unseenCount > 9 ? '9+' : unseenCount}</span>}
      </span>
      {t.label}
    </Link>
  );

  return (
    <>
      {moreOpen && (
        <div className="tab-more-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="tab-more" onClick={(e) => e.stopPropagation()}>
            {nav.more.map((t) => (
              <Link key={t.href} href={t.href} className={isCurrent(pathname, t.href) ? 'current' : ''}>
                <svg viewBox="0 0 24 24">{t.icon}</svg>
                {t.desktop || t.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="tabbar">
        {nav.tabs.map(item)}
        {nav.more.length > 0 && (
          <button type="button" className={moreActive || moreOpen ? 'current' : ''} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
            <span><svg viewBox="0 0 24 24">{MORE_ICON}</svg></span>
            Más
          </button>
        )}
        {item(ACCOUNT_TAB)}
      </nav>
    </>
  );
}
