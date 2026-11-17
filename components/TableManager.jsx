'use client';
import { useCallback, useEffect, useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useBranch } from '@/context/BranchContext';
import { useTables } from '@/hooks/useTables';
import TableQrSheet from './TableQrSheet';
import { useToast } from '@/context/ToastContext';

export default function TableManager() {
  const { branch, branches } = useBranch();
  const { tables, reload } = useTables(branch);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const { showToast } = useToast();
  const [links, setLinks] = useState({}); // table_id -> código corto permanente
  const [orphans, setOrphans] = useState([]); // códigos de mesas borradas

  const loadLinks = useCallback(async () => {
    if (!BARRO_CONFIGURED) return;
    const { data } = await sb.from('table_links').select('code, table_id, label');
    setLinks(Object.fromEntries((data || []).filter((l) => l.table_id).map((l) => [l.table_id, l.code])));
    setOrphans((data || []).filter((l) => !l.table_id));
  }, []);
  useEffect(() => { loadLinks(); }, [loadLinks, tables]);

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); showToast('Enlace copiado'); } catch (e) { /* sin portapapeles */ }
  }

  async function assign(code, tableId) {
    if (!tableId) return;
    const { error: err } = await sb.rpc('table_link_assign', { code_input: code, table_input: tableId });
    if (err) { showToast(err.message); return; }
    showToast('Listo: ese QR ahora abre esta mesa');
    loadLinks();
  }

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

      <div className="table-rows">
        {tables.map((t) => {
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          const code = links[t.id];
          return (
            <div className="table-row" key={t.id}>
              <div className="table-row-top">
                <b>{t.label}</b>
                {deletingId === t.id ? (
                  <span className="table-chip-confirm">
                    <button type="button" onClick={() => handleDelete(t.id)}>Sí, borrar</button>
                    <button type="button" onClick={() => setDeletingId(null)}>No</button>
                  </span>
                ) : (
                  <button type="button" className="table-chip-del" aria-label="Eliminar mesa" onClick={() => setDeletingId(t.id)}>
                    <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                )}
              </div>
              {BARRO_CONFIGURED && (
                <div className="table-links">
                  {code && (
                    <button type="button" className="table-link" onClick={() => copy(`${origin}/q/${code}`)}>
                      <span>QR (no cambia)</span>
                      <code>{origin}/q/{code}</code>
                    </button>
                  )}
                  <button type="button" className="table-link" onClick={() => copy(`${origin}/mesa/${t.id}`)}>
                    <span>Enlace de la mesa</span>
                    <code>{origin}/mesa/{t.id}</code>
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {tables.length === 0 && <p className="empty-note">Todavía no hay mesas en esta sucursal.</p>}
      </div>

      {orphans.length > 0 && tables.length > 0 && (
        <div className="table-orphans">
          <h4>QR sin mesa</h4>
          {orphans.map((o) => (
            <div key={o.code} className="table-orphan">
              <span><b>/q/{o.code}</b><small>Era de {o.label || 'una mesa borrada'}</small></span>
              <select defaultValue="" onChange={(e) => assign(o.code, e.target.value)} aria-label={`Apuntar /q/${o.code} a una mesa`}>
                <option value="">Usar en…</option>
                {tables.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

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
      {tables.length > 0 && BARRO_CONFIGURED && (
        <button type="button" className="pill-btn-dark" style={{ marginTop: 14 }} onClick={() => setShowQr(true)}>Códigos QR de las mesas</button>
      )}
      {showQr && <TableQrSheet tables={tables} links={links} onClose={() => setShowQr(false)} />}
    </div>
  );
}
