'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getStaffDevice, HOME_FOR_ROLE } from '@/lib/staffDevice';
import { navForRole } from '@/lib/roleNav';

const OWNER_IDLE_MS = 60 * 1000;
// páginas que se pueden ver en un aparato del local sin sesión (la pantalla del equipo y lo que se imprime)
const isFree = (p) => p === '/equipo' || p.startsWith('/factura/') || p.startsWith('/impresora/');

// En un aparato del local (activado para el equipo) nadie se pasea por la app: sin sesión solo está la
// pantalla del equipo, cada persona solo abre sus pantallas y la sesión del dueño se cierra sola si
// la deja abierta.
export default function DeviceGuard() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { profile, authReady, userRole, logout } = useAuth();
  const [device, setDevice] = useState(null);
  const [left, setLeft] = useState(OWNER_IDLE_MS);
  const lastActive = useRef(Date.now());

  useEffect(() => { setDevice(getStaffDevice()); }, [pathname]);

  useEffect(() => {
    if (!device || !authReady) return;
    if (!profile) {
      if (!isFree(pathname)) router.replace('/equipo');
      return;
    }
    if (userRole === 'staff') return;
    const nav = navForRole(userRole, {});
    const hrefs = [...nav.tabs, ...nav.more, ...nav.desktop].map((t) => t.href).filter((h) => h !== '/');
    const ok = isFree(pathname) || pathname === '/cuenta' || hrefs.some((h) => pathname === h || pathname.startsWith(`${h}/`));
    if (!ok) router.replace(HOME_FOR_ROLE[userRole] || '/equipo');
  }, [device, authReady, profile, userRole, pathname, router]);

  // la sesión del dueño en un aparato del local se cierra sola tras 1 minuto sin uso
  const ownerHere = Boolean(device && profile && userRole === 'staff');
  useEffect(() => {
    if (!ownerHere) return undefined;
    lastActive.current = Date.now();
    const touch = () => { lastActive.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const t = setInterval(() => {
      const rest = OWNER_IDLE_MS - (Date.now() - lastActive.current);
      setLeft(rest);
      if (rest <= 0) logout();
    }, 1000);
    return () => { events.forEach((e) => window.removeEventListener(e, touch)); clearInterval(t); };
  }, [ownerHere, logout]);

  if (!ownerHere) return null;
  const secs = Math.max(0, Math.ceil(left / 1000));
  return (
    <div className="device-owner-bar" role="status">
      <span><b>Sesión del dueño</b> en un aparato del local · se cierra sola en {secs} s si no la usas</span>
      <button type="button" onClick={logout}>Salir</button>
    </div>
  );
}
