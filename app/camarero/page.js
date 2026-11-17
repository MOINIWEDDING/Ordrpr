'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useMenuItems, money } from '@/hooks/useMenuItems';
import { useCategories } from '@/hooks/useCategories';
import { useTables } from '@/hooks/useTables';
import { useTaxSettings } from '@/hooks/useTaxSettings';
import { describeOptions } from '@/lib/productOptions';
import { ORDER_STATUS, tabTotals, minutesSince, useLiveReload, beep } from '@/lib/pos';
import { sendToPrinters } from '@/lib/print/send';
import ProductPicker, { TicketDraft, addLine, ordersFromLines } from '@/components/ProductPicker';
import Modal from '@/components/Modal';
import StaffPayments from '@/components/TabPayments';

// El camarero: sus mesas, lo que está listo para servir y la carta con fotos grandes, precio e
// ingredientes para tomar pedidos por persona y mandarlos a la cocina.
export default function CamareroPage() {
  const { profile, canUsePos, authReady } = useAuth();
  const router = useRouter();
  const { branch, branchInfo } = useBranch();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const { tables } = useTables(branch);
  const { allItems: items } = useMenuItems();
  const { categories } = useCategories();
  const { charges, totalPercent } = useTaxSettings(branch);
  const [tabs, setTabs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [pendingPays, setPendingPays] = useState([]);
  const paysSeen = useRef(0);
  const [error, setError] = useState('');
  const [openTableId, setOpenTableId] = useState(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const readySeen = useRef(0);

  useEffect(() => {
    if (authReady && profile && !canUsePos) router.push('/');
  }, [authReady, profile, canUsePos, router]);

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED || !branch) return;
    const { data: t, error: err } = await sb.from('tabs').select('*').eq('branch', branch).in('status', ['open', 'bill']);
    if (err) { setError(/tabs|schema cache/i.test(err.message || '') ? 'Falta actualizar la base de datos de este restaurante.' : err.message); return; }
    setError('');
    setTabs(t || []);
    const ids = (t || []).map((x) => x.id);
    if (ids.length) {
      const { data: o } = await sb.from('orders').select('id, tab_id, customer_name, items, subtotal, tax_amount, status, created_at, table_number, tab_payment_id').in('tab_id', ids).order('created_at');
      setOrders(o || []);
      const { data: pp } = await sb.from('tab_payments').select('id, tab_id').eq('status', 'pending').in('tab_id', ids);
      setPendingPays(pp || []);
    } else { setOrders([]); setPendingPays([]); }
  }, [branch]);
  useEffect(() => { load(); }, [load]);
  useLiveReload(['tabs', 'orders'], load, 12000);

  const me = profile ? profile.id : null;
  const myTabIds = new Set(tabs.filter((t) => t.waiter_id === me).map((t) => t.id));
  const ready = orders.filter((o) => o.status === 'lista' && (!onlyMine || myTabIds.has(o.tab_id)));
  useEffect(() => { if (ready.length > readySeen.current) beep(); readySeen.current = ready.length; }, [ready.length]);
  // alguien quiere pagar su parte: el camarero va a cobrarle
  useEffect(() => { if (pendingPays.length > paysSeen.current) beep(); paysSeen.current = pendingPays.length; }, [pendingPays.length]);

  const tabByTable = useMemo(() => Object.fromEntries(tabs.filter((t) => t.table_id).map((t) => [t.table_id, t])), [tabs]);
  const ordersByTab = useMemo(() => {
    const m = {};
    orders.filter((o) => !o.tab_payment_id).forEach((o) => { (m[o.tab_id] = m[o.tab_id] || []).push(o); });
    return m;
  }, [orders]);

  async function served(order) {
    const { error: err } = await sb.from('orders').update({ status: 'entregada' }).eq('id', order.id);
    if (err) showToast(err.message); else load();
  }

  if (!profile || !canUsePos) return null;
  const shownTables = tables.filter((tb) => !onlyMine || (tabByTable[tb.id] && tabByTable[tb.id].waiter_id === me));
  const openTable = tables.find((t) => t.id === openTableId);
  const business = { brand_name: settings.brand_name, legal_name: settings.business_legal_name, rnc: settings.business_rnc, address: settings.address, phone: settings.phone, logo_url: settings.logo_url, currency_symbol: settings.currency_symbol, currency_position: settings.currency_position };

  return (
    <section className="pos-page">
      <div className="pos-wrap">
        <div className="pos-head">
          <div>
            <p className="eyebrow">{branchInfo ? branchInfo.full : ''}</p>
            <h2>Mesas</h2>
          </div>
          <div className="seg-buttons seg-buttons-sm pos-filter">
            <button type="button" className={!onlyMine ? 'active' : ''} onClick={() => setOnlyMine(false)}>Todas</button>
            <button type="button" className={onlyMine ? 'active' : ''} onClick={() => setOnlyMine(true)}>Mías</button>
          </div>
        </div>
        {error && <div className="form-msg show error">{error}</div>}

        {ready.length > 0 && (
          <div className="ready-list">
            <h3>Listo para servir</h3>
            {ready.map((o) => (
              <div key={o.id} className="ready-card">
                <div>
                  <b>{o.table_number}</b>
                  <span>{o.customer_name}</span>
                  <small>{o.items.map((it) => `${it.qty}× ${it.name}`).join(' · ')}</small>
                </div>
                <button type="button" className="btn btn-amber btn-sm" onClick={() => served(o)}>Servido</button>
              </div>
            ))}
          </div>
        )}

        <div className="pos-tables">
          {shownTables.map((tb) => {
            const tab = tabByTable[tb.id];
            const tOrders = tab ? ordersByTab[tab.id] || [] : [];
            const state = !tab ? 'free' : tab.status === 'bill' ? 'bill' : 'busy';
            return (
              <button key={tb.id} type="button" className={`pos-table is-${state}${tab && tab.call_waiter_at ? ' is-calling' : ''}${tab && tab.waiter_id === me ? ' is-mine' : ''}`} onClick={() => setOpenTableId(tb.id)}>
                <span className="pos-table-name">{tb.label}</span>
                {tab ? (
                  <>
                    <span className="pos-table-total">{money(tabTotals(tOrders, charges).total)}</span>
                    <span className="pos-table-meta">{tab.guests} pers. · {minutesSince(tab.created_at)} min</span>
                    {tab.call_waiter_at && <span className="pos-table-flag">Llama</span>}
                    {tab.status === 'bill' && <span className="pos-table-flag">Pide la cuenta</span>}
                    {pendingPays.some((p) => p.tab_id === tab.id) && <span className="pos-table-flag">Quiere pagar</span>}
                  </>
                ) : <span className="pos-table-meta">Libre</span>}
              </button>
            );
          })}
          {shownTables.length === 0 && <p className="empty-note">{onlyMine ? 'No tienes mesas asignadas.' : 'Esta sucursal no tiene mesas.'}</p>}
        </div>
      </div>

      {openTable && (
        <WaiterTable
          table={openTable} tab={tabByTable[openTable.id] || null} items={items} categories={categories}
          charges={charges} taxPercent={totalPercent} business={business} branch={branch}
          onClose={() => setOpenTableId(null)} onChanged={load} showToast={showToast}
        />
      )}
    </section>
  );
}

