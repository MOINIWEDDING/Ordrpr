'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import { ORDER_STATUS, PAY_METHODS, PAY_LABEL, tabTotals, minutesSince, useLiveReload, beep } from '@/lib/pos';
import StaffPayments from '@/components/TabPayments';
import { sendToPrinters } from '@/lib/print/send';
import { printReceipt } from '@/lib/printReceipt';
import { Prefactura } from '@/components/Receipt';
import ProductPicker, { TicketDraft, addLine, ordersFromLines } from '@/components/ProductPicker';
import Modal from '@/components/Modal';
import { kickEcf } from '@/lib/ecf/kick';

// Caja: el plano de mesas con sus cuentas, y desde cada una agregar productos, sacar la prefactura,
// cobrar (dividido, mixto, con propina, descuento y RNC) y cerrar con su factura. También venta rápida.
export default function CajaPage() {
  const { profile, canUsePos, authReady, isCashier } = useAuth();
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
  const [waiters, setWaiters] = useState([]);
  const [error, setError] = useState('');
  const [openTableId, setOpenTableId] = useState(null);
  const [quickSale, setQuickSale] = useState(false);
  const [callsSeen, setCallsSeen] = useState(0);

  useEffect(() => {
    if (authReady && profile && !canUsePos) router.push('/');
  }, [authReady, profile, canUsePos, router]);

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED || !branch) return;
    await sb.rpc('tab_eta_sweep', { branch_input: branch }); // los tiempos vencidos se vuelven strikes
    const { data: t, error: err } = await sb.from('tabs').select('*').eq('branch', branch).in('status', ['open', 'bill']);
    if (err) { setError(/tabs|schema cache/i.test(err.message || '') ? 'Falta actualizar la base de datos de este restaurante para usar la caja.' : err.message); return; }
    setError('');
    setTabs(t || []);
    const ids = (t || []).map((x) => x.id);
    if (ids.length) {
      const { data: o } = await sb.from('orders').select('id, tab_id, customer_name, items, subtotal, tax_amount, status, created_at, waiter_id, tab_payment_id').in('tab_id', ids).order('created_at');
      setOrders(o || []);
      const { data: pp } = await sb.from('tab_payments').select('id, tab_id').eq('status', 'pending').in('tab_id', ids);
      setPendingPays(pp || []);
    } else { setOrders([]); setPendingPays([]); }
  }, [branch]);
  useEffect(() => { load(); }, [load]);
  useLiveReload(['tabs', 'orders'], load);
  useEffect(() => {
    if (!BARRO_CONFIGURED || !canUsePos) return;
    sb.rpc('pos_waiters').then(({ data }) => setWaiters(data || []));
  }, [canUsePos]);

  // aviso cuando una mesa llama al camarero o pide la cuenta
  // a la caja solo le toca lo que se cobra: cuentas pedidas y avisos de pago (los llamados son del camarero)
  const calls = tabs.filter((t) => (!isCashier && t.call_waiter_at) || t.status === 'bill').length + (isCashier ? pendingPays.length : 0);
  useEffect(() => { if (calls > callsSeen) beep(); setCallsSeen(calls); }, [calls]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabByTable = useMemo(() => Object.fromEntries(tabs.filter((t) => t.table_id).map((t) => [t.table_id, t])), [tabs]);
  const ordersByTab = useMemo(() => {
    const m = {};
    orders.filter((o) => !o.tab_payment_id).forEach((o) => { (m[o.tab_id] = m[o.tab_id] || []).push(o); });
    return m;
  }, [orders]);

  if (!profile || !canUsePos) return null;

  const openTable = tables.find((t) => t.id === openTableId);
  const business = { brand_name: settings.brand_name, legal_name: settings.business_legal_name, rnc: settings.business_rnc, address: settings.address, phone: settings.phone, logo_url: settings.logo_url, currency_symbol: settings.currency_symbol, currency_position: settings.currency_position };

  return (
    <section className="pos-page">
      <div className="pos-wrap">
        <div className="pos-head">
          <div>
            <p className="eyebrow">{branchInfo ? branchInfo.full : 'Elige una sucursal'}</p>
            <h2>Caja</h2>
          </div>
          <div className="pos-head-actions">
            {calls > 0 && <span className="pos-alert">{calls} {calls === 1 ? 'mesa te necesita' : 'mesas te necesitan'}</span>}
            <button type="button" className="btn btn-amber" onClick={() => setQuickSale(true)}>Venta rápida</button>
          </div>
        </div>

        {error && <div className="form-msg show error">{error}</div>}
        {!branch && <p className="empty-note">Elige la sucursal en Cuenta para ver sus mesas.</p>}
        {branch && tables.length === 0 && (
          <p className="empty-note">Esta sucursal no tiene mesas. Agrégalas en Cuenta → Tu negocio → Sucursales y mesas.</p>
        )}

        <div className="pos-tables">
          {tables.map((tb) => {
            const tab = tabByTable[tb.id];
            const tOrders = tab ? ordersByTab[tab.id] || [] : [];
            const tot = tab ? tabTotals(tOrders, charges).total : 0;
            const state = !tab ? 'free' : tab.status === 'bill' ? 'bill' : 'busy';
            return (
              <button key={tb.id} type="button" className={`pos-table is-${state}${tab && tab.call_waiter_at && !isCashier ? ' is-calling' : ''}`} onClick={() => setOpenTableId(tb.id)}>
                <span className="pos-table-name">{tb.label}</span>
                {tab ? (
                  <>
                    <span className="pos-table-total">{money(tot)}</span>
                    <span className="pos-table-meta">{tab.guests} pers. · {minutesSince(tab.created_at)} min</span>
                    {tab.status === 'bill' && <span className="pos-table-flag">Pide la cuenta</span>}
                    {tab.call_waiter_at && tab.status !== 'bill' && !isCashier && <span className="pos-table-flag">Llama</span>}
                    {tab.status !== 'bill' && (!tab.call_waiter_at || isCashier) && pendingPays.some((p) => p.tab_id === tab.id) && <span className="pos-table-flag">Quiere pagar</span>}
                  </>
                ) : <span className="pos-table-meta">Libre</span>}
              </button>
            );
          })}
        </div>
      </div>

      {openTable && (
        <TabPanel
          cashier={isCashier}
          table={openTable}
          tab={tabByTable[openTable.id] || null}
          tables={tables}
          tabByTable={tabByTable}
          items={items}
          categories={categories}
          charges={charges}
          taxPercent={totalPercent}
          waiters={waiters}
          business={business}
          branch={branch}
          onClose={() => setOpenTableId(null)}
          onChanged={load}
          showToast={showToast}
        />
      )}
      {quickSale && (
        <QuickSale items={items} categories={categories} taxPercent={totalPercent} branch={branch} onClose={() => setQuickSale(false)} showToast={showToast} router={router} />
      )}
    </section>
  );
}

