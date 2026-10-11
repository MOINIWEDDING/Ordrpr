'use client';
import { useEffect, useRef, useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useUploader } from '@/hooks/useUploader';
import { useMenuItems, GROUPS, GROUP_SLUGS, TINTS, money } from '@/hooks/useMenuItems';
import Uploader from './Uploader';
import Modal from './Modal';

export default function MenuCarousels() {
  const { items, reload } = useMenuItems();
  const [editing, setEditing] = useState(null); // item | 'new' | null
  const [newItemGroup, setNewItemGroup] = useState('Buenos días');
  const hashHandled = useRef(false);

  const groupsWithItems = GROUPS.filter((g) => items.some((i) => i.category === g));

  useEffect(() => {
    if (hashHandled.current) return;
    if (!groupsWithItems.length) return;
    if (typeof window === 'undefined' || !window.location.hash) return;
    const el = document.querySelector(window.location.hash);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    hashHandled.current = true;
  }, [groupsWithItems.length]);

  return (
    <>
      {groupsWithItems.map((group) => (
        <CarouselSection
          key={group}
          group={group}
          items={items.filter((i) => i.category === group)}
          onEdit={(item) => setEditing(item)}
          onDeleted={reload}
        />
      ))}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
        <button type="button" className="btn btn-amber" onClick={() => { setNewItemGroup('Buenos días'); setEditing('new'); }}>
          Agregar producto
        </button>
      </div>

      {editing && (
        <ProductModal
          item={editing === 'new' ? null : editing}
          defaultCategory={newItemGroup}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </>
  );
}

function CarouselSection({ group, items, onEdit, onDeleted }) {
  const trackRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  function update() {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft >= max - 4 || max <= 4);
  }

  useEffect(() => { update(); }, [items.length]); // eslint-disable-line

  function scrollBy(dir) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -el.clientWidth * 0.8 : el.clientWidth * 0.8, behavior: 'smooth' });
  }

  async function handleDelete(id) {
    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('menu_items').delete().eq('id', id);
      if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    }
    setDeletingId(null);
    await onDeleted();
  }

  const tint = TINTS[group] || 'manana';

  return (
    <div className="carousel-section reveal in" id={GROUP_SLUGS[group]} style={{ scrollMarginTop: 76 }}>
      <div className="carousel-head"><h3>{group}</h3></div>
      <div className="carousel-wrap">
        <button type="button" className="carousel-arrow left" disabled={atStart} aria-label="Anterior" onClick={() => scrollBy('left')}>
          <svg className="icon" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <div className="carousel-track" ref={trackRef} onScroll={update}>
          {items.map((item) => (
            <article className="p-card reveal in" key={item.id}>
              <div className="p-photo" style={{ '--tint': `var(--tint-${tint})`, '--tint-deep': `var(--tint-${tint}-deep)` }}>
                {item.image_url
                  ? <img src={item.image_url} alt={item.name} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg className="ph-icon" style={{ width: 30, height: 30, stroke: '#fff', opacity: .6 }} viewBox="0 0 24 24"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.4" /></svg></div>}
                <div className="p-photo-tint" />
                <div className="p-photo-fade" />
                {item.featured && <span className="p-tagline">Favorito de la casa</span>}
                <div className="p-admin">
                  <button type="button" className="icon-btn" aria-label="Editar" onClick={() => onEdit(item)}>
                    <svg className="icon" style={{ width: 13, height: 13 }} viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  </button>
                  <button type="button" className="icon-btn danger" aria-label="Eliminar" onClick={() => setDeletingId(item.id)}>
                    <svg className="icon" style={{ width: 13, height: 13 }} viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
                  </button>
                </div>
                {deletingId === item.id && (
                  <div className="confirm-del-sm">
                    <span>¿Eliminar este producto?</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn-amber" style={{ border: 'none' }} onClick={() => handleDelete(item.id)}>Sí, eliminar</button>
                      <button type="button" className="btn-ghost" style={{ border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff' }} onClick={() => setDeletingId(null)}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-info" style={{ '--tint-deep': `var(--tint-${tint}-deep)` }}>
                <div className="p-info-top">
                  <h4>{item.name}</h4>
                  <span className="p-price">{money(item.price)}</span>
                </div>
                {item.tags && (
                  <div className="p-tags">
                    {item.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => <span key={t}>{t}</span>)}
                  </div>
                )}
                <div className="p-divider" />
                <PedirButton name={item.name} />
              </div>
            </article>
          ))}
        </div>
        <button type="button" className="carousel-arrow right" disabled={atEnd} aria-label="Siguiente" onClick={() => scrollBy('right')}>
          <svg className="icon" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  );
}

function PedirButton({ name }) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="p-order" onClick={() => { setShowTip(true); setTimeout(() => setShowTip(false), 2600); }}>
        Pedir <svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8" /></svg>
      </button>
      {showTip && (
        <div style={{ position: 'absolute', bottom: '120%', left: 0, background: 'var(--ink)', color: '#fff', fontSize: 11.5, padding: '8px 12px', borderRadius: 10, whiteSpace: 'nowrap', boxShadow: 'var(--shadow-soft)' }}>
          {name} — pídelo en la barra 🔥
        </div>
      )}
    </div>
  );
}

function ProductModal({ item, defaultCategory, onClose, onSaved }) {
  const uploader = useUploader({ requireTransparent: true });
  const [name, setName] = useState(item ? item.name : '');
  const [price, setPrice] = useState(item ? item.price : '');
  const [category, setCategory] = useState(item ? item.category : defaultCategory);
  const [tags, setTags] = useState(item ? (item.tags || '') : '');
  const [description, setDescription] = useState(item ? (item.description || '') : '');
  const [featured, setFeatured] = useState(item ? !!item.featured : false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => { if (item && item.image_url) uploader.setUrl(item.image_url); }, []); // eslint-disable-line

  async function handleSubmit(e) {
    e.preventDefault();
    const priceNum = parseFloat(price);
    if (!name.trim() || Number.isNaN(priceNum)) {
      setMsg({ text: 'Completa el nombre y el precio.', type: 'error' }); return;
    }
    if (!BARRO_CONFIGURED) { setMsg({ text: 'Conecta Supabase para guardar cambios de verdad.', type: 'error' }); return; }
    const payload = {
      name: name.trim(), price: priceNum, category, image_url: uploader.url,
      tags: tags.trim(), description: description.trim(), featured,
    };
    let error;
    if (item) {
      payload.updated_at = new Date().toISOString();
      ({ error } = await sb.from('menu_items').update(payload).eq('id', item.id));
    } else {
      ({ error } = await sb.from('menu_items').insert(payload));
    }
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    await onSaved();
    onClose();
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="modal-top">
        <p className="eyebrow">Menú</p>
        <h3>{item ? 'Editar producto' : 'Agregar producto'}</h3>
      </div>
      <div className="modal-body">
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field"><label htmlFor="pName">Nombre del plato o bebida</label>
              <input id="pName" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field"><label htmlFor="pPrice">Precio (RD$)</label>
              <input id="pPrice" type="number" min="0" step="1" inputMode="numeric" required value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="field"><label htmlFor="pCat">Recomendación</label>
            <select id="pCat" value={category} onChange={(e) => setCategory(e.target.value)}>
              {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="field"><label>Foto del producto</label><Uploader uploader={uploader} requireTransparent /></div>
          <div className="field"><label htmlFor="pTags">Etiquetas (separadas por coma)</label>
            <input id="pTags" type="text" placeholder="Dominicano, Filtrado, Frutal" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="field"><label htmlFor="pDesc">Descripción corta</label>
            <textarea id="pDesc" placeholder="Ingredientes, tamaño, notas…" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
            <input id="pFeatured" type="checkbox" style={{ width: 'auto' }} checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            <label htmlFor="pFeatured" style={{ margin: 0, textTransform: 'none', fontSize: 13, letterSpacing: 0, fontWeight: 500, color: 'var(--ink)' }}>Marcar como favorito</label>
          </div>
          {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-amber">{item ? 'Guardar cambios' : 'Guardar producto'}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
