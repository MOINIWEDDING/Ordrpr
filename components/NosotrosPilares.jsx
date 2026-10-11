'use client';
import { useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import Reveal from './Reveal';

const DEMO = [
  { id: 'demo-1', title: 'Nuestro primer pilar', body: 'Describe aquí una de las ideas que definen a tu negocio.' },
  { id: 'demo-2', title: 'Nuestro segundo pilar', body: 'Describe aquí otra idea que te diferencia.' },
];

export default function NosotrosPilares() {
  const { isStaff } = useAuth();
  const [items, setItems] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setItems(DEMO); return; }
    const { data, error } = await sb.from('nosotros_pilares').select('*').order('sort_order', { ascending: true });
    setItems(!error && data && data.length ? data : DEMO);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateField(id, field, value) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
    if (BARRO_CONFIGURED) await sb.from('nosotros_pilares').update({ [field]: value }).eq('id', id);
  }

  async function handleAdd() {
    const nextOrder = items.length ? Math.max(...items.map((i) => i.sort_order || 0)) + 1 : 1;
    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('nosotros_pilares').insert({ title: 'Nuevo pilar', body: 'Escribe aquí de qué se trata.', sort_order: nextOrder });
      if (error) { alert(error.message); return; }
    }
    await load();
  }

  async function handleDelete(id) {
    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('nosotros_pilares').delete().eq('id', id);
      if (error) { alert('No se pudo eliminar: ' + error.message); setDeletingId(null); return; }
    }
    setDeletingId(null);
    await load();
  }

  return (
    <div className="pilar-grid">
      {items.map((it, i) => (
        <Reveal className="pilar-card" delay={i * 0.1} key={it.id}>
          {isStaff && (
            deletingId === it.id ? (
              <span className="ph-delete-confirm" style={{ position: 'absolute', top: 14, right: 14 }}>
                <button type="button" onClick={() => handleDelete(it.id)}>Sí, borrar</button>
                <button type="button" onClick={() => setDeletingId(null)}>No</button>
              </span>
            ) : (
              <button type="button" className="ph-delete" style={{ position: 'absolute', top: 14, right: 14 }} aria-label="Eliminar" onClick={() => setDeletingId(it.id)}>
                <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            )
          )}
          <div className="pilar-num">{String(i + 1).padStart(2, '0')}</div>
          {isStaff ? (
            <>
              <input className="inline-edit-h3" value={it.title} onChange={(e) => updateField(it.id, 'title', e.target.value)} />
              <textarea className="inline-edit-p" value={it.body} onChange={(e) => updateField(it.id, 'body', e.target.value)} rows={3} />
            </>
          ) : (
            <>
              <h3>{it.title}</h3>
              <p>{it.body}</p>
            </>
          )}
        </Reveal>
      ))}
      {isStaff && (
        <button type="button" className="pilar-card pilar-add" onClick={handleAdd}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
          Agregar pilar
        </button>
      )}
    </div>
  );
}
