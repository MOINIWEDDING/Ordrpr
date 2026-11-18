'use client';
import { useEffect, useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { DAY_LABELS } from '@/lib/stats';

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

// Lo que sirve para atraer y traer de vuelta a los clientes: clientes nuevos y los que vuelven, newsletter,
// códigos promocionales, pase de sellos, días con más pedidos y cómo califican a los camareros.
export default function MarketingStats({ orders, profiles, range }) {
  const [extra, setExtra] = useState(null);
  const key = range ? `${range.start.toISOString()}|${range.end.toISOString()}` : 'todo';

  useEffect(() => {
    if (!BARRO_CONFIGURED) { setExtra({ promos: [], codes: [], loyalty: [], ratings: [] }); return undefined; }
    let alive = true;
    const inRange = (q) => (range ? q.gte('created_at', range.start.toISOString()).lt('created_at', range.end.toISOString()) : q);
    Promise.all([
      inRange(sb.from('promo_redemptions').select('code_id, user_id, created_at')),
      sb.from('promo_codes').select('id, code, title'),
      inRange(sb.from('loyalty_events').select('kind, user_id, created_at')),
      inRange(sb.from('waiter_ratings').select('stars, created_at')),
    ]).then(([p, c, l, r]) => {
      if (alive) setExtra({ promos: p.data || [], codes: c.data || [], loyalty: l.data || [], ratings: r.data || [] });
    });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const inR = (d) => !range || (new Date(d) >= range.start && new Date(d) < range.end);
  const newClients = profiles.filter((p) => inR(p.created_at)).length;
  const newsletterTotal = profiles.filter((p) => p.newsletter && !p.newsletter_unsub_at).length;
  const newsletterNew = profiles.filter((p) => p.newsletter && p.newsletter_at && inR(p.newsletter_at)).length;
  const byUser = {};
  orders.forEach((o) => { if (o.user_id) byUser[o.user_id] = (byUser[o.user_id] || 0) + 1; });
  const buyers = Object.keys(byUser).length;
  const returning = Object.values(byUser).filter((n) => n > 1).length;
  const weekday = Array(7).fill(0);
  orders.forEach((o) => { weekday[new Date(o.created_at).getDay()] += 1; });
  const weekOrder = [1, 2, 3, 4, 5, 6, 0];
  const weekMax = Math.max(1, ...weekday);

  const codeName = {};
  (extra ? extra.codes : []).forEach((c) => { codeName[c.id] = c.code; });
  const promoCount = {};
  (extra ? extra.promos : []).forEach((p) => { promoCount[p.code_id] = (promoCount[p.code_id] || 0) + 1; });
  const topPromos = Object.entries(promoCount).map(([id, n]) => ({ code: codeName[id] || 'Código', n })).sort((a, b) => b.n - a.n).slice(0, 5);
  const stamps = extra ? extra.loyalty.filter((e) => e.kind === 'stamp' || e.kind === 'manual').length : 0;
  const rewards = extra ? extra.loyalty.filter((e) => e.kind === 'reward').length : 0;
  const ratings = extra ? extra.ratings : [];
  const avgStars = ratings.length ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : 0;

  return (
    <div className="mkt">
      <div className="mkt-tiles">
        <div className="mkt-tile"><span>Clientes nuevos</span><b>{newClients}</b><small>{profiles.length} en total</small></div>
        <div className="mkt-tile"><span>Volvieron a pedir</span><b>{returning}</b><small>{pct(returning, buyers)} de quienes pidieron con cuenta</small></div>
        <div className="mkt-tile"><span>Newsletter</span><b>{newsletterTotal}</b><small>{newsletterNew} nuevos en el periodo</small></div>
        <div className="mkt-tile"><span>Sellos dados</span><b>{stamps}</b><small>{rewards} {rewards === 1 ? 'premio canjeado' : 'premios canjeados'}</small></div>
        <div className="mkt-tile"><span>Códigos canjeados</span><b>{extra ? extra.promos.length : '…'}</b><small>{topPromos[0] ? `El más usado: ${topPromos[0].code}` : 'Ninguno en el periodo'}</small></div>
        <div className="mkt-tile"><span>Atención de camareros</span><b>{ratings.length ? `${avgStars.toFixed(1)} ★` : '—'}</b><small>{ratings.length} {ratings.length === 1 ? 'calificación' : 'calificaciones'}</small></div>
      </div>

      <div className="mkt-two">
        <div className="mkt-card">
          <h3>Pedidos por día de la semana</h3>
          <div className="mkt-week">
            {weekOrder.map((d) => (
              <div key={d} className="mkt-week-col">
                <span className="mkt-week-bar"><i style={{ height: `${(weekday[d] / weekMax) * 100}%` }} /></span>
                <b>{weekday[d]}</b>
                <small>{DAY_LABELS[d]}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="mkt-card">
          <h3>Códigos promocionales más usados</h3>
          {topPromos.length === 0 ? <p className="acc-note">Nadie canjeó códigos en este periodo.</p> : (
            <ul className="mkt-list">
              {topPromos.map((p) => <li key={p.code}><span className="mkt-code">{p.code}</span><b>{p.n}</b></li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
