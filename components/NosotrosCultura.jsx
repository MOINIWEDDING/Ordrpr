'use client';
import { useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import Reveal from './Reveal';

const DEMO = [
  { id: 'demo-1', tag: 'Eventos', title: 'Tu primer proyecto o evento', body: 'Cuenta aquí algo que hace tu negocio además de servir comida.' },
  { id: 'demo-2', tag: 'Comunidad', title: 'Otra actividad', body: 'Colaboraciones, catas, talleres o lo que quieras destacar.' },
  { id: 'demo-3', tag: 'Novedades', title: 'Una tercera idea', body: 'Lo que quieras que tus clientes conozcan de ti.' },
];

export default function NosotrosCultura() {
  const { isStaff } = useAuth();
  const [items, setItems] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setItems(DEMO); return; }
    const { data, error } = await sb.from('nosotros_cultura').select('*').order('sort_order', { ascending: true });
    setItems(!error && data && data.length ? data : DEMO);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateField(id, field, value) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
    if (BARRO_CONFIGURED) await sb.from('nosotros_cultura').update({ [field]: value }).eq('id', id);
  }

  async function handleAdd() {
    const nextOrder = items.length ? Math.max(...items.map((i) => i.sort_order || 0)) + 1 : 1;
    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('nosotros_cultura').insert({ tag: 'Etiqueta', title: 'Nuevo punto', body: 'Escribe aquí de qué se trata.', sort_order: nextOrder });
      if (error) { alert(error.message); return; }
    }
    await load();
  }

  async function handleDelete(id) {
    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('nosotros_cultura').delete().eq('id', id);
      if (error) { alert('No se pudo eliminar: ' + error.message); setDeletingId(null); return; }
    }
    setDeletingId(null);
    await load();
  }

  return (
    <div className="cultura-list">
      {items.map((it, i) => (
        <Reveal as="div" className="cultura-item" delay={i * 0.08} key={it.id} style={{ position: 'relative' }}>
          {isStaff && (
            deletingId === it.id ? (
              <span className="ph-delete-confirm" style={{ position: 'absolute', top: 0, right: 0 }}>
                <button type="button" onClick={() => handleDelete(it.id)}>Sí, borrar</button>
                <button type="button" onClick={() => setDeletingId(null)}>No</button>
              </span>
            ) : (
              <button type="button" className="ph-delete" style={{ position: 'absolute', top: 0, right: 0 }} aria-label="Eliminar" onClick={() => setDeletingId(it.id)}>
                <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            )
          )}
          {isStaff ? (
            <input className="inline-edit-tag" value={it.tag} onChange={(e) => updateField(it.id, 'tag', e.target.value)} />
          ) : (
            <span className="cultura-tag">{it.tag}</span>
          )}
          <div>
            {isStaff ? (
              <>
                <input className="inline-edit-h4" value={it.title} onChange={(e) => updateField(it.id, 'title', e.target.value)} />
                <textarea className="inline-edit-p" value={it.body} onChange={(e) => updateField(it.id, 'body', e.target.value)} rows={2} />
              </>
            ) : (
              <>
                <h4>{it.title}</h4>
                <p>{it.body}</p>
              </>
            )}
          </div>
        </Reveal>
      ))}
      {isStaff && (
        <button type="button" className="cultura-item cultura-add" onClick={handleAdd}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
          Agregar punto
        </button>
      )}
    </div>
  );
}
