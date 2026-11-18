'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { sb } from '@/lib/supabaseClient';
import { beep } from '@/lib/pos';

const OPTIONS = [1, 2, 3, 5, 10];
const KIND = { call: 'el llamado', bill: 'la cuenta' };
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
// Qué está pidiendo la mesa ahora: la cuenta pesa más que el llamado.
export const pendingKind = (tab) => (tab.status === 'bill' ? 'bill' : tab.call_waiter_at ? 'call' : null);

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

async function rpc(fn, args, showToast) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) { showToast(/schema cache|tab_eta/i.test(error.message) ? 'Falta actualizar la base de datos de este restaurante.' : error.message); return null; }
  return data;
}

// Los botones de una mesa que llama o pide la cuenta: «Voy en N min» o, si ya dijo un tiempo, la cuenta
// regresiva y «Ya fui».
export function EtaControls({ tab, me, onChanged, showToast, compact = false }) {
  const kind = tab.eta_kind || pendingKind(tab);
  const mine = tab.eta_at && tab.eta_by === me;
  const now = useNow(!!tab.eta_at);
  const [busy, setBusy] = useState(false);
  if (!kind) return null;

  async function go(fn, args) {
    setBusy(true);
    const data = await rpc(fn, args, showToast);
    setBusy(false);
    if (data && data.late) showToast('Llegaste tarde: se anotó un strike.');
    onChanged();
  }

  if (tab.eta_at) {
    const left = new Date(tab.eta_at).getTime() - now;
    return (
      <div className={`eta-run${left <= 30000 ? ' is-soon' : ''}${compact ? ' is-compact' : ''}`}>
        <span className="eta-run-time">{clock(left)}</span>
        <span className="eta-run-label">{mine ? `Vas a ${KIND[tab.eta_kind]}` : `${tab.eta_name || 'Alguien'} va`}</span>
        {mine && <button type="button" onClick={() => go('tab_eta_done', { tab_input: tab.id })} disabled={busy}>{tab.eta_kind === 'bill' ? 'Ya la llevé' : 'Ya fui'}</button>}
      </div>
    );
  }
  return (
    <div className={`eta-pick${compact ? ' is-compact' : ''}`}>
      <span>Voy en</span>
      {OPTIONS.map((m) => (
        <button key={m} type="button" disabled={busy} onClick={() => go('tab_eta_set', { tab_input: tab.id, minutes_input: m, kind_input: kind })}>{m}<small>min</small></button>
      ))}
    </div>
  );
}

// Vigila los tiempos del camarero: aviso 30 s antes (con más tiempo), pantalla roja a los 10 s con
// «Agregar 1 minuto» y, si se vence, avisa que se anotó un strike.
export default function EtaWatcher({ tabs, me, branch, onChanged, showToast }) {
  const reduce = useReducedMotion();
  const mine = tabs.filter((t) => t.eta_at && t.eta_by === me);
  const now = useNow(mine.length > 0);
  const warned = useRef({});
  const struck = useRef({});
  const [busy, setBusy] = useState(false);

  const withLeft = mine.map((t) => ({ t, left: new Date(t.eta_at).getTime() - now })).sort((a, b) => a.left - b.left);
  const urgent = withLeft.find((x) => x.left <= 30000 && x.left > -10000) || null;

  useEffect(() => {
    if (!urgent) return;
    const key = `${urgent.t.id}:${urgent.t.eta_at}`;
    if (!warned.current[key]) {
      warned.current[key] = true;
      beep();
      try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { /* nada */ }
    }
    if (urgent.left <= 10000 && !warned.current[`${key}:red`]) {
      warned.current[`${key}:red`] = true;
      beep();
      try { navigator.vibrate && navigator.vibrate([400, 120, 400]); } catch (e) { /* nada */ }
    }
  }, [urgent && urgent.t.id, urgent && urgent.t.eta_at, urgent && urgent.left <= 10000]); // eslint-disable-line react-hooks/exhaustive-deps

  // vencido (con los 10 s de gracia): la base anota el strike
  useEffect(() => {
    const late = withLeft.find((x) => x.left <= -10000 && !struck.current[`${x.t.id}:${x.t.eta_at}`]);
    if (!late) return;
    struck.current[`${late.t.id}:${late.t.eta_at}`] = true;
    sb.rpc('tab_eta_sweep', { branch_input: branch || null }).then(() => {
      showToast(`Se venció tu tiempo en ${late.t.table_label}: se anotó un strike.`);
      onChanged();
    });
  }); // eslint-disable-line react-hooks/exhaustive-deps

  async function extend(t, minutes) {
    setBusy(true);
    await rpc('tab_eta_extend', { tab_input: t.id, minutes_input: minutes }, showToast);
    setBusy(false);
    onChanged();
  }
  async function done(t) {
    setBusy(true);
    const data = await rpc('tab_eta_done', { tab_input: t.id }, showToast);
    setBusy(false);
    if (data && data.late) showToast('Llegaste tarde: se anotó un strike.');
    onChanged();
  }

  const red = urgent && urgent.left <= 10000;
  return (
    <AnimatePresence>
      {urgent && !red && (
        <motion.div key="soon" className="eta-alert" role="alertdialog" aria-label="Se acaba tu tiempo"
          initial={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
          <div className="eta-alert-top">
            <span className="eta-alert-time">{clock(urgent.left)}</span>
            <div>
              <b>{urgent.t.table_label}</b>
              <span>Se acaba tu tiempo para {KIND[urgent.t.eta_kind]}</span>
            </div>
          </div>
          <div className="eta-alert-actions">
            {[1, 2, 5].map((m) => <button key={m} type="button" disabled={busy} onClick={() => extend(urgent.t, m)}>+{m} min</button>)}
            <button type="button" className="is-done" disabled={busy} onClick={() => done(urgent.t)}>{urgent.t.eta_kind === 'bill' ? 'Ya la llevé' : 'Ya fui'}</button>
          </div>
        </motion.div>
      )}
      {red && (
        <motion.div key="red" className="eta-red" role="alertdialog" aria-label="Te quedan segundos"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="eta-red-body">
            <span className="eta-red-table">{urgent.t.table_label}</span>
            <span className="eta-red-time">{clock(urgent.left)}</span>
            <span className="eta-red-label">{urgent.left > 0 ? `para ${KIND[urgent.t.eta_kind]}` : 'Se acabó el tiempo'}</span>
          </div>
          <div className="eta-red-actions">
            <button type="button" className="is-big" disabled={busy} onClick={() => extend(urgent.t, 1)}>Agregar 1 minuto</button>
            <button type="button" disabled={busy} onClick={() => done(urgent.t)}>{urgent.t.eta_kind === 'bill' ? 'Ya la llevé' : 'Ya fui'}</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
