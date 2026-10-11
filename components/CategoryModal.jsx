'use client';
import { useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import ProductIcon, { ICON_KEYS } from './ProductIcon';
import Modal from './Modal';

const TINT_OPTIONS = ['manana', 'salado', 'tarde', 'experiencia'];

export default function CategoryModal({ category, onClose, onSaved }) {
  const [name, setName] = useState(category ? category.name : '');
  const [icon, setIcon] = useState(category ? category.icon : 'smoker');
  const [tint, setTint] = useState(category ? category.tint : 'manana');
  const [msg, setMsg] = useState({ text: '', type: '' });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setMsg({ text: 'Escribe un nombre.', type: 'error' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ text: 'Conecta Supabase para guardar cambios de verdad.', type: 'error' }); return; }
    const payload = { name: name.trim(), icon, tint };
    let error;
    if (category) {
      ({ error } = await sb.from('categories').update(payload).eq('id', category.id));
    } else {
      const { data: existing } = await sb.from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1);
      payload.sort_order = existing && existing[0] ? existing[0].sort_order + 1 : 1;
      ({ error } = await sb.from('categories').insert(payload));
    }
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    await onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!BARRO_CONFIGURED) { onClose(); return; }
    if (!window.confirm(`¿Eliminar la categoría "${category.name}"? Los productos que tenga no se borran, pero quedarán sin categoría visible hasta que les asignes otra.`)) return;
    const { error } = await sb.from('categories').delete().eq('id', category.id);
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    await onSaved();
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="modal-top">
        <p className="eyebrow">Categorías</p>
        <h3>{category ? 'Editar categoría' : 'Agregar categoría'}</h3>
        <p className="modal-sub">Aparece en el inicio, y agrupa los productos en el menú.</p>
      </div>
      <div className="modal-body">
        <form onSubmit={handleSubmit}>
          <div className="field"><label htmlFor="catName">Nombre</label>
            <input id="catName" type="text" placeholder="Populares" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field"><label>Ícono</label>
            <div className="icon-picker">
              {ICON_KEYS.map((k) => (
                <button type="button" key={k} className={`icon-pick${icon === k ? ' active' : ''}`} onClick={() => setIcon(k)}>
                  <ProductIcon name={k} />
                </button>
              ))}
            </div>
          </div>
          <div className="field"><label>Color</label>
            <div className="tint-picker">
              {TINT_OPTIONS.map((t) => (
                <button type="button" key={t} className={`tint-pick${tint === t ? ' active' : ''}`} style={{ background: `var(--tint-${t})` }} onClick={() => setTint(t)} aria-label={t} />
              ))}
            </div>
          </div>
          {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
          <div className="modal-actions">
            {category
              ? <button type="button" className="btn btn-ghost" onClick={handleDelete} style={{ color: 'var(--err)' }}>Eliminar categoría</button>
              : <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>}
            <button type="submit" className="btn btn-amber">Guardar</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
