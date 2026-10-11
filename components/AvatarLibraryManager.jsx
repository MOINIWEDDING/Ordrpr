'use client';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useUploader } from '@/hooks/useUploader';
import { useAvatars } from '@/hooks/useAvatars';
import Uploader from './Uploader';
import Modal from './Modal';

export default function AvatarLibraryManager() {
  const { avatars, reload } = useAvatars();
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  async function handleDelete(id) {
    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('avatars').delete().eq('id', id);
      if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    }
    setDeletingId(null);
    await reload();
  }

  return (
    <>
      <div className="avatar-lib-grid">
        {avatars.map((a) => (
          <div className="avatar-lib-item" key={a.id}>
            <img src={a.image_url} alt="" />
            <button type="button" className="avatar-lib-del" aria-label="Eliminar" onClick={() => setDeletingId(a.id)}>
              <svg className="icon" style={{ width: 13, height: 13 }} viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
            </button>
            {deletingId === a.id && (
              <div className="confirm-del-sm" style={{ borderRadius: '50%' }}>
                <button type="button" className="btn-amber" style={{ border: 'none', fontSize: 11, padding: '6px 10px' }} onClick={() => handleDelete(a.id)}>Sí</button>
                <button type="button" className="btn-ghost" style={{ border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', fontSize: 11, padding: '6px 10px' }} onClick={() => setDeletingId(null)}>No</button>
              </div>
            )}
          </div>
        ))}
        <button type="button" className="avatar-lib-add" onClick={() => setAdding(true)}>
          <svg className="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      <AnimatePresence>
        {adding && <AddAvatarModal onClose={() => setAdding(false)} onSaved={reload} />}
      </AnimatePresence>
    </>
  );
}

function AddAvatarModal({ onClose, onSaved }) {
  const uploader = useUploader({ kind: 'avatar' });
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (uploader.uploading) { setMsg({ text: 'Espera a que la foto termine de subir.', type: 'error' }); return; }
    if (!uploader.url) { setMsg({ text: 'Sube una foto.', type: 'error' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ text: 'Conecta Supabase para guardar de verdad.', type: 'error' }); return; }
    setBusy(true);
    const { error } = await sb.from('avatars').insert({ image_url: uploader.url });
    setBusy(false);
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    await onSaved();
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="modal-top">
        <p className="eyebrow">Avatares</p>
        <h3>Agregar foto de avatar</h3>
        <p className="modal-sub">Los clientes elegirán entre las fotos que subas aquí — ellos no pueden subir las suyas.</p>
      </div>
      <div className="modal-body">
        <form onSubmit={handleSubmit}>
          <div className="field"><Uploader uploader={uploader} kind="avatar" /></div>
          {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-amber" disabled={busy || uploader.uploading}>{uploader.uploading ? 'Subiendo…' : (busy ? 'Guardando…' : 'Agregar')}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
