'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useBranch } from '@/context/BranchContext';
import { BARRO_CONFIGURED, sb } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { promoStatus, promoSummary, promoWindow } from '@/lib/promo';
import { loadPromoData, missingPromoTables, promoDaily, promoStats } from '@/lib/promoStats';
import BrandLogo from '@/components/BrandLogo';
import { SalesChart } from '@/components/StatsReport';

// Reporte en PDF (A4) de los códigos promocionales, con el mismo diseño que el de estadísticas:
//   /promociones/reporte               todos los códigos
//   /promociones/reporte?codigo=<id>   un código
export default function PromoReport() {
  const params = useSearchParams();
  const router = useRouter();
  const { profile, isStaff } = useAuth();
  const { settings } = useSettings();
  const { branchInfo } = useBranch();
  const codeId = params.get('codigo');
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile && !isStaff) router.push('/');
  }, [profile, isStaff, router]);

  useEffect(() => {
    document.body.classList.add('report-mode');
    return () => document.body.classList.remove('report-mode');
  }, []);

  useEffect(() => {
    if (!isStaff) return;
    if (!BARRO_CONFIGURED) { setData({ codes: [], redemptions: [], orders: [] }); return; }
    let alive = true;
    Promise.all([loadPromoData(), sb.from('menu_items').select('id, name')])
      .then(([d, menu]) => { if (alive) { setData(d); setItems(menu.data || []); } })
      .catch((err) => { if (alive) setError(missingPromoTables(err) ? 'Falta actualizar la base de datos de este restaurante.' : err.message); });
    return () => { alive = false; };
  }, [isStaff]);

  const brand = settings.brand_name || 'Mi Restaurante';
  const code = data && codeId ? data.codes.find((c) => c.id === codeId) : null;

  useEffect(() => {
    const before = document.title;
    document.title = `Reporte ${brand} ${code ? code.code : 'codigos promocionales'}`;
    return () => { document.title = before; };
  }, [brand, code]);

  if (!profile || !isStaff) return null;

  return (
    <div className="rp-page">
      <div className="rp-toolbar">
        <Link href="/promociones" className="rp-back">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Promociones
        </Link>
        {data && (!codeId || code) && (
          <button type="button" className="btn btn-amber rp-print" onClick={() => window.print()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
            Descargar PDF
          </button>
        )}
      </div>

      {error ? (
        <div className="form-msg show error">{error}</div>
      ) : !data ? (
        <p className="empty-note">Preparando el reporte…</p>
      ) : codeId && !code ? (
        <p className="empty-note">Este código ya no existe.</p>
      ) : code ? (
        <CodeReport code={code} data={data} items={items} brand={brand} place={branchInfo ? branchInfo.full : settings.city} />
      ) : (
        <AllCodesReport data={data} items={items} brand={brand} place={branchInfo ? branchInfo.full : settings.city} />
      )}
    </div>
  );
}

const round = (v) => money(Math.round(v));
const shortDate = (d) => new Date(d).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
const itemNameOf = (items, id) => (items.find((i) => i.id === id) || {}).name;

function Head({ brand, place, kind, title }) {
  return (
    <div className="rp-head">
      <div className="rp-brand">
        <BrandLogo className="rp-logo" alt="" />
        <div>
          <b>{brand}</b>
          {place && <span>{place}</span>}
        </div>
      </div>
      <div className="rp-kind">
        <span>{kind}</span>
        <b className="rp-mono">{title}</b>
      </div>
    </div>
  );
}

