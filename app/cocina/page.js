'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { useToast } from '@/context/ToastContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useMenuItems } from '@/hooks/useMenuItems';
import { useCategories } from '@/hooks/useCategories';
import { describeOptions } from '@/lib/productOptions';
import { stationOf, minutesSince, useLiveReload, beep } from '@/lib/pos';

const STATIONS = [
  { id: 'all', label: 'Todo' },
  { id: 'cocina', label: 'Cocina' },
  { id: 'bar', label: 'Bar' },
];
const STATION_KEY = 'rp-kds-station';

// Pantalla de comandas: los pedidos por preparar de la sucursal, por estación, con la mesa, a nombre
// de quién van, el tiempo que llevan y las notas. «Empezar» y «Listo» avisan al camarero y al cliente.
export default function CocinaPage() {
  const { profile, canManageOrders, authReady } = useAuth();
  const router = useRouter();
  const { branch, branchInfo } = useBranch();
  const { showToast } = useToast();
  const { allItems: items } = useMenuItems();
  const { categories } = useCategories();
  const [orders, setOrders] = useState([]);
  const [station, setStation] = useState('all');
  const [, setTick] = useState(0);
  const seen = useRef(null);

  useEffect(() => {
    if (authReady && profile && !canManageOrders) router.push('/');
  }, [authReady, profile, canManageOrders, router]);
  useEffect(() => {
    try { const s = window.localStorage.getItem(STATION_KEY); if (s) setStation(s); } catch (e) { /* nada */ }
    document.body.classList.add('kds-mode');
    const t = setInterval(() => setTick((n) => n + 1), 30000); // refresca los minutos
    return () => { document.body.classList.remove('kds-mode'); clearInterval(t); };
  }, []);

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED || !branch) return;
    const since = new Date(Date.now() - 12 * 3600000).toISOString();
    const { data } = await sb.from('orders').select('id, customer_name, table_number, items, status, station_status, created_at, tab_id')
      .eq('branch', branch).in('status', ['nueva', 'en_preparacion', 'lista']).gte('created_at', since).order('created_at');
    setOrders(data || []);
  }, [branch]);
  useEffect(() => { load(); }, [load]);
  useLiveReload(['orders'], load, 10000);

  const menuById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const catByName = useMemo(() => Object.fromEntries(categories.map((c) => [c.name, c])), [categories]);

  // cada pedido con solo las líneas de esta estación, y si esta estación ya lo terminó
  const tickets = orders.map((o) => {
    const lines = (o.items || []).map((it) => ({ ...it, station: stationOf(it, menuById, catByName) }));
    const mine = station === 'all' ? lines : lines.filter((l) => l.station === station);
    const stations = [...new Set(lines.map((l) => l.station))];
    const doneHere = station === 'all' ? o.status === 'lista' : (o.station_status || {})[station] === 'lista' || o.status === 'lista';
    return { ...o, lines: mine, stations, doneHere };
  }).filter((t) => t.lines.length > 0);

  const fresh = tickets.filter((t) => !t.doneHere && t.status === 'nueva');
  const cooking = tickets.filter((t) => !t.doneHere && t.status !== 'nueva');
  const done = tickets.filter((t) => t.doneHere).slice(-8).reverse();

  useEffect(() => {
    const ids = new Set(fresh.map((t) => t.id));
    if (seen.current && [...ids].some((id) => !seen.current.has(id))) beep();
    seen.current = ids;
  }, [fresh.map((t) => t.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickStation(s) {
    setStation(s);
    try { window.localStorage.setItem(STATION_KEY, s); } catch (e) { /* nada */ }
  }

  async function update(t, next) {
    let patch;
    if (next === 'start') patch = { status: 'en_preparacion' };
    else if (station === 'all') patch = { status: 'lista' };
    else {
      // listo en esta estación; el pedido queda listo cuando todas sus estaciones terminan
      const ss = { ...(t.station_status || {}), [station]: 'lista' };
      const allDone = t.stations.every((s) => ss[s] === 'lista');
      patch = { station_status: ss, ...(allDone ? { status: 'lista' } : t.status === 'nueva' ? { status: 'en_preparacion' } : {}) };
    }
    const prevStatus = t.status;
    setOrders((os) => os.map((o) => (o.id === t.id ? { ...o, ...patch } : o)));
    const { error } = await sb.from('orders').update(patch).eq('id', t.id);
    if (error) { showToast(error.message); load(); return; }
    // el aviso al cliente sale igual que desde Órdenes
    if (patch.status && patch.status !== prevStatus) {
      import('@/lib/push').then(({ sendOrderPush }) => sendOrderPush(t.id)).catch(() => {});
      if (prevStatus === 'nueva') import('@/lib/loyalty').then(({ notifyWallet }) => notifyWallet({ orderId: t.id })).catch(() => {});
    }
  }

  async function undo(t) {
    const patch = station === 'all' ? { status: 'en_preparacion' } : { station_status: { ...(t.station_status || {}), [station]: null }, status: 'en_preparacion' };
    const { error } = await sb.from('orders').update(patch).eq('id', t.id);
    if (error) showToast(error.message); else load();
  }

  if (!profile || !canManageOrders) return null;

  return (
    <section className="kds">
      <div className="kds-head">
        <div>
          <h2>Comandas</h2>
          <span>{branchInfo ? branchInfo.full : ''}</span>
        </div>
        <div className="kds-stations" role="tablist" aria-label="Estación">
          {STATIONS.map((s) => <button key={s.id} type="button" role="tab" aria-selected={station === s.id} className={station === s.id ? 'active' : ''} onClick={() => pickStation(s.id)}>{s.label}</button>)}
        </div>
      </div>

      <div className="kds-cols">
        <KdsColumn title="Nuevos" tickets={fresh} action="Empezar" onAction={(t) => update(t, 'start')} secondary="Listo" onSecondary={(t) => update(t, 'done')} />
        <KdsColumn title="Preparando" tickets={cooking} action="Listo" onAction={(t) => update(t, 'done')} />
        <KdsColumn title="Listos" tickets={done} action="Deshacer" onAction={undo} muted />
      </div>
    </section>
  );
}

function KdsColumn({ title, tickets, action, onAction, secondary, onSecondary, muted }) {
  return (
    <div className={`kds-col${muted ? ' is-muted' : ''}`}>
      <h3>{title} <span>{tickets.length}</span></h3>
      {tickets.length === 0 && <p className="kds-empty">Nada por aquí</p>}
      {tickets.map((t) => {
        const mins = minutesSince(t.created_at);
        return (
          <article key={t.id} className={`kds-ticket${mins >= 20 ? ' is-late' : mins >= 10 ? ' is-slow' : ''}`}>
            <div className="kds-ticket-head">
              <b>{t.table_number || 'Pedido'}</b>
              <span className="kds-time">{mins} min</span>
            </div>
            <div className="kds-who">Para <b>{t.customer_name || 'Sin nombre'}</b>{t.table_number === 'Pick up' ? ' · para llevar' : ''}</div>
            <ul>
              {t.lines.map((l, i) => (
                <li key={i}>
                  <span className="kds-qty">{l.qty}</span>
                  <span>
                    {l.name}
                    {l.options && l.options.length > 0 && <small>{describeOptions(l.options)}</small>}
                    {l.notes && <em>{l.notes}</em>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="kds-ticket-foot">
              {secondary && <button type="button" className="kds-btn ghost" onClick={() => onSecondary(t)}>{secondary}</button>}
              <button type="button" className={`kds-btn${muted ? ' ghost' : ''}`} onClick={() => onAction(t)}>{action}</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
