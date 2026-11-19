'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useOrdersNotify } from '@/context/OrdersNotifyContext';
import { ICONS } from '@/lib/roleNav';

const GEAR = <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2" /><circle cx="12" cy="12" r="7" /></>;

// Los grupos del dueño: cada círculo junta lo suyo. Posiciones en % del escenario (como el dibujo).
const GROUPS = [
  {
    id: 'cuentas', label: 'Contabilidad', tint: 'manana', icon: ICONS.ledger, at: [76, 20],
    items: [
      { href: '/contabilidad', label: 'Contabilidad', icon: ICONS.ledger },
      { href: '/estadisticas', label: 'Estadísticas', icon: ICONS.stats },
      { href: '/caja', label: 'Caja', icon: ICONS.register },
      { href: '/promociones', label: 'Promociones', icon: ICONS.promo },
    ],
  },
  {
    id: 'servicio', label: 'Cocina y meseros', tint: 'salado', icon: ICONS.kitchen, at: [84, 54],
    items: [
      { href: '/ordenes', label: 'Órdenes', icon: ICONS.orders, badge: true },
      { href: '/cocina', label: 'Cocina', icon: ICONS.kitchen },
      { href: '/camarero', label: 'Mesas', icon: ICONS.tables },
      { href: '/menu', label: 'Menú', icon: ICONS.menu },
    ],
  },
  {
    id: 'ajustes', label: 'Ajustes y usuarios', tint: 'experiencia', icon: GEAR, at: [48, 85],
    items: [
      { href: '/cuenta', label: 'Configuración', icon: GEAR },
      { href: '/personal', label: 'Equipo', icon: ICONS.team },
      { href: '/usuarios', label: 'Usuarios', icon: ICONS.users },
      { href: '/', label: 'Inicio', icon: ICONS.home },
    ],
  },
];
const HUB = [36, 44];
const CENTER = { x: '-50%', y: '-50%' };
const SPRING = { type: 'spring', stiffness: 260, damping: 28 };

// alrededor del grupo abierto: los accesos en círculo, empezando arriba
function around(n, i) {
  const a = (-90 + (360 / n) * i) * (Math.PI / 180);
  return [50 + Math.cos(a) * 33, 50 + Math.sin(a) * 33];
}

