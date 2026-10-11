'use client';
import { useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useBranch } from '@/context/BranchContext';
import { useTables } from '@/hooks/useTables';

export default function TableManager() {
  const { branch, branches } = useBranch();
  const { tables, reload } = useTables(branch);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const branchName = branches.find((b) => b.id === branch)?.full;

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    if (!branch) { setError('Elige una sucursal primero (arriba, en "Cambiar").'); return; }
    const label = newLabel.trim() || `Mesa ${tables.length + 1}`;
    if (!BARRO_CONFIGURED) { setError('Conecta Supabase para guardar cambios de verdad.'); return; }
    setBusy(true);
    const nextOrder = tables.length ? Math.max(...tables.map((t) => t.sort_order || 0)) + 1 : 1;
    const { error: insertError } = await sb.from('dining_tables').insert({ branch, label, sort_order: nextOrder });
    setBusy(false);
    if (insertError) { setError(insertError.message); return; }
    setNewLabel('');
    await reload();
  }

  async function handleDelete(id) {
    if (BARRO_CONFIGURED) {
      const { error: deleteError } = await sb.from('dining_tables').delete().eq('id', id);
      if (deleteError) { alert('No se pudo eliminar: ' + deleteError.message); setDeletingId(null); return; }
    }
    setDeletingId(null);
    await reload();
  }

  if (!branch) {
    return <p className="empty-note">Elige una sucursal (arriba, en &quot;Cambiar&quot;) para administrar sus mesas.</p>;
  }

  return (
    <div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Editando las mesas de: <b>{branchName}</b></p>

      <div className="table-manager-list">
        {tables.map((t) => (
          <div className="table-chip" key={t.id}>
            <span>{t.label}</span>
            {deletingId === t.id ? (
              <span className="table-chip-confirm">
                <button type="button" onClick={() => handleDelete(t.id)}>Sí</button>
                <button type="button" onClick={() => setDeletingId(null)}>No</button>
              </span>
            ) : (
              <button type="button" className="table-chip-del" aria-label="Eliminar mesa" onClick={() => setDeletingId(t.id)}>
                <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            )}
          </div>
        ))}
        {tables.length === 0 && <p className="empty-note">Todavía no hay mesas en esta sucursal.</p>}
      </div>

      <form onSubmit={handleAdd} className="table-add-form">
        <input
          type="text"
          placeholder="Nombre de la mesa (ej. Terraza 2)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <button type="submit" className="btn btn-amber btn-sm" disabled={busy}>{busy ? 'Agregando…' : 'Agregar mesa'}</button>
      </form>
      {error && <div className="form-msg show error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