function WaiterTable({ table, tab, items, categories, charges, taxPercent, business, branch, onClose, onChanged, showToast }) {
  const [detail, setDetail] = useState(null);
  const [lines, setLines] = useState([]);
  const [person, setPerson] = useState('');
  const [busy, setBusy] = useState(false);
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState('');
  const [showOrders, setShowOrders] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!tab) { setDetail(null); return; }
    const { data } = await sb.rpc('tab_get', { tab_input: tab.id, code_input: null });
    setDetail(data || null);
    if (data && !person) setPerson((data.orders[0] && data.orders[0].customer_name) || data.opened_name || '');
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadDetail(); }, [loadDetail, tab && tab.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  async function open() {
    setBusy(true);
    const { data, error } = await sb.rpc('tab_open', { table_input: table.id, name_input: name.trim(), guests_input: guests });
    setBusy(false);
    if (error || !data || !data.ok) { showToast(error ? error.message : 'No se pudo abrir la cuenta.'); return; }
    onChanged();
  }

  async function send() {
    setBusy(true);
    for (const o of ordersFromLines(lines, taxPercent, detail.opened_name || table.label)) {
      const { error } = await sb.rpc('tab_add_order', { tab_input: tab.id, code_input: null, order_input: o });
      if (error) { setBusy(false); showToast(error.message); return; }
    }
    setBusy(false);
    setLines([]);
    showToast('Enviado a la cocina');
    onChanged();
    loadDetail();
  }

  async function staff(action) {
    const { error } = await sb.rpc('tab_staff_update', { tab_input: tab.id, action_input: action, value_input: null });
    if (error) showToast(error.message); else { onChanged(); loadDetail(); }
  }

  async function printBill() {
    const r = await sendToPrinters({ role: 'caja', kind: 'prefactura', branch, payload: { tab: detail, charges, business } });
    showToast(r.error || 'Prefactura enviada a la caja');
  }

  const people = detail ? [...new Set(detail.orders.map((o) => o.customer_name).filter(Boolean))] : [];
  const t = detail ? tabTotals(detail.orders.filter((o) => !o.paid), charges) : null;

  return (
    <Modal onClose={onClose} wide>
      <div className="pe pos-panel waiter-panel">
        <div className="pe-head">
          <p className="eyebrow">{tab ? `Cuenta #${tab.number}` : 'Mesa libre'}</p>
          <h3>{table.label}</h3>
        </div>
        {!tab ? (
          <div className="pos-open">
            <div className="field">
              <label htmlFor="wName">A nombre de <span className="muted">(opcional)</span></label>
              <input id="wName" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>Personas</label>
              <div className="qty-stepper">
                <button type="button" onClick={() => setGuests((n) => Math.max(1, n - 1))} aria-label="Menos">–</button>
                <span>{guests}</span>
                <button type="button" onClick={() => setGuests((n) => Math.min(50, n + 1))} aria-label="Más">+</button>
              </div>
            </div>
            <button type="button" className="btn btn-amber btn-block" onClick={open} disabled={busy}>{busy ? 'Abriendo…' : 'Abrir mesa'}</button>
          </div>
        ) : !detail ? <p className="empty-note">Cargando…</p> : (
          <>
            {(detail.call_waiter_at || detail.status === 'bill') && (
              <div className={`pos-call${detail.status === 'bill' ? ' is-bill' : ''}`}>
                <span>{detail.status === 'bill' ? 'Pidieron la cuenta' : 'La mesa te llamó'}</span>
                {detail.call_waiter_at && <button type="button" onClick={() => staff('clear_call')}>Atendido</button>}
                {detail.status === 'bill' && <button type="button" onClick={printBill}>Imprimir prefactura</button>}
              </div>
            )}
            <StaffPayments tab={detail} onChanged={() => { onChanged(); loadDetail(); }} showToast={showToast} />
            <button type="button" className="waiter-summary" onClick={() => setShowOrders((v) => !v)}>
              <span>{detail.orders.length} {detail.orders.length === 1 ? 'pedido' : 'pedidos'} · {money(t.total)}</span>
              <span>{showOrders ? 'Ocultar' : 'Ver lo pedido'}</span>
            </button>
            {showOrders && (
              <div className="pos-orders">
                {detail.orders.map((o) => {
                  const st = ORDER_STATUS[o.status] || ORDER_STATUS.nueva;
                  return (
                    <div key={o.id} className={`pos-order${o.paid ? ' is-paid' : ''}`}>
                      <div className="pos-order-top"><b>{o.customer_name}</b>{o.paid ? <span className="pos-chip is-paid">Pagado</span> : <span className={`pos-chip is-${st.tone}`}>{st.label}</span>}<small>{minutesSince(o.created_at)} min</small></div>
                      {o.items.map((it, i) => <div key={i} className="pos-order-line"><span>{it.qty}× {it.name}{it.options && it.options.length ? <small>{describeOptions(it.options)}</small> : null}</span></div>)}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="pos-add">
              <ProductPicker items={items} categories={categories} big onAdd={(sel) => setLines((ls) => addLine(ls, sel, person))} />
              <TicketDraft lines={lines} setLines={setLines} people={people.length ? people : [detail.opened_name].filter(Boolean)} person={person} setPerson={setPerson} onSend={send} sending={busy} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
