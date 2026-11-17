'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useBranch } from '@/context/BranchContext';
import { sendToPrinters } from '@/lib/print/send';

// Impresoras por internet (prueba): cada una tiene una dirección secreta que se pone en la impresora.
// Star CloudPRNT y Epson Server Direct Print la consultan solas; la virtual se ve en el navegador.
const KINDS = [
  { id: 'virtual', label: 'Virtual (de prueba)' },
  { id: 'star', label: 'Star (CloudPRNT)' },
  { id: 'epson', label: 'Epson (Server Direct Print)' },
];
const ROLES = [
  { id: 'cocina', label: 'Comandas de cocina' },
  { id: 'bar', label: 'Comandas de bar' },
  { id: 'caja', label: 'Caja (prefacturas y facturas)' },
];

const ago = (d) => {
  if (!d) return 'Nunca se ha conectado';
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 1 ? 'Conectada ahora' : m < 60 ? `Conectada hace ${m} min` : `Última conexión ${new Date(d).toLocaleString('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`;
};

export default function PrinterManager() {
  const { branches } = useBranch();
  const [printers, setPrinters] = useState([]);
  const [form, setForm] = useState({ name: '', role: 'cocina', kind: 'virtual', paper: 80, branch: '' });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) return;
    const { data, error } = await sb.from('printers').select('*').order('created_at');
    if (error) { setMsg({ type: 'error', text: /printers|schema cache/i.test(error.message || '') ? 'Falta actualizar la base de datos de este restaurante.' : error.message }); return; }
    setPrinters(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    if (!form.name.trim()) { setMsg({ type: 'error', text: 'Ponle un nombre (ej. Cocina principal).' }); return; }
    setBusy(true);
    const { error } = await sb.from('printers').insert({ name: form.name.trim(), role: form.role, kind: form.kind, paper: Number(form.paper), branch: form.branch || null });
    setBusy(false);
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setForm((f) => ({ ...f, name: '' }));
    setMsg({ type: 'ok', text: 'Impresora agregada.' });
    load();
  }

  async function test(p) {
    const r = await sendToPrinters({ printerId: p.id, kind: 'prueba', payload: { printer: p.name } });
    setMsg(r.error ? { type: 'error', text: r.error } : { type: 'ok', text: `Prueba enviada a ${p.name}.` });
  }

  async function toggle(p) {
    await sb.from('printers').update({ enabled: !p.enabled }).eq('id', p.id);
    load();
  }

  async function remove(p) {
    if (!window.confirm(`¿Quitar la impresora ${p.name}?`)) return;
    await sb.from('printers').delete().eq('id', p.id);
    load();
  }

  const url = (p) => `${typeof window !== 'undefined' ? window.location.origin : ''}/api/print/${p.kind}/${p.token}`;
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); setMsg({ type: 'ok', text: 'Dirección copiada.' }); } catch (e) { /* nada */ } };

  return (
    <div className="printer-manager">
      {printers.length === 0 ? <p className="empty-note">Todavía no hay impresoras.</p> : (
        <div className="printer-list">
          {printers.map((p) => (
            <div key={p.id} className={`printer-row${p.enabled ? '' : ' is-off'}`}>
              <div className="printer-row-top">
                <b>{p.name}</b>
                <span className="role-tag">{(ROLES.find((r) => r.id === p.role) || {}).label}</span>
              </div>
              <small>{(KINDS.find((k) => k.id === p.kind) || {}).label} · {p.paper} mm{p.branch ? ` · ${(branches.find((b) => b.id === p.branch) || {}).full || p.branch}` : ''}{p.kind !== 'virtual' ? ` · ${ago(p.last_seen_at)}` : ''}</small>
              {p.kind !== 'virtual' && (
                <button type="button" className="printer-url" onClick={() => copy(url(p))} title="Copiar">
                  <span>{p.kind === 'star' ? 'URL de CloudPRNT' : 'URL de Server Direct Print'}</span>
                  <code>{url(p)}</code>
                </button>
              )}
              <div className="printer-actions">
                <button type="button" onClick={() => test(p)} disabled={!p.enabled}>Imprimir prueba</button>
                {p.kind === 'virtual' && <Link href={`/impresora/${p.id}`}>Abrir impresora virtual</Link>}
                <button type="button" onClick={() => toggle(p)}>{p.enabled ? 'Pausar' : 'Activar'}</button>
                <button type="button" onClick={() => remove(p)}>Quitar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={add} className="branch-form">
        <h4 style={{ marginBottom: 10 }}>Agregar impresora</h4>
        <div className="field">
          <label htmlFor="prName">Nombre</label>
          <input id="prName" type="text" maxLength={40} placeholder="Cocina principal" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="pe-money-row printer-form-row">
          <div className="field">
            <label htmlFor="prRole">Imprime</label>
            <select id="prRole" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="prKind">Tipo</label>
            <select id="prKind" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
              {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </div>
        </div>
        <div className="pe-money-row">
          <div className="field">
            <label htmlFor="prPaper">Papel</label>
            <select id="prPaper" value={form.paper} onChange={(e) => setForm((f) => ({ ...f, paper: e.target.value }))}>
              <option value={80}>80 mm</option>
              <option value={58}>58 mm</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="prBranch">Sucursal</label>
            <select id="prBranch" value={form.branch} onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}>
              <option value="">Todas</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.full}</option>)}
            </select>
          </div>
        </div>
        {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
        <button type="submit" className="btn btn-amber" disabled={busy}>{busy ? 'Agregando…' : 'Agregar impresora'}</button>
      </form>
    </div>
  );
}
