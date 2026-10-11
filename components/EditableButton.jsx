'use client';
import { useState, useEffect } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';

export default function EditableButton({ contentKey, defaultLabel, defaultHref, className, style }) {
  const { isStaff } = useAuth();
  const [state, setState] = useState({ label: defaultLabel, href: defaultHref, hidden: false });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(state);

  useEffect(() => {
    async function load() {
      if (!BARRO_CONFIGURED) return;
      const { data } = await sb.from('site_content').select('value').eq('key', contentKey).single();
      if (data && data.value) {
        try {
          const parsed = JSON.parse(data.value);
          setState({ label: parsed.label ?? defaultLabel, href: parsed.href ?? defaultHref, hidden: !!parsed.hidden });
        } catch (e) { /* usa lo de siempre */ }
      }
    }
    load();
  }, [contentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(next) {
    setState(next);
    if (!BARRO_CONFIGURED) return;
    await sb.from('site_content').upsert({ key: contentKey, value: JSON.stringify(next), updated_at: new Date().toISOString() });
  }

  function startEdit() {
    setDraft(state);
    setEditing(true);
  }

  async function handleSave() {
    await persist(draft);
    setEditing(false);
  }

  async function handleToggleHidden() {
    await persist({ ...state, hidden: !state.hidden });
  }

  if (!isStaff) {
    if (state.hidden) return null;
    return <a href={state.href} className={className} style={style}>{state.label}</a>;
  }

  if (editing) {
    return (
      <div className="editable-button-form">
        <div className="field">
          <label>Texto del botón</label>
          <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        </div>
        <div className="field">
          <label>A dónde va (link)</label>
          <input value={draft.href} onChange={(e) => setDraft({ ...draft, href: e.target.value })} placeholder="/visitanos" />
        </div>
        <div className="editable-text-actions">
          <button type="button" onClick={handleSave}>Guardar</button>
          <button type="button" className="ghost" onClick={() => setEditing(false)}>Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="editable-button-wrap">
      {state.hidden ? (
        <p className="empty-note">Este botón está oculto para los visitantes.</p>
      ) : (
        <a href={state.href} className={className} style={style} onClick={(e) => e.preventDefault()}>{state.label}</a>
      )}
      <div className="editable-button-admin">
        <button type="button" onClick={startEdit}>Editar</button>
        <button type="button" onClick={handleToggleHidden}>{state.hidden ? 'Restaurar botón' : 'Eliminar botón'}</button>
      </div>
    </div>
  );
}
