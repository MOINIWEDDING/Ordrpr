'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useMenuItems, money } from '@/hooks/useMenuItems';
import { promoStatus } from '@/lib/promo';
import { loadPromoData, missingPromoTables, promoStats } from '@/lib/promoStats';
import PromoTicket from '@/components/PromoTicket';
import PromoCodeForm from '@/components/PromoCodeForm';
import PromoCodeDetail from '@/components/PromoCodeDetail';
import LoyaltyAdmin from '@/components/LoyaltyAdmin';

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Activos' },
  { id: 'scheduled', label: 'Programados' },
  { id: 'ended', label: 'Terminados' },
];

export default function PromocionesPage() {
  const { profile, isStaff } = useAuth();
  const router = useRouter();
  const { items } = useMenuItems();
  const [data, setData] = useState({ codes: [], redemptions: [], orders: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null); // null | 'new' | código
  const [openId, setOpenId] = useState(null);
  const [view, setView] = useState('codes'); // 'codes' | 'pass'

  useEffect(() => {
    if (profile && !isStaff) router.push('/');
  }, [profile, isStaff, router]);

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setLoading(false); return; }
    try {
      setData(await loadPromoData());
      setError('');
    } catch (err) {
      setError(missingPromoTables(err) ? 'Falta actualizar la base de datos de este restaurante para usar códigos promocionales.' : err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (isStaff) load(); }, [isStaff, load]);

  // los premios del pase de sellos son códigos personales: se ven en su propia pestaña
  const rows = useMemo(() => data.codes.filter((c) => c.source !== 'loyalty').map((c) => {
    const stats = promoStats(c, data);
    return { code: c, stats, status: promoStatus(c, stats.uses), itemName: (items.find((i) => i.id === c.item_id) || {}).name };
  }), [data, items]);
  const total = useMemo(() => promoStats(null, data), [data]);
  const shown = rows.filter((r) => filter === 'all'
    || (filter === 'active' && r.status.id === 'active')
    || (filter === 'scheduled' && r.status.id === 'scheduled')
    || (filter === 'ended' && ['expired', 'soldout', 'paused'].includes(r.status.id)));
  const open = rows.find((r) => r.code.id === openId);

  if (!profile || !isStaff) return null;

  return (
    <section className="ordenes-page promo-page">
      <div className="wrap">
        <div className="section-head promo-head">
          <div>
            <p className="eyebrow">Panel del dueño</p>
            <h2 style={{ fontSize: 24 }}>Promociones</h2>
          </div>
          {view === 'codes' && (
            <button type="button" className="btn btn-amber promo-new" onClick={() => setEditing('new')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Nuevo código
            </button>
          )}
        </div>

        <div className="seg-buttons promo-views" role="tablist" aria-label="Promociones">
          <button type="button" role="tab" aria-selected={view === 'codes'} className={view === 'codes' ? 'active' : ''} onClick={() => setView('codes')}>Códigos</button>
          <button type="button" role="tab" aria-selected={view === 'pass'} className={view === 'pass' ? 'active' : ''} onClick={() => setView('pass')}>Pase de sellos</button>
        </div>

        {view === 'pass' ? (
          <LoyaltyAdmin items={items} />
        ) : loading ? (
          <p className="empty-note">Cargando códigos…</p>
        ) : error ? (
          <div className="form-msg show error">{error}</div>
        ) : (
          <>
            <div className="promo-summary">
              <div><span className="kpi-label">Activos</span><b>{rows.filter((r) => r.status.id === 'active').length}</b></div>
              <div><span className="kpi-label">Canjes</span><b>{total.uses}</b></div>
              <div><span className="kpi-label">Ventas con código</span><b>{money(Math.round(total.revenue))}</b></div>
              <div><span className="kpi-label">Descuento dado</span><b>{money(Math.round(total.discount))}</b></div>
            </div>

            {rows.length > 0 && (
              <div className="stat-toolbar">
                <div className="stat-period-tabs" role="tablist" aria-label="Filtrar códigos">
                  {FILTERS.map((f) => (
                    <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>
                  ))}
                </div>
                <Link href="/promociones/reporte" className="stat-export-btn">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M12 11v6M9.5 14.5 12 17l2.5-2.5" /></svg>
                  Reporte PDF
                </Link>
              </div>
            )}

            {rows.length === 0 ? (
              <div className="promo-empty">
                <PromoTicket promo={{ code: 'BIENVENIDO', kind: 'percent', value: 10 }} preview />
                <button type="button" className="btn btn-amber" onClick={() => setEditing('new')}>Crear el primer código</button>
              </div>
            ) : shown.length === 0 ? (
              <p className="empty-note">No hay códigos aquí.</p>
            ) : (
              <div className="promo-list">
                {shown.map((r) => (
                  <PromoTicket key={r.code.id} promo={r.code} itemName={r.itemName} status={r.status} uses={r.stats.uses} onClick={() => setOpenId(r.code.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {open && !editing && (
        <PromoCodeDetail
          promo={open.code} status={open.status} stats={open.stats} itemName={open.itemName}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditing(open.code)}
          onChanged={load}
        />
      )}
      {editing && (
        <PromoCodeForm
          promo={editing === 'new' ? null : editing}
          items={items}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </section>
  );
}