function Foot({ brand, place }) {
  return (
    <div className="rp-foot">
      <span>{brand}{place ? ` · ${place}` : ''}</span>
      <span>Generado el {new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
    </div>
  );
}

function CodeReport({ code, data, items, brand, place }) {
  const stats = useMemo(() => promoStats(code, data), [code, data]);
  const status = promoStatus(code, stats.uses);
  const days = promoDaily(code, stats, 62);
  const chart = days.map((d, i) => ({
    value: d.sales, prev: 0,
    label: days.length <= 10 || i === 0 || (i + 1) % 5 === 0 ? String(d.date.getDate()) : '',
  }));
  const limit = Number(code.max_uses) || 0;
  const kpis = [
    { label: 'Canjes', value: limit ? `${stats.uses} de ${limit}` : String(stats.uses) },
    { label: 'Pedidos', value: String(stats.orderCount) },
    { label: 'Descuento dado', value: round(stats.discount) },
    { label: 'Ticket promedio', value: round(stats.avgTicket) },
    { label: 'Con cuenta', value: stats.orderCount ? `${Math.round((stats.withAccount / stats.orderCount) * 100)}%` : '—', note: `${stats.withAccount} con cuenta · ${stats.guests} invitados` },
    { label: 'Último canje', value: stats.lastUse ? shortDate(stats.lastUse) : '—' },
  ];
  return (
    <article className="rp">
      <section className="rp-sheet">
        <Head brand={brand} place={place} kind="Reporte de código" title={code.code} />
        <div className="rp-legend">
          <span><span className={`promo-pill is-${status.id}`}>{status.label}</span></span>
          <span>{promoSummary(code, itemNameOf(items, code.item_id))}{code.title ? ` · ${code.title}` : ''}</span>
          <span>{promoWindow(code, true)}</span>
        </div>

        <div className="rp-hero">
          <span className="rp-label">Ventas con el código</span>
          <div className="rp-hero-row">
            <span className="rp-hero-value">{round(stats.revenue)}</span>
            <span className="rp-hero-compare"><span>Creado el {shortDate(code.created_at)}</span></span>
          </div>
        </div>

        <div className="rp-kpis">
          {kpis.map((k) => (
            <div key={k.label} className="rp-kpi">
              <span className="rp-label">{k.label}</span>
              <span className="rp-kpi-value">{k.value}</span>
              {k.note && <span className="rp-kpi-foot"><span>{k.note}</span></span>}
            </div>
          ))}
        </div>

        <div className="rp-block rp-chart">
          <h3 className="rp-h">Ventas con el código por día<span>{days.length > 1 ? `${shortDate(days[0].date)} – ${shortDate(days[days.length - 1].date)}` : ''}</span></h3>
          <SalesChart data={chart} />
        </div>

        <div className="rp-two">
          <div className="rp-block">
            <h3 className="rp-h">Condiciones</h3>
            <table className="rp-table">
              <tbody>
                <tr><td>Compra mínima</td><td>{Number(code.min_subtotal) > 0 ? round(code.min_subtotal) : 'Ninguna'}</td></tr>
                <tr><td>Límite de canjes</td><td>{limit || 'Sin límite'}</td></tr>
                <tr><td>Una vez por cliente</td><td>{code.once_per_customer ? 'Sí' : 'No'}</td></tr>
                <tr><td>Estado</td><td>{status.label}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="rp-block">
            <h3 className="rp-h">Mensaje al canjear</h3>
            <p className="rp-quote">{code.redeem_message || 'Sin mensaje.'}</p>
          </div>
        </div>
      </section>

      <section className="rp-sheet">
        <div className="rp-block">
          <h3 className="rp-h">Productos en pedidos con el código<span>Unidades</span></h3>
          <table className="rp-table">
            <thead><tr><th className="rp-rank">#</th><th className="rp-name">Producto</th><th>Vendidos</th><th>Ventas</th></tr></thead>
            <tbody>
              {stats.products.length ? stats.products.slice(0, 10).map((p, i) => (
                <tr key={p.name}><td className="rp-rank">{i + 1}</td><td className="rp-name">{p.name}</td><td><b>{p.qty}</b></td><td>{round(p.revenue)}</td></tr>
              )) : <tr><td colSpan={4} className="rp-empty">Todavía nadie lo ha usado.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="rp-block">
          <h3 className="rp-h">Pedidos<span>{stats.orders.length > 25 ? 'Los 25 más recientes' : `${stats.orders.length} en total`}</span></h3>
          <table className="rp-table">
            <thead><tr><th>Fecha</th><th className="rp-name">Cliente</th><th>Pago</th><th>Descuento</th><th>Total</th></tr></thead>
            <tbody>
              {stats.orders.length ? stats.orders.slice(0, 25).map((o) => (
                <tr key={o.id}>
                  <td>{new Date(o.created_at).toLocaleString('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                  <td className="rp-name">{o.customer_name || 'Cliente'}</td>
                  <td>{{ efectivo: 'Efectivo', tarjeta: 'Tarjeta', gift_card: 'Gift card' }[o.payment_method] || o.payment_method || '—'}</td>
                  <td>{Number(o.promo.discount) > 0 ? `−${money(o.promo.discount)}` : '—'}</td>
                  <td><b>{money(Number(o.subtotal || 0) + Number(o.tax_amount || 0))}</b></td>
                </tr>
              )) : <tr><td colSpan={5} className="rp-empty">Sin pedidos.</td></tr>}
            </tbody>
          </table>
        </div>
        <Foot brand={brand} place={place} />
      </section>
    </article>
  );
}

function AllCodesReport({ data, items, brand, place }) {
  const total = useMemo(() => promoStats(null, data), [data]);
  const rows = useMemo(() => data.codes.filter((c) => c.source !== 'loyalty').map((c) => {
    const s = promoStats(c, data);
    return { c, s, status: promoStatus(c, s.uses) };
  }).sort((a, b) => b.s.revenue - a.s.revenue || b.s.uses - a.s.uses), [data]);
  // pedidos con códigos que ya se eliminaron
  const deleted = data.orders.filter((o) => !data.codes.some((c) => c.id === (o.promo && o.promo.code_id)));
  const days = promoDaily(null, total, 31);
  const chart = days.map((d, i) => ({ value: d.sales, prev: 0, label: i === 0 || (i + 1) % 5 === 0 ? String(d.date.getDate()) : '' }));
  const active = rows.filter((r) => r.status.id === 'active').length;

  return (
    <article className="rp">
      <section className="rp-sheet">
        <Head brand={brand} place={place} kind="Reporte de promociones" title="Códigos" />
        <div className="rp-hero">
          <span className="rp-label">Ventas con códigos</span>
          <div className="rp-hero-row">
            <span className="rp-hero-value">{round(total.revenue)}</span>
            <span className="rp-hero-compare"><span>{total.orderCount} pedido{total.orderCount === 1 ? '' : 's'}</span></span>
          </div>
        </div>
        <div className="rp-kpis">
          <div className="rp-kpi"><span className="rp-label">Códigos</span><span className="rp-kpi-value">{rows.length}</span><span className="rp-kpi-foot"><span>{active} activo{active === 1 ? '' : 's'}</span></span></div>
          <div className="rp-kpi"><span className="rp-label">Canjes</span><span className="rp-kpi-value">{total.uses}</span></div>
          <div className="rp-kpi"><span className="rp-label">Descuento dado</span><span className="rp-kpi-value">{round(total.discount)}</span></div>
          <div className="rp-kpi"><span className="rp-label">Ticket promedio</span><span className="rp-kpi-value">{round(total.avgTicket)}</span></div>
          <div className="rp-kpi"><span className="rp-label">Con cuenta</span><span className="rp-kpi-value">{total.withAccount}</span></div>
          <div className="rp-kpi"><span className="rp-label">Invitados</span><span className="rp-kpi-value">{total.guests}</span></div>
        </div>
        <div className="rp-block rp-chart">
          <h3 className="rp-h">Ventas con códigos por día<span>Últimos {days.length} días</span></h3>
          <SalesChart data={chart} />
        </div>
      </section>

      <section className="rp-sheet">
        <div className="rp-block">
          <h3 className="rp-h">Cada código</h3>
          <table className="rp-table">
            <thead><tr><th>Código</th><th className="rp-name">Qué hace</th><th>Estado</th><th>Canjes</th><th>Descuento</th><th>Ventas</th></tr></thead>
            <tbody>
              {rows.length ? rows.map(({ c, s, status }) => (
                <tr key={c.id}>
                  <td><b className="rp-mono">{c.code}</b></td>
                  <td className="rp-name">{promoSummary(c, itemNameOf(items, c.item_id))}<small className="rp-sub">{promoWindow(c)}</small></td>
                  <td>{status.label}</td>
                  <td>{c.max_uses ? `${s.uses}/${c.max_uses}` : s.uses}</td>
                  <td>{round(s.discount)}</td>
                  <td><b>{round(s.revenue)}</b></td>
                </tr>
              )) : <tr><td colSpan={6} className="rp-empty">Todavía no hay códigos.</td></tr>}
              {deleted.length > 0 && (
                <tr>
                  <td colSpan={3}>Códigos eliminados</td>
                  <td>{deleted.length}</td>
                  <td>{round(deleted.reduce((sum, o) => sum + Number(o.promo.discount || 0), 0))}</td>
                  <td><b>{round(deleted.reduce((sum, o) => sum + Number(o.subtotal || 0), 0))}</b></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Foot brand={brand} place={place} />
      </section>
    </article>
  );
}
