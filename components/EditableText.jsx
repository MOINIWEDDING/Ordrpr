'use client';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSiteContent } from '@/context/SiteContentContext';

export default function EditableText({ contentKey, defaultValue, as: Tag = 'p', className, style, multiline = false }) {
  const { isStaff } = useAuth();
  const { get, save } = useSiteContent();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const value = get(contentKey, defaultValue);

  function startEdit() {
    setDraft(value);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    await save(contentKey, draft);
    setSaving(false);
    setEditing(false);
  }

  if (!isStaff) {
    return <Tag className={className} style={style}>{value}</Tag>;
  }

  const isInline = Tag === 'span' || Tag === 'b';

  if (editing) {
    return (
      <span className={`editable-text-editing${isInline ? ' inline' : ''}`}>
        {multiline ? (
          <textarea className={className} style={style} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} autoFocus />
        ) : (
          <input className={className} style={style} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
        )}
        <span className="editable-text-actions">
          <button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" onClick={() => setEditing(false)} className="ghost">Cancelar</button>
        </span>
      </span>
    );
  }

  return (
    <span className={`editable-text-wrap${isInline ? ' inline' : ''}`}>
      <Tag className={className} style={style}>{value}</Tag>
      <button type="button" className="editable-text-pencil" aria-label="Editar texto" onClick={startEdit}>
        <svg viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
      </button>
    </span>
  );
}
