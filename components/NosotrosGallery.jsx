'use client';
import { useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { useUploader } from '@/hooks/useUploader';
import Uploader from './Uploader';
import Modal from './Modal';

const DEMO_GALLERY = [
  { id: 'demo-0', image_url: 'https://images.unsplash.com/photo-1558030089-02acba3c214e?q=80&w=900&auto=format&fit=crop' },
  { id: 'demo-1', image_url: 'https://images.unsplash.com/photo-1548899278-41c14dcddc69?q=80&w=900&auto=format&fit=crop' },
  { id: 'demo-2', image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=900&auto=format&fit=crop' },
];

export default function NosotrosGallery() {
  const { isStaff } = useAuth();
  const [photos, setPhotos] = useState([]);
  const [editingId, setEditingId] = useState(null); // id de la foto que se está reemplazando, o 'new'
  const [deletingId, setDeletingId] = useState(null);
  const [saveError, setSaveError] = useState('');
  const uploader = useUploader({ kind: 'site' });

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setPhotos(DEMO_GALLERY); return; }
    const { data, error } = await sb.from('nosotros_gallery').select('*').order('sort_order', { ascending: true });
    setPhotos(!error && data && data.length ? data : DEMO_GALLERY);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    uploader.reset();
    setSaveError('');
    setEditingId('new');
  }

  function openReplace(id) {
    uploader.reset();
    setSaveError('');
    setEditingId(id);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (uploader.uploading) { setSaveError('Espera a que la foto termine de subir.'); return; }
    if (!uploader.url) { setSaveError('Elige una foto primero.'); return; }

    if (editingId === 'new') {
      const nextOrder = photos.length ? Math.max(...photos.map((p) => p.sort_order || 0)) + 1 : 1;
      if (BARRO_CONFIGURED) {
        const { error } = await sb.from('nosotros_gallery').insert({ image_url: uploader.url, sort_order: nextOrder });
        if (error) { setSaveError(error.message); return; }
      }
    } else if (BARRO_CONFIGURED) {
      const { error } = await sb.from('nosotros_gallery').update({ image_url: uploader.url }).eq('id', editingId);
      if (error) { setSaveError(error.message); return; }
    }
    setEditingId(null);
    await load();
  }

  async function handleDelete(id) {
    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('nosotros_gallery').delete().eq('id', id);
      if (error) { alert('No se pudo eliminar: ' + error.message); setDeletingId(null); return; }
    }
    setDeletingId(null);
    await load();
  }

  return (
    <>
      <div className="espacio-grid">
        {photos.map((p) => (
          <div className="ph" key={p.id}>
            <img className="real" src={p.image_url} alt="" />
            {isStaff && (
              <>
                <button type="button" className="ph-edit" onClick={() => openReplace(p.id)}>
                  <svg className="icon" viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  Cambiar
                </button>
                {deletingId === p.id ? (
                  <span className="ph-delete-confirm">
                    <button type="button" onClick={() => handleDelete(p.id)}>Sí, borrar</button>
                    <button type="button" onClick={() => setDeletingId(null)}>No</button>
                  </span>
                ) : (
                  <button type="button" className="ph-delete" aria-label="Eliminar foto" onClick={() => setDeletingId(p.id)}>
                    <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                )}
              </>
            )}
          </div>
        ))}
        {isStaff && (
          <button type="button" className="ph ph-add" onClick={openAdd}>
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
            <span className="ph-label">Agregar foto</span>
          </button>
        )}
      </div>

      <Modal open={!!editingId} onClose={() => setEditingId(null)}>
        <div className="modal-top">
          <p className="eyebrow">Fotos del sitio</p>
          <h3>{editingId === 'new' ? 'Agregar foto' : 'Cambiar foto'}</h3>
          <p className="modal-sub">Sube una foto panorámica (16:9) desde tu teléfono.</p>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSave}>
            <Uploader uploader={uploader} />
            {saveError && <div className="form-msg show error">{saveError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)}>Cancelar</button>
              <button type="submit" className="btn btn-amber" disabled={uploader.uploading}>{uploader.uploading ? 'Subiendo…' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
