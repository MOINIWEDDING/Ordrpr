'use client';
import { useEffect, useMemo, useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { capitalize } from '@/lib/stats';

const ROLE_LABEL = { cajero: 'Cajero', camarero: 'Camarero', comensal: 'Comensal' };
const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase();

// Cómo le fue a cada persona del equipo en el mes: los camareros con sus cuentas, ventas, propinas,
// estrellas y strikes; los cajeros con lo que cobraron.
export default function TeamPerformance() {
  const [offset, setOffset] = useState(0); // 0 = este mes
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const range = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
    return { start, end, title: capitalize(start.toLocaleDateString('es', { month: 'long', year: 'numeric' })) };
  }, [offset]);

  useEffect(() => {
    if (!BARRO_CONFIGURED) { setData({ team: [], invoices: [], ratings: [], strikes: [] }); return undefined; }
    let alive = true;
    setData(null);
    const from = range.start.toISOString(); const to = range.end.toISOString();
    Promise.all([
      sb.rpc('team_list'),
      sb.from('invoices').select('waiter_id, cashier_id, subtotal, discount, tip, total, status, kind').gte('issued_at', from).lt('issued_at', to).limit(10000),
      sb.from('waiter_ratings').select('waiter_id, stars').gte('created_at', from).lt('created_at', to),
      sb.from('waiter_strikes').select('waiter_id').is('voided_at', null).gte('created_at', from).lt('created_at', to),
    ]).then(([t, i, r, s]) => {
      if (!alive) return;
      if (t.error) setError(t.error.message);
      setData({ team: t.data || [], invoices: (i.data || []).filter((x) => x.status !== 'anulada'), ratings: r.data || [], strikes: s.data || [] });
    });
    return () => { alive = false; };
  }, [range]);

  const people = useMemo(() => {
    if (!data) return [];
    return data.team.filter((p) => !p.pending && ROLE_LABEL[p.role]).map((p) => {
      const served = data.invoices.filter((x) => x.waiter_id === p.user_id);
      const charged = data.invoices.filter((x) => x.cashier_id === p.user_id);
      const rs = data.ratings.filter((x) => x.waiter_id === p.user_id);
      return {
        ...p,
        accounts: served.length,
        sales: served.reduce((s, x) => s + Number(x.subtotal || 0) - Number(x.discount || 0), 0),
        tips: served.reduce((s, x) => s + Number(x.tip || 0), 0),
        stars: rs.length ? rs.reduce((s, x) => s + x.stars, 0) / rs.length : null,
        ratings: rs.length,
        strikes: data.strikes.filter((x) => x.waiter_id === p.user_id).length,
        charges: charged.length,
        collected: charged.reduce((s, x) => s + Number(x.total || 0), 0),
      };
    }).sort((a, b) => (b.sales + b.collected) - (a.sales + a.collected));
  }, [data]);

  return (
    <div className="perf">
      <div className="acc-nav perf-nav">
        <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label="Mes anterior"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg></button>
        <b>{range.title}</b>
        <button type="button" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} aria-label="Mes siguiente"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></button>
      </div>
      {error && <div className="form-msg show error">{error}</div>}
      {!data ? <p className="empty-note">Cargando…</p> : people.length === 0 ? (
        <p className="empty-note">Todavía no hay camareros ni cajeros en el equipo.</p>
      ) : (
        <div className="perf-grid">
          {people.map((p) => (
            <article key={p.user_id} className={`perf-card is-${p.role}`}>
              <div className="perf-head">
                <span className="perf-avatar">{initials(p.name)}</span>
                <div>
                  <b>{p.name || p.email}</b>
                  <span>{ROLE_LABEL[p.role]}</span>
                </div>
              </div>
              {p.role === 'cajero' ? (
                <dl className="perf-stats">
                  <div><dt>Cobros</dt><dd>{p.charges}</dd></div>
                  <div className="is-wide"><dt>Total cobrado</dt><dd>{money(Math.round(p.collected))}</dd></div>
                </dl>
              ) : (
                <dl className="perf-stats">
                  <div><dt>Cuentas</dt><dd>{p.accounts}</dd></div>
                  <div><dt>Ventas</dt><dd>{money(Math.round(p.sales))}</dd></div>
                  <div><dt>Propinas</dt><dd>{money(Math.round(p.tips))}</dd></div>
                  <div><dt>Estrellas</dt><dd>{p.stars === null ? '—' : <>{p.stars.toFixed(1)} <i>★</i></>}<small>{p.ratings} {p.ratings === 1 ? 'voto' : 'votos'}</small></dd></div>
                  <div className={p.strikes ? 'is-bad' : 'is-good'}><dt>Strikes</dt><dd>{p.strikes}</dd></div>
                </dl>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