// Una mesa: abrir su cuenta o manejar la que tiene.
function TabPanel({ table, tab, tables, tabByTable, items, categories, charges, taxPercent, waiters, business, branch, onClose, onChanged, showToast, cashier }) {
  const [detail, setDetail] = useState(null);
  const [mode, setMode] = useState('view'); // view | add | bill | pay | move
  const [lines, setLines] = useState([]);
  const [person, setPerson] = useState('');
  const [busy, setBusy] = useState(false);
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState('');

  const loadDetail = useCallback(async () => {
    if (!tab) { setDetail(null); return; }
    const { data } = await sb.rpc('tab_get', { tab_input: tab.id, code_input: null });
    setDetail(data || null);
  }, [tab]);
  useEffect(() => { loadDetail(); }, [loadDetail, tab && tab.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  async function open() {
    setBusy(true);
    const { data, error } = await sb.rpc('tab_open', { table_input: table.id, name_input: name.trim(), guests_input: guests });
    setBusy(false);
    if (error || !data || !data.ok) { showToast(error ? error.message : 'No se pudo abrir la cuenta.'); return; }
    onChanged();
  }

  async function staff(action, value) {
    const { error } = await sb.rpc('tab_staff_update', { tab_input: tab.id, action_input: action, value_input: value || null });
    if (error) { showToast(error.message); return false; }
    onChanged();
    loadDetail();
    return true;
  }

  async function sendLines() {
    setBusy(true);
    const orders = ordersFromLines(lines, taxPercent, detail.opened_name || 'Mesa');
    for (const o of orders) {
      const { error } = await sb.rpc('tab_add_order', { tab_input: tab.id, code_input: null, order_input: o });
      if (error) { setBusy(false); showToast(error.message); return; }
    }
    setBusy(false);
    setLines([]);
    setMode('view');
    showToast('Enviado a la cocina');
    onChanged();
    loadDetail();
  }

  async function printBill() {
    const r = await sendToPrinters({ role: 'caja', kind: 'prefactura', branch, payload: { tab: due, charges, business } });
    showToast(r.error || `Enviada a ${r.sent} ${r.sent === 1 ? 'impresora' : 'impresoras'}`);
  }

  const people = detail ? [...new Set(detail.orders.map((o) => o.customer_name).filter(Boolean))] : [];
  // lo que ya pagó cada quien desde su teléfono no se vuelve a cobrar
  const unpaid = detail ? detail.orders.filter((o) => !o.paid) : [];
  const due = detail ? { ...detail, orders: unpaid } : null;
  const totals = detail ? tabTotals(unpaid, charges) : null;

  return (
    <Modal onClose={onClose} wide>
      <div className="pe pos-panel">
        <div className="pe-head">
          <p className="eyebrow">{tab ? `Cuenta #${tab.number}` : 'Mesa libre'}</p>
          <h3>{table.label}</h3>
        </div>

        {!tab && cashier ? (
          <p className="empty-note">Esta mesa no tiene cuenta abierta. La abre el camarero o el cliente con el QR.</p>
        ) : !tab ? (
          <div className="pos-open">
            <div className="field">
              <label htmlFor="posName">A nombre de <span className="muted">(opcional)</span></label>
              <input id="posName" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del cliente" />
            </div>
            <div className="field">
              <label>Personas</label>
              <div className="qty-stepper">
                <button type="button" onClick={() => setGuests((n) => Math.max(1, n - 1))} aria-label="Menos">–</button>
                <span>{guests}</span>
                <button type="button" onClick={() => setGuests((n) => Math.min(50, n + 1))} aria-label="Más">+</button>
              </div>
            </div>
            <button type="button" className="btn btn-amber btn-block" onClick={open} disabled={busy}>{busy ? 'Abriendo…' : 'Abrir cuenta'}</button>
          </div>
        ) : !detail ? <p className="empty-note">Cargando…</p> : mode === 'add' ? (
          <div className="pos-add">
            <ProductPicker items={items} categories={categories} showIngredients={false} onAdd={(sel) => setLines((ls) => addLine(ls, sel, person))} />
            <TicketDraft lines={lines} setLines={setLines} people={people} person={person} setPerson={setPerson} onSend={sendLines} sending={busy} />
            <button type="button" className="pos-back" onClick={() => { setMode('view'); setLines([]); }}>Volver a la cuenta</button>
          </div>
        ) : mode === 'bill' ? (
          <div className="pos-receipt-modal">
            <div className="print-target"><Prefactura tab={due} charges={charges} business={business} /></div>
            <div className="pos-row">
              <button type="button" className="btn btn-ghost" onClick={printReceipt}>Imprimir aquí</button>
              <button type="button" className="btn btn-amber" onClick={printBill}>Enviar a impresora</button>
            </div>
            <button type="button" className="pos-back" onClick={() => setMode('view')}>Volver a la cuenta</button>
          </div>
        ) : mode === 'pay' ? (
          <PaySheet tab={due} charges={charges} onCancel={() => setMode('view')} onPaid={(invoiceId) => { onChanged(); onClose(); if (invoiceId) window.location.href = `/factura/${invoiceId}`; }} showToast={showToast} />
        ) : mode === 'move' ? (
          <div className="pos-move">
            <p>¿A qué mesa pasa esta cuenta?</p>
            <div className="pos-tables is-small">
              {tables.filter((t) => t.id !== table.id && !tabByTable[t.id]).map((t) => (
                <button key={t.id} type="button" className="pos-table is-free" onClick={async () => { if (await staff('move', t.id)) onClose(); }}>{t.label}</button>
              ))}
            </div>
            <button type="button" className="pos-back" onClick={() => setMode('view')}>Volver</button>
          </div>
        ) : (
          <>
            <div className="pos-tab-info">
              <span>{detail.opened_name || 'Sin nombre'} · {detail.guests} pers. · código <b>{detail.code}</b></span>
              {cashier ? (
                <span className="pos-waiter-name">{(waiters.find((w) => w.id === detail.waiter_id) || {}).name || 'Sin camarero'}</span>
              ) : (
                <select value={detail.waiter_id || ''} onChange={(e) => staff('assign_waiter', e.target.value)} aria-label="Camarero">
                  <option value="">Sin camarero</option>
                  {waiters.map((w) => <option key={w.id} value={w.id}>{w.name || 'Camarero'}</option>)}
                </select>
              )}
            </div>
            {detail.call_waiter_at && !cashier && (
              <div className="pos-call">
                <span>La mesa llamó al camarero</span>
                <button type="button" onClick={() => staff('clear_call')}>Atendido</button>
              </div>
            )}
            {detail.status === 'bill' && <div className="pos-call is-bill"><span>Pidieron la cuenta</span></div>}
            <StaffPayments tab={detail} onChanged={() => { onChanged(); loadDetail(); }} showToast={showToast} />

            <div className="pos-orders">
              {detail.orders.length === 0 && <p className="empty-note">Todavía no hay pedidos.</p>}
              {detail.orders.map((o) => {
                const st = ORDER_STATUS[o.status] || ORDER_STATUS.nueva;
                return (
                  <div key={o.id} className={`pos-order${o.paid ? ' is-paid' : ''}`}>
                    <div className="pos-order-top"><b>{o.customer_name || 'Pedido'}</b>{o.paid ? <span className="pos-chip is-paid">Pagado</span> : <span className={`pos-chip is-${st.tone}`}>{st.label}</span>}</div>
                    {o.items.map((it, i) => (
                      <div key={i} className="pos-order-line">
                        <span>{it.qty}× {it.name}{it.options && it.options.length ? <small>{describeOptions(it.options)}</small> : null}{it.notes ? <small>{it.notes}</small> : null}</span>
                        <span>{money(it.price * it.qty)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="pos-sum">
              <div><span>Consumo</span><span>{money(totals.gross)}</span></div>
              {totals.taxLines.map((l) => <div key={l.label}><span>{l.label} ({l.percent}%)</span><span>{money(l.amount)}</span></div>)}
              <div className="pos-sum-total"><span>{unpaid.length < detail.orders.length ? 'Falta por cobrar' : 'Total'}</span><span>{money(totals.total)}</span></div>
            </div>

            <div className={`pos-actions${cashier ? ' is-cashier' : ''}`}>
              {!cashier && <button type="button" className="btn btn-ghost" onClick={() => { setPerson(people[0] || detail.opened_name || ''); setMode('add'); }}>Agregar</button>}
              <button type="button" className="btn btn-ghost" onClick={() => setMode('bill')} disabled={!unpaid.length}>Prefactura</button>
              <button type="button" className="btn btn-amber pos-pay" onClick={() => setMode('pay')} disabled={!unpaid.length}>Cobrar {money(totals.total)}</button>
            </div>
            {!cashier && <div className="pos-more">
              <button type="button" onClick={() => setMode('move')}>Cambiar de mesa</button>
              {detail.status === 'bill' && <button type="button" onClick={() => staff('reopen')}>Seguir pidiendo</button>}
              {detail.orders.length === 0 && <button type="button" onClick={async () => { if (await staff('cancel')) onClose(); }}>Cancelar cuenta</button>}
            </div>}
          </>
        )}
      </div>
    </Modal>
  );
}

// Cobro: descuento, propina, división y pagos (uno o varios métodos), datos fiscales.
function PaySheet({ tab, charges, onCancel, onPaid, showToast }) {
  const { settings } = useSettings();
  const sym = settings.currency_symbol || '$';
  const [discount, setDiscount] = useState('');
  const [tipPct, setTipPct] = useState(0);
  const [tipCustom, setTipCustom] = useState('');
  const [split, setSplit] = useState('one'); // one | equal | person
  const [parts, setParts] = useState(tab.guests || 2);
  const [payments, setPayments] = useState([{ method: 'efectivo', amount: '' }]);
  const [received, setReceived] = useState('');
  const [fiscalOn, setFiscalOn] = useState(false);
  const [fiscal, setFiscal] = useState({ type: 'credito_fiscal', rnc: '', name: '' });
  const [busy, setBusy] = useState(false);

  const base = tabTotals(tab.orders, charges, { discount: Number(discount) || 0 });
  const tip = tipCustom !== '' ? Number(tipCustom) || 0 : Math.round((base.net * tipPct) / 100);
  const t = tabTotals(tab.orders, charges, { discount: Number(discount) || 0, tip });
  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const left = Math.max(0, Math.round((t.total - paid) * 100) / 100);

  // cuánto le toca a cada persona: su consumo más su parte proporcional de impuestos, descuento y propina
  const byPerson = useMemo(() => {
    const m = {};
    tab.orders.forEach((o) => { m[o.customer_name || 'Sin nombre'] = (m[o.customer_name || 'Sin nombre'] || 0) + Number(o.subtotal || 0); });
    const factor = t.gross ? t.total / t.gross : 0;
    return Object.entries(m).map(([who, sub]) => ({ who, amount: Math.round(sub * factor) }));
  }, [tab.orders, t.gross, t.total]);

  useEffect(() => {
    if (split === 'one') setPayments((ps) => (ps.length === 1 ? [{ ...ps[0], amount: String(t.total) }] : ps));
  }, [split, t.total]);

  function fillParts(list) {
    setPayments(list.map((amount) => ({ method: 'efectivo', amount: String(amount) })));
  }

  async function pay() {
    if (paid + 0.5 < t.total) { showToast(`Faltan ${money(left)} por cobrar`); return; }
    const rnc = fiscal.rnc.replace(/[^0-9]/g, '');
    if (fiscalOn && rnc.length !== 9 && rnc.length !== 11) { showToast('El RNC tiene 9 dígitos o la cédula 11.'); return; }
    setBusy(true);
    const { data, error } = await sb.rpc('tab_close', {
      tab_input: tab.id,
      payments_input: payments.filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method, amount: Number(p.amount) })),
      tip_input: t.tip,
      discount_input: t.discount,
      fiscal_input: fiscalOn ? { type: fiscal.type, rnc, name: fiscal.name.trim() } : {},
      name_input: null,
    });
    setBusy(false);
    if (error) { showToast(error.message); return; }
    showToast('Cuenta cobrada');
    kickEcf();
    onPaid(data);
  }

  const cash = payments.find((p) => p.method === 'efectivo');
  const change = cash && Number(received) > 0 ? Number(received) - Number(cash.amount || 0) : null;

  return (
    <div className="pay-sheet">
      <div className="pay-grid-2">
        <div className="field">
          <label htmlFor="payDisc">Descuento</label>
          <div className="pe-money"><span>−</span><input id="payDisc" type="number" min="0" inputMode="numeric" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
        </div>
        <div className="field">
          <label>Propina</label>
          <div className="pe-link-chips">
            {[0, 5, 10, 15].map((p) => <button key={p} type="button" className={`pe-link-chip${tipCustom === '' && tipPct === p ? ' active' : ''}`} onClick={() => { setTipPct(p); setTipCustom(''); }}>{p ? `${p}%` : 'No'}</button>)}
            <input className="pay-tip-input" type="number" min="0" inputMode="numeric" placeholder="Otra" value={tipCustom} onChange={(e) => setTipCustom(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="pos-sum">
        <div><span>Consumo</span><span>{money(t.gross)}</span></div>
        {t.discount > 0 && <div><span>Descuento</span><span>−{money(t.discount)}</span></div>}
        {t.taxLines.map((l) => <div key={l.label}><span>{l.label} ({l.percent}%)</span><span>{money(l.amount)}</span></div>)}
        {t.tip > 0 && <div><span>Propina</span><span>{money(t.tip)}</span></div>}
        <div className="pos-sum-total"><span>Total</span><span>{money(t.total)}</span></div>
      </div>

      <div className="seg-buttons seg-buttons-sm" role="group" aria-label="Dividir">
        {[['one', 'Una cuenta'], ['equal', 'Partes iguales'], ['person', 'Por persona']].map(([k, label]) => (
          <button key={k} type="button" className={split === k ? 'active' : ''} onClick={() => {
            setSplit(k);
            if (k === 'equal') { const each = Math.floor(t.total / parts); fillParts([...Array(parts - 1).fill(each), t.total - each * (parts - 1)]); }
            if (k === 'person') { const amounts = byPerson.map((p) => p.amount); amounts[amounts.length - 1] += t.total - amounts.reduce((s, a) => s + a, 0); fillParts(amounts); }
            if (k === 'one') setPayments([{ method: 'efectivo', amount: String(t.total) }]);
          }}>{label}</button>
        ))}
      </div>
      {split === 'equal' && (
        <div className="pay-parts">
          <span>Entre</span>
          <div className="qty-stepper">
            <button type="button" onClick={() => { const n = Math.max(2, parts - 1); setParts(n); const each = Math.floor(t.total / n); fillParts([...Array(n - 1).fill(each), t.total - each * (n - 1)]); }} aria-label="Menos">–</button>
            <span>{parts}</span>
            <button type="button" onClick={() => { const n = Math.min(30, parts + 1); setParts(n); const each = Math.floor(t.total / n); fillParts([...Array(n - 1).fill(each), t.total - each * (n - 1)]); }} aria-label="Más">+</button>
          </div>
          <span>{money(Math.ceil(t.total / parts))} c/u</span>
        </div>
      )}

      <div className="pay-rows">
        {payments.map((p, i) => (
          <div key={i} className="pay-row">
            {split === 'person' && byPerson[i] && <span className="pay-row-who">{byPerson[i].who}</span>}
            <select value={p.method} onChange={(e) => setPayments((ps) => ps.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))}>
              {PAY_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <div className="pe-money"><span>{sym}</span><input type="number" min="0" inputMode="decimal" value={p.amount} onChange={(e) => setPayments((ps) => ps.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} /></div>
            {payments.length > 1 && <button type="button" className="pay-row-del" onClick={() => setPayments((ps) => ps.filter((_, j) => j !== i))} aria-label="Quitar pago">×</button>}
          </div>
        ))}
        <button type="button" className="pos-back" onClick={() => setPayments((ps) => [...ps, { method: 'tarjeta', amount: left ? String(left) : '' }])}>+ Otro pago</button>
      </div>

      {cash && (
        <div className="pay-cash">
          <label htmlFor="payReceived">Efectivo recibido</label>
          <div className="pe-money"><span>{sym}</span><input id="payReceived" type="number" min="0" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={cash.amount || '0'} /></div>
          {change !== null && <b className={change < 0 ? 'neg' : ''}>{change < 0 ? `Faltan ${money(-change)}` : `Devuelta ${money(change)}`}</b>}
        </div>
      )}

      <label className={`pe-toggle${fiscalOn ? ' on' : ''} pay-fiscal-toggle`} htmlFor="payFiscal">
        <span className="pe-toggle-text"><b>Factura con RNC</b></span>
        <input id="payFiscal" type="checkbox" role="switch" checked={fiscalOn} onChange={(e) => setFiscalOn(e.target.checked)} />
        <span className="pe-switch" aria-hidden="true" />
      </label>
      {fiscalOn && (
        <div className="pay-fiscal">
          <div className="seg-buttons seg-buttons-sm">
            {[['credito_fiscal', 'Crédito fiscal'], ['consumo', 'Consumidor final']].map(([k, label]) => (
              <button key={k} type="button" className={fiscal.type === k ? 'active' : ''} onClick={() => setFiscal((f) => ({ ...f, type: k }))}>{label}</button>
            ))}
          </div>
          <input type="text" inputMode="numeric" placeholder="RNC o cédula" value={fiscal.rnc} onChange={(e) => setFiscal((f) => ({ ...f, rnc: e.target.value }))} />
          <input type="text" placeholder="Razón social o nombre" value={fiscal.name} onChange={(e) => setFiscal((f) => ({ ...f, name: e.target.value }))} />
        </div>
      )}

      <div className="pay-status">
        <span>Cobrado {money(paid)} de {money(t.total)}</span>
        {left > 0 && <b>Faltan {money(left)}</b>}
      </div>
      <div className="pos-row">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Volver</button>
        <button type="button" className="btn btn-amber" onClick={pay} disabled={busy || paid + 0.5 < t.total}>{busy ? 'Cobrando…' : 'Cobrar y cerrar'}</button>
      </div>
    </div>
  );
}

// Venta de mostrador sin mesa: se cobra al momento y queda facturada.
function QuickSale({ items, categories, taxPercent, branch, onClose, showToast, router }) {
  const [lines, setLines] = useState([]);
  const [name, setName] = useState('');
  const [method, setMethod] = useState('efectivo');
  const [busy, setBusy] = useState(false);
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const tax = Math.round((subtotal * taxPercent) / 100);

  async function charge() {
    if (!branch) { showToast('Elige la sucursal primero.'); return; }
    setBusy(true);
    const id = crypto.randomUUID();
    const { error } = await sb.from('orders').insert({
      id, customer_name: name.trim() || 'Mostrador', table_number: 'Mostrador', branch, status: 'nueva',
      items: lines.map((l) => ({ id: l.id, name: l.name, price: l.price, qty: l.qty, notes: l.notes || '', options: l.options })),
      subtotal, tax_amount: tax, payment_method: method,
    });
    if (error) { setBusy(false); showToast(error.message); return; }
    const { data: inv } = await sb.rpc('invoice_for_order', { order_input: id });
    kickEcf();
    setBusy(false);
    showToast('Venta cobrada');
    if (inv) router.push(`/factura/${inv}`); else onClose();
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="pe pos-panel">
        <div className="pe-head">
          <p className="eyebrow">Caja</p>
          <h3>Venta rápida</h3>
        </div>
        <div className="pos-add">
          <ProductPicker items={items} categories={categories} showIngredients={false} onAdd={(sel) => setLines((ls) => addLine(ls, sel, ''))} />
          <div>
            <TicketDraft lines={lines} setLines={setLines} people={[]} />
            <div className="field">
              <label htmlFor="qsName">Cliente <span className="muted">(opcional)</span></label>
              <input id="qsName" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="pe-link-chips" style={{ margin: '10px 0' }}>
              {PAY_METHODS.filter((m) => m.id !== 'gift_card').map((m) => <button key={m.id} type="button" className={`pe-link-chip${method === m.id ? ' active' : ''}`} onClick={() => setMethod(m.id)}>{m.label}</button>)}
            </div>
            <button type="button" className="btn btn-amber btn-block" onClick={charge} disabled={!lines.length || busy}>
              {busy ? 'Cobrando…' : `Cobrar ${money(subtotal + tax)} en ${PAY_LABEL[method].toLowerCase()}`}
            </button>
          </div>
        </div>
        <Link href="/ordenes" className="pos-back">Ver órdenes</Link>
      </div>
    </Modal>
  );
}
