'use client';
import { useState, useEffect, useMemo } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useUploader } from '@/hooks/useUploader';
import { isVideoUrl } from '@/lib/upload';
import Uploader from './Uploader';
import Modal from './Modal';

// Sin fotos de relleno: hasta que el dueño suba las suyas se muestra un marcador neutro.
export const DEFAULT_SITE_IMAGES = {};

export default function EditablePhoto({ imgKey, label, className = '', uploadKind = 'site', modalSub }) {
  const [url, setUrl] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saveError, setSaveError] = useState('');
  const uploadOpts = useMemo(() => ({ kind: uploadKind }), [uploadKind]);
  const uploader = useUploader(uploadOpts);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!BARRO_CONFIGURED) {
        if (active) setUrl(DEFAULT_SITE_IMAGES[imgKey] || '');
        return;
      }
      const { data, error } = await sb.from('site_images').select('url').eq('key', imgKey).single();
      if (!active) return;
      setUrl((!error && data && data.url) ? data.url : (DEFAULT_SITE_IMAGES[imgKey] || ''));
    }
    load();
    return () => { active = false; };
  }, [imgKey]);

  function openModal() {
    uploader.reset();
    setSaveError('');
    setModalOpen(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (uploader.uploading) { setSaveError('Espera a que la foto o video termine de subir.'); return; }
    if (!uploader.url) { setSaveError('Elige una foto primero.'); return; }
    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('site_images')
        .update({ url: uploader.url, updated_at: new Date().toISOString() })
        .eq('key', imgKey);
      if (error) { setSaveError(error.message); return; }
    }
    setUrl(uploader.url);
    setModalOpen(false);
  }

  return (
    <>
      <div className={`ph ${className}`}>
        {url ? (
          isVideoUrl(url)
            ? <video className="real" src={url} autoPlay muted loop playsInline />
            : <img className="real" src={url} alt={label || ''} />
        ) : (
          <>
            <svg className="ph-icon" viewBox="0 0 24 24"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.4" /></svg>
            {label && <span className="ph-label">{label}</span>}
          </>
        )}
        <button type="button" className="ph-edit" onClick={openModal}>
          <svg className="icon" viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
          Cambiar
        </button>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="modal-top">
          <p className="eyebrow">Fotos del sitio</p>
          <h3>Cambiar foto</h3>
          <p className="modal-sub">{modalSub || 'Sube una foto desde tu teléfono o toma una nueva con la cámara.'}</p>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSave}>
            <Uploader uploader={uploader} kind={uploadKind} />
            {saveError && <div className="form-msg show error">{saveError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button type="submit" className="btn btn-amber" disabled={uploader.uploading}>{uploader.uploading ? 'Subiendo…' : 'Guardar foto'}</button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
