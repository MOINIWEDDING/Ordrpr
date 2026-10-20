'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';

// Usuarios del negocio para el dueño: todos los clientes registrados con su correo, quién aceptó
// el newsletter, los más fieles y la exportación en CSV para campañas de correo.

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'buyers', label: 'Con pedidos' },
  { id: 'none', label: 'Sin pedidos' },
];
const SORTS = [
  { id: 'recent', label: 'Más recientes' },
  { id: 'loyal', label: 'Más fieles' },
  { id: 'orders', label: 'Más pedidos' },
  { id: 'spent', label: 'Más gastado' },
];
const GENDER = { femenino: 'Femenino', masculino: 'Masculino', prefiero_no_decir: 'Prefiere no decir' };

const loyalOrder = (a, b) => b.total_stamps - a.total_stamps || b.rewards - a.rewards || Number(b.orders) - Number(a.orders) || Number(b.spent) - Number(a.spent);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '') : '—');
const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function toCsv(rows) {
  const cols = [
    ['nombre', (u) => u.name], ['correo', (u) => u.email], ['registrado', (u) => isoDay(u.created_at)],
    ['newsletter', (u) => (u.newsletter ? 'si' : 'no')], ['newsletter_fecha', (u) => isoDay(u.newsletter_at)],
    ['pedidos', (u) => u.orders], ['total_gastado', (u) => Math.round(Number(u.spent) || 0)], ['ultimo_pedido', (u) => isoDay(u.last_order)],
    ['sellos_actuales', (u) => u.stamps], ['sellos_totales', (u) => u.total_stamps], ['premios', (u) => u.rewards],
    ['sexo', (u) => GENDER[u.gender] || ''], ['edad', (u) => u.age || ''],
  ];
  const cell = (v) => {
    const t = String(v ?? '');
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [cols.map((c) => c[0]).join(','), ...rows.map((u) => cols.map((c) => cell(c[1](u))).join(','))].join('\r\n');
}

export default function UsuariosPage() {
  const { profile, isStaff } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (profile && !isStaff) router.push('/');
  }, [profile, isStaff, router]);

  useEffect(() => {
    if (!isStaff) return;
    if (!BARRO_CONFIGURED) { setLoading(false); return; }
    sb.rpc('owner_users').then(({ data, error: err }) => {
      if (err) setError(/owner_users|schema cache|does not exist/i.test(err.message || '') ? 'Falta actualizar la base de datos de este restaurante para ver los usuarios.' : err.message);
      else setUsers((data || []).filter((u) => u.role === 'cliente'));
      setLoading(false);
    });
  }, [isStaff]);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const leaders = useMemo(() => [...users].filter((u) => u.total_stamps > 0 || Number(u.orders) > 0).sort(loyalOrder).slice(0, 5), [users]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = users.filter((u) => (filter === 'all'
      || (filter === 'newsletter' && u.newsletter)
      || (filter === 'buyers' && Number(u.orders) > 0)
      || (filter === 'none' && Number(u.orders) === 0))
      && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q)));
    const by = {
      recent: (a, b) => (b.created_at > a.created_at ? 1 : -1),
      loyal: loyalOrder,
      orders: (a, b) => Number(b.orders) - Number(a.orders) || Number(b.spent) - Number(a.spent),
      spent: (a, b) => Number(b.spent) - Number(a.spent),
    }[sort];
    return list.sort(by);
  }, [users, filter, sort, q]);

  function exportCsv() {
    // BOM para que Excel lea bien los acentos
    const blob = new Blob(['﻿', toCsv(shown)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usuarios-${(settings.brand_name || 'negocio').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${isoDay(new Date())}${filter === 'newsletter' ? '-newsletter' : ''}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!profile || !isStaff) return null;

  return (
    <section className="ordenes-page users-page">
      <div className="wrap">
        <div className="section-head promo-head">
          <div>
            <p className="eyebrow">Panel del dueño</p>
            <h2 style={{ fontSize: 24 }}>Usuarios</h2>
          </div>
          <button type="button" className="btn btn-amber promo-new" onClick={exportCsv} disabled={!shown.length}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
            Exportar CSV
          </button>
        </div>

        {loading ? (
          <p className="empty-note">Cargando usuarios…</p>
        ) : error ? (
          <div className="form-msg show error">{error}</div>
        ) : (
          <>
            <div className="promo-summary">
              <div><span className="kpi-label">Registrados</span><b>{users.length}</b></div>
              <div><span className="kpi-label">Newsletter</span><b>{users.filter((u) => u.newsletter).length}</b></div>
              <div><span className="kpi-label">Nuevos este mes</span><b>{users.filter((u) => new Date(u.created_at) >= monthStart).length}</b></div>
              <div><span className="kpi-label">Con pedidos</span><b>{users.filter((u) => Number(u.orders) > 0).length}</b></div>
            </div>

            {leaders.length > 0 && (
              <div className="users-leaders">
                <h3>Clientes más fieles</h3>
                <ol>
                  {leaders.map((u, i) => (
                    <li key={u.id} className={`users-leader is-${i + 1}`}>
                      <span className={`loyalty-rank${i < 3 ? ` top-${i + 1}` : ''}`}>{i + 1}</span>
                      <span className="users-leader-who">
                        <b>{u.name || 'Cliente'}</b>
                        <a href={`mailto:${u.email}`}>{u.email}</a>
                      </span>
                      <span className="users-leader-nums">
                        <span><b>{u.total_stamps}</b> sellos</span>
                        <span><b>{u.rewards}</b> premios</span>
                        <span><b>{u.orders}</b> pedidos</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="users-tools">
              <div className="stat-period-tabs" role="tablist" aria-label="Filtrar usuarios">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>
                ))}
              </div>
              <div className="users-tools-row">
                <input type="search" placeholder="Buscar por nombre o correo…" value={query} onChange={(e) => setQuery(e.target.value)} />
                <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
                  {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <p className="users-count">{shown.length} {shown.length === 1 ? 'usuario' : 'usuarios'}</p>
            {shown.length === 0 ? (
              <p className="empty-note">{users.length ? 'Nadie con esos filtros.' : 'Todavía no se ha registrado nadie.'}</p>
            ) : (
              <ul className="users-list">
                {shown.map((u) => (
                  <li key={u.id}>
                    <span className="users-who">
                      <b>{u.name || 'Cliente'}</b>
                      <a href={`mailto:${u.email}`}>{u.email}</a>
                      <small>Desde {fmtDate(u.created_at)}{u.last_order ? ` · último pedido ${fmtDate(u.last_order)}` : ''}</small>
                    </span>
                    <span className="users-nums">
                      <span><b>{u.orders}</b><small>pedidos</small></span>
                      <span><b>{money(Math.round(Number(u.spent) || 0))}</b><small>gastado</small></span>
                      <span><b>{u.total_stamps}</b><small>sellos</small></span>
                    </span>
                    <span className={`users-news${u.newsletter ? ' on' : ''}`}>{u.newsletter ? 'Newsletter' : 'Sin newsletter'}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
