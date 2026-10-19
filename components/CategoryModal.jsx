'use client';
import { useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import ProductIcon, { ICON_KEYS } from './ProductIcon';
import Modal from './Modal';

const TINT_OPTIONS = [
  { key: 'manana', label: 'Crema' },
  { key: 'salado', label: 'Verde' },
  { key: 'tarde', label: 'Terracota' },
  { key: 'experiencia', label: 'Lila' },
];

// Editor de categorías con el mismo estilo que el de productos: vista previa arriba (como se ve en
// el inicio) y debajo nombre, ícono, color y si aparece en el inicio.
export default function CategoryModal({ category, onClose, onSaved }) {
  const [name, setName] = useState(category ? category.name : '');
  const [icon, setIcon] = useState(category ? category.icon : 'smoker');
  const [tint, setTint] = useState(category ? category.tint : 'manana');
  const [onHome, setOnHome] = useState(category ? !category.home_hidden : true);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setMsg({ text: 'Escribe un nombre.', type: 'error' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ text: 'Conecta Supabase para guardar cambios de verdad.', type: 'error' }); return; }
    const payload = { name: name.trim(), icon, tint, home_hidden: !onHome };
    setSaving(true);
    const save = async (data) => {
      if (category) return sb.from('categories').update(data).eq('id', category.id);
      const { data: existing } = await sb.from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1);
      return sb.from('categories').insert({ ...data, sort_order: existing && existing[0] ? existing[0].sort_order + 1 : 1 });
    };
    let { error } = await save(payload);
    // si la base de datos aún no tiene la columna home_hidden (falta su migración), se guarda lo demás
    if (error && /home_hidden/i.test(error.message || '')) {
      const rest = { ...payload };
      delete rest.home_hidden;
      ({ error } = await save(rest));
    }
    setSaving(false);
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    await onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!BARRO_CONFIGURED) { onClose(); return; }
    const { error } = await sb.from('categories').delete().eq('id', category.id);
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    await onSaved();
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={handleSubmit} className="pe">
        <div className="pe-head">
          <p className="eyebrow">Categorías</p>
          <h3>{category ? 'Editar categoría' : 'Nueva categoría'}</h3>
        </div>

        <div className="pe-cat-preview" style={{ '--tint': `var(--tint-${tint})`, '--tint-deep': `var(--tint-${tint}-deep)` }}>
          <span className="pe-cat-preview-icon"><ProductIcon name={icon} /></span>
          <span className="pe-cat-preview-name">{name.trim() || 'Nombre de la categoría'}</span>
        </div>

        <section className="pe-section">
          <h4>Categoría</h4>
          <div className="field">
            <label htmlFor="catName">Nombre</label>
            <input id="catName" type="text" placeholder="Populares" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Ícono</label>
            <div className="pe-icon-grid">
              {ICON_KEYS.map((k) => (
                <button type="button" key={k} className={`pe-icon-pick${icon === k ? ' active' : ''}`} onClick={() => setIcon(k)} aria-label={k} aria-pressed={icon === k}>
                  <ProductIcon name={k} />
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Color</label>
            <div className="pe-tint-grid">
              {TINT_OPTIONS.map((t) => (
                <button type="button" key={t.key} className={`pe-tint-pick${tint === t.key ? ' active' : ''}`} onClick={() => setTint(t.key)} aria-pressed={tint === t.key}>
                  <span style={{ background: `var(--tint-${t.key})`, borderColor: `var(--tint-${t.key}-deep)` }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="pe-toggles">
            <label className={`pe-toggle${onHome ? ' on' : ''}`} htmlFor="catOnHome">
              <span className="pe-toggle-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /></svg></span>
              <span className="pe-toggle-text"><b>Mostrar en el inicio</b></span>
              <input id="catOnHome" type="checkbox" role="switch" checked={onHome} onChange={(e) => setOnHome(e.target.checked)} />
              <span className="pe-switch" aria-hidden="true" />
            </label>
          </div>
        </section>

        {category && (
          confirmDelete ? (
            <div className="pe-danger">
              <span>¿Eliminar &quot;{category.name}&quot;? Sus productos no se borran, pero quedan sin categoría visible.</span>
              <div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>No</button>
                <button type="button" className="btn btn-sm pe-danger-btn" onClick={handleDelete}>Sí, eliminar</button>
              </div>
            </div>
          ) : (
            <button type="button" className="pe-delete-link" onClick={() => setConfirmDelete(true)}>Eliminar categoría</button>
          )
        )}

        {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}

        <div className="pe-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-amber" disabled={saving}>{saving ? 'Guardando…' : (category ? 'Guardar cambios' : 'Crear categoría')}</button>
        </div>
      </form>
    </Modal>
  );
}