// El botón de la cuenta del dueño abre esto: su círculo en el centro y, colgando de él, un círculo por
// cada parte del negocio. Al tocar uno, ese pasa al centro y se abren sus accesos alrededor.
export default function OwnerOrbit({ open, onClose }) {
  const { profile, logout } = useAuth();
  const reduce = useReducedMotion();
  const [group, setGroup] = useState(null);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname() || '/';
  const { unseenCount } = useOrdersNotify();
  const stageRef = useRef(null);
  useEffect(() => { setMounted(true); }, []);

  // mientras está abierto, la página de atrás no se mueve
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  // el foco entra al primer círculo (para teclado) y, al cambiar de nivel, al primero de ese nivel
  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => {
      const el = stageRef.current && stageRef.current.querySelector(group ? '.orbit-item a' : '.orbit-group');
      if (el) el.focus({ preventScroll: true });
    }, reduce ? 0 : 260);
    return () => clearTimeout(id);
  }, [open, group, reduce]);

  useEffect(() => { if (!open) setGroup(null); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { if (group) setGroup(null); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, group, onClose]);

  const g = GROUPS.find((x) => x.id === group);
  const name = (profile && profile.name) || 'Dueño';
  const hubAt = g ? [11, 11] : HUB;
  const t = reduce ? { duration: 0 } : SPRING;
  const here = (href) => pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
  const badge = unseenCount > 9 ? '9+' : String(unseenCount);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="orbit-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          role="dialog" aria-modal="true" aria-label="Tu negocio"
        >
          <button type="button" className="orbit-close" onClick={onClose} aria-label="Cerrar">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <div className="orbit-stage" ref={stageRef}>
            <span className="orbit-ring" aria-hidden="true" style={{ left: `${HUB[0]}%`, top: `${HUB[1]}%`, opacity: g ? 0 : 1 }} />
            <svg className="orbit-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <AnimatePresence>
                {!g && GROUPS.map((x, i) => (
                  <motion.line key={x.id} x1={HUB[0]} y1={HUB[1]} x2={x.at[0]} y2={x.at[1]}
                    initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ delay: reduce ? 0 : 0.12 + i * 0.06, duration: 0.4 }} />
                ))}
                {g && g.items.map((it, i) => {
                  const [x, y] = around(g.items.length, i);
                  return (
                    <motion.line key={`${g.id}-${it.href}`} x1={50} y1={50} x2={x} y2={y}
                      initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ delay: reduce ? 0 : 0.15 + i * 0.05, duration: 0.35 }} />
                  );
                })}
              </AnimatePresence>
            </svg>

            <motion.button
              type="button"
              className={`orbit-node orbit-hub${g ? ' is-back' : ''}`}
              initial={reduce ? false : { scale: 0.4, opacity: 0, left: `${HUB[0]}%`, top: `${HUB[1]}%` }}
              animate={{ scale: 1, opacity: 1, left: `${hubAt[0]}%`, top: `${hubAt[1]}%`, width: g ? '17%' : '36%' }}
              transition={t}
              style={CENTER}
              onClick={() => (g ? setGroup(null) : onClose())}
              aria-label={g ? 'Volver' : 'Cerrar'}
            >
              {g ? (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              ) : (
                <>
                  <span className="orbit-avatar">{name.trim().charAt(0).toUpperCase()}</span>
                  <b>{name}</b>
                  <small>Tu negocio</small>
                </>
              )}
            </motion.button>

            {GROUPS.map((x, i) => {
              const isOpen = group === x.id;
              const hidden = g && !isOpen;
              const at = isOpen ? [50, 50] : x.at;
              const inside = x.items.some((it) => here(it.href));
              const count = x.items.some((it) => it.badge) && unseenCount > 0;
              return (
                <motion.button
                  key={x.id}
                  type="button"
                  className={`orbit-node orbit-group is-${x.tint}${isOpen ? ' is-open' : ''}${inside ? ' is-here' : ''}`}
                  initial={reduce ? false : { scale: 0, opacity: 0, left: `${HUB[0]}%`, top: `${HUB[1]}%` }}
                  animate={{ scale: hidden ? 0.3 : 1, opacity: hidden ? 0 : 1, left: `${at[0]}%`, top: `${at[1]}%`, width: isOpen ? '32%' : '25%' }}
                  transition={reduce ? { duration: 0 } : { ...SPRING, delay: g ? 0 : 0.08 + i * 0.06 }}
                  style={{ ...CENTER, pointerEvents: hidden ? 'none' : 'auto' }}
                  onClick={() => setGroup(isOpen ? null : x.id)}
                  aria-expanded={isOpen}
                  tabIndex={hidden ? -1 : 0}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">{x.icon}</svg>
                  <span>{x.label}</span>
                  {count && !isOpen && <em className="orbit-badge" aria-label={`${unseenCount} órdenes nuevas`}>{badge}</em>}
                </motion.button>
              );
            })}

            <AnimatePresence>
              {g && g.items.map((it, i) => {
                const [x, y] = around(g.items.length, i);
                return (
                  <motion.div
                    key={`${g.id}-${it.href}`}
                    className="orbit-node orbit-item"
                    initial={reduce ? { opacity: 0 } : { scale: 0, opacity: 0, left: '50%', top: '50%' }}
                    animate={{ scale: 1, opacity: 1, left: `${x}%`, top: `${y}%` }}
                    exit={reduce ? { opacity: 0 } : { scale: 0, opacity: 0, left: '50%', top: '50%' }}
                    transition={reduce ? { duration: 0 } : { ...SPRING, delay: 0.06 + i * 0.05 }}
                    style={CENTER}
                  >
                    <Link href={it.href} onClick={onClose} className={`is-${g.tint}${here(it.href) ? ' is-here' : ''}`} aria-current={here(it.href) ? 'page' : undefined}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">{it.icon}</svg>
                      <span>{it.label}</span>
                      {it.badge && unseenCount > 0 && <em className="orbit-badge" aria-label={`${unseenCount} órdenes nuevas`}>{badge}</em>}
                    </Link>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          <button type="button" className="orbit-logout" onClick={() => { onClose(); logout(); }}>Cerrar sesión</button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
