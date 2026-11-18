// Navegación de cada rol: las pestañas de la barra de abajo (teléfono), las que van dentro de
// "Más" y los enlaces del menú de escritorio. Lo usan Tabbar y Header.

export const ICONS = {
  home: <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  menu: <path d="M5 7h14M5 12h14M5 17h9" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  orders: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  stats: <path d="M4 20V10M11 20V4M18 20v-7" />,
  promo: <><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z" /><circle cx="8" cy="8" r="1.6" /></>,
  pass: <><rect x="3.5" y="5" width="17" height="14" rx="3" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /></>,
  user: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5a6 6 0 0 1 12 0" /><path d="M15.5 5.5a3.2 3.2 0 0 1 0 6.2M17.5 14.2a6 6 0 0 1 3.5 5.3" /></>,
  register: <><rect x="3" y="10" width="18" height="10" rx="2" /><path d="M7 10V5h10v5M7 14h2M11 14h2M15 14h2M7 17h10" /></>,
  kitchen: <><path d="M7 11a4 4 0 0 1 1.2-7.8A4.5 4.5 0 0 1 16 4a3.6 3.6 0 0 1 1 7z" /><path d="M7 11v8h10v-8M7 15h10" /></>,
  tables: <><rect x="3" y="7" width="18" height="5" rx="1.5" /><path d="M6 12v7M18 12v7M9 16h6" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  ledger: <><path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6z" /><path d="M9 7h6M9 11h6M9 15h3" /></>,
  printer: <><path d="M7 9V4h10v5" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v6H7z" /></>,
};

const T = {
  inicio: { href: '/', label: 'Inicio', icon: ICONS.home },
  menu: { href: '/menu', label: 'Menú', icon: ICONS.menu },
  nosotros: { href: '/nosotros', label: 'Nosotros', icon: ICONS.info },
  pedidos: { href: '/pedidos', label: 'Pedidos', icon: ICONS.orders },
  pase: { href: '/pase', label: 'Pase', desktop: 'Pase de sellos', icon: ICONS.pass },
  caja: { href: '/caja', label: 'Caja', icon: ICONS.register },
  ordenes: { href: '/ordenes', label: 'Órdenes', icon: ICONS.orders, badge: true },
  cocina: { href: '/cocina', label: 'Cocina', icon: ICONS.kitchen },
  mesas: { href: '/camarero', label: 'Mesas', icon: ICONS.tables },
  estadisticas: { href: '/estadisticas', label: 'Estadísticas', icon: ICONS.stats },
  promos: { href: '/promociones', label: 'Promos', desktop: 'Promociones', icon: ICONS.promo },
  usuarios: { href: '/usuarios', label: 'Usuarios', icon: ICONS.users },
  contabilidad: { href: '/contabilidad', label: 'Contabilidad', icon: ICONS.ledger },
  miMesa: { href: '/mi-mesa', label: 'Mi mesa', icon: ICONS.tables },
  cuenta: { href: '/cuenta', label: 'Cuenta', icon: ICONS.user },
};

// tabs: barra de abajo (sin Cuenta, que siempre va al final); more: dentro de "Más"; desktop: menú de escritorio.
export function navForRole(role, { showNosotros = true, loyalty = false, activeTab = false } = {}) {
  if (role === 'staff') {
    return {
      tabs: [T.caja, T.ordenes, T.menu, T.estadisticas],
      more: [T.inicio, T.cocina, T.mesas, T.contabilidad, T.promos, T.usuarios],
      desktop: [T.inicio, T.menu, T.caja, T.ordenes, T.cocina, T.mesas, T.estadisticas, T.contabilidad, T.promos, T.usuarios],
    };
  }
  if (role === 'cajero') return { tabs: [T.caja, T.ordenes, T.cocina, T.menu], more: [], desktop: [T.caja, T.ordenes, T.cocina, T.menu] };
  if (role === 'camarero') return { tabs: [T.mesas, T.cocina], more: [], desktop: [T.mesas, T.cocina] };
  if (role === 'cocina') return { tabs: [T.cocina, T.ordenes], more: [], desktop: [T.cocina, T.ordenes] };
  if (role === 'contador') return { tabs: [T.contabilidad], more: [], desktop: [T.contabilidad] };
  if (role === 'comensal') return { tabs: [T.ordenes, T.caja], more: [], desktop: [T.ordenes, T.caja] };
  // clientes y visitantes
  const base = [T.inicio, T.menu, ...(showNosotros ? [T.nosotros] : []), T.pedidos, ...(loyalty ? [T.pase] : [])];
  const tabs = activeTab ? [T.inicio, T.menu, T.miMesa, T.pedidos, ...(loyalty ? [T.pase] : [])] : base;
  return { tabs, more: [], desktop: activeTab ? [T.miMesa, ...base] : base };
}

export const ACCOUNT_TAB = T.cuenta;
export const MORE_ICON = ICONS.more;
