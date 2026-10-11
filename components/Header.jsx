'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useOrdersNotify } from '@/context/OrdersNotifyContext';

const GUEST_LINKS = [
  { href: '/', label: 'Inicio' },
  { href: '/nosotros', label: 'Nosotros' },
  { href: '/menu', label: 'Menú' },
  { href: '/pedidos', label: 'Pedidos' },
];

const STAFF_LINKS = [
  { href: '/', label: 'Inicio' },
  { href: '/menu', label: 'Menú' },
  { href: '/ordenes', label: 'Órdenes', badge: true },
  { href: '/estadisticas', label: 'Estadísticas' },
];

const COMENSAL_LINKS = [
  { href: '/ordenes', label: 'Órdenes', badge: true },
];

export default function Header() {
  const pathname = usePathname();
  const { count, openDrawer } = useCart();
  const { profile, isStaff, isComensal } = useAuth();
  const { unseenCount } = useOrdersNotify();
  const [solid, setSolid] = useState(false);
  const links = isStaff ? STAFF_LINKS : isComensal ? COMENSAL_LINKS : GUEST_LINKS;

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
            <Link key={l.href} href={l.href} className={pathname === l.href ? 'current' : ''} style={{ position: 'relative' }}>
              {l.label}
              {l.badge && unseenCount > 0 && <span className="tab-badge" style={{ position: 'absolute', top: -8, right: -16 }}>{unseenCount > 9 ? '9+' : unseenCount}</span>}
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
