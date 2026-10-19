'use client';
import { useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useBranch } from '@/context/BranchContext';
import HoursPicker from './HoursPicker';

function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'sucursal';
}

const EMPTY = { name: '', address: '', phone: '', hours: '' };

export default function BranchesManager({ onChange }) {
  const { reloadBranches } = useBranch();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setRows([]); setLoading(false); return; }
    const { data } = await sb.from('branches').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    setRows(data || []);
    setLoading(false);
    if (onChange) onChange(data || []);
  }, [onChange]);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function startEdit(b) {
    setEditingId(b.id);
    setForm({ name: b.name || '', address: b.address || '', phone: b.phone || '', hours: b.hours || '' });
    setError('');
  }
  function cancel() { setEditingId(null); setForm(EMPTY); setError(''); }

  async function refreshAll() { await load(); await reloadBranches(); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const name = form.name.trim();
    if (!name) { setError('Escribe el nombre de la sucursal.'); return; }
    if (!BARRO_CONFIGURED) { setError('Conecta Supabase para guardar de verdad.'); return; }
    setBusy(true);
    let err = null;
    if (editingId) {
      ({ error: err } = await sb.from('branches').update({
        name, address: form.address.trim(), phone: form.phone.trim(), hours: form.hours.trim(),
      }).eq('id', editingId));
    } else {
      // el identificador se genera del nombre y no cambia aunque luego renombres la sucursal
      let id = slugify(name);
      const taken = new Set(rows.map((r) => r.id));
      let n = 2; const base = id;
      while (taken.has(id)) { id = `${base}_${n++}`; }
      const sort_order = rows.length ? Math.max(...rows.map((r) => r.sort_order || 0)) + 1 : 1;
      ({ error: err } = await sb.from('branches').insert({
        id, name, address: form.address.trim(), phone: form.phone.trim(), hours: form.hours.trim(), sort_order, active: true,
      }));
    }
    setBusy(false);
    if (err) { setError(err.message); return; }
    cancel();
    await refreshAll();
  }

  async function toggleActive(b) {
    const { error: err } = await sb.from('branches').update({ active: !b.active }).eq('id', b.id);
    if (err) { setError(err.message); return; }
    await refreshAll();
  }

  async function handleDelete(b) {
    if (!window.confirm(`¿Eliminar la sucursal "${b.name}"? Sus pedidos anteriores se conservan, pero ya no podrás elegirla.`)) return;
    const { error: err } = await sb.from('branches').delete().eq('id', b.id);
    if (err) { setError(err.message); return; }
    await refreshAll();
  }

  return (
    <div className="branches-manager">
      {loading ? null : rows.length === 0 ? (
        <p className="empty-note">Aún no has agregado ninguna sucursal. Agrega al menos una para empezar a recibir pedidos.</p>
      ) : (
        <div className="branch-rows">
          {rows.map((b) => (
            <div key={b.id} className={`branch-row${b.active ? '' : ' inactive'}`}>
              <div>
                <b>{b.name}</b>{!b.active && <span className="role-tag" style={{ marginLeft: 8 }}>Oculta</span>}
                <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>{[b.address, b.phone].filter(Boolean).join(' · ') || 'Sin dirección todavía'}</span>
              </div>
              <div className="branch-actions">
                <button type="button" onClick={() => startEdit(b)}>Editar</button>
                <button type="button" onClick={() => toggleActive(b)}>{b.active ? 'Ocultar' : 'Mostrar'}</button>
                <button type="button" onClick={() => handleDelete(b)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="branch-form">
        <h4 style={{ marginBottom: 10 }}>{editingId ? 'Editar sucursal' : 'Agregar sucursal'}</h4>
        <div className="field"><label htmlFor="brName">Nombre</label><input id="brName" type="text" value={form.name} onChange={set('name')} placeholder="Ej. Centro, Plaza Norte, Sucursal Principal" maxLength={50} /></div>
        <div className="field"><label htmlFor="brAddr">Dirección</label><input id="brAddr" type="text" value={form.address} onChange={set('address')} placeholder="Calle, número, sector" /></div>
        <div className="field"><label htmlFor="brPhone">Teléfono</label><input id="brPhone" type="tel" value={form.phone} onChange={set('phone')} /></div>
        <div className="field"><label htmlFor="brHours">Horario</label><HoursPicker id="brHours" value={form.hours} onChange={(hours) => setForm((f) => ({ ...f, hours }))} /></div>
        {error && <div className="form-msg show error">{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button type="submit" className="btn btn-amber" disabled={busy}>{busy ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar sucursal'}</button>
          {editingId && <button type="button" className="btn btn-ghost" onClick={cancel}>Cancelar</button>}
        </div>
      </form>
    </div>
  );
}
