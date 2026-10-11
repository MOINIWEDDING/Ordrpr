'use client';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useUploader } from '@/hooks/useUploader';
import { useGiftCardDesigns } from '@/hooks/useGiftCardDesigns';
import Uploader from './Uploader';
import Modal from './Modal';

export default function GiftCardDesignManager() {
  const { designs, reload } = useGiftCardDesigns();
  const globalDesigns = designs.filter((d) => d.scope === 'global');
  const [editing, setEditing] = useState(null); // design | 'new' | null
  const [deletingId, setDeletingId] = useState(null);

  async function handleDelete(id) {
    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('gift_card_designs').delete().eq('id', id);
      if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    }
    setDeletingId(null);
    await reload();
  }

  return (
    <>
      <div className="offers-wrap" style={{ margin: 0 }}>
        <div className="offers-track">
          {globalDesigns.map((d) => (
            <div className="offer-card" key={d.id}>
              <div className="ph"><img className="real" src={d.image_url} alt={d.name} /></div>
              <div className="offer-content">
                <h3 style={{ fontSize: 16 }}>{d.name}</h3>
              </div>
              <div className="offer-admin">
                <button type="button" className="icon-btn" aria-label="Editar" onClick={() => setEditing(d)}>
                  <svg className="icon" style={{ width: 14, height: 14 }} viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                </button>
                <button type="button" className="icon-btn danger" aria-label="Eliminar" onClick={() => setDeletingId(d.id)}>
                  <svg className="icon" style={{ width: 14, height: 14 }} viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
                </button>
              </div>
              {deletingId === d.id && (
                <div className="confirm-del-sm">
                  <span>¿Eliminar este diseño?</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-amber" style={{ border: 'none' }} onClick={() => handleDelete(d.id)}>Sí, eliminar</button>
                    <button type="button" className="btn-ghost" style={{ border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff' }} onClick={() => setDeletingId(null)}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="offers-add" onClick={() => setEditing('new')}>
            <div className="plus"><svg className="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></div>
            <span>Agregar diseño global</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {editing && (
          <DesignModal
            design={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={reload}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function DesignModal({ design, onClose, onSaved }) {
  const uploader = useUploader({ kind: 'offer' });
  const [name, setName] = useState(design ? design.name : '');
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [busy, setBusy] = useState(false);

  useState(() => { if (design && design.image_url) uploader.setUrl(design.image_url); }); // eslint-disable-line

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setMsg({ text: 'Ponle un nombre.', type: 'error' }); return; }
    if (uploader.uploading) { setMsg({ text: 'Espera a que la foto termine de subir.', type: 'error' }); return; }
    if (!uploader.url) { setMsg({ text: 'Sube una foto.', type: 'error' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ text: 'Conecta Supabase para guardar de verdad.', type: 'error' }); return; }
    setBusy(true);
    const payload = { name: name.trim(), image_url: uploader.url, scope: 'global' };
    let error;
    if (design) {
      ({ error } = await sb.from('gift_card_designs').update(payload).eq('id', design.id));
    } else {
      ({ error } = await sb.from('gift_card_designs').insert(payload));
    }
    setBusy(false);
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    await onSaved();
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="modal-top">
        <p className="eyebrow">Gift cards</p>
        <h3>{design ? 'Editar diseño' : 'Agregar diseño global'}</h3>
        <p className="modal-sub">Este diseño lo verán todos tus clientes al comprar una gift card.</p>
      </div>
      <div className="modal-body">
        <form onSubmit={handleSubmit}>
          <div className="field"><label htmlFor="gdName">Nombre del diseño</label>
            <input id="gdName" type="text" placeholder="Ej. Navidad" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field"><label>Foto</label><Uploader uploader={uploader} kind="offer" /></div>
          {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-amber" disabled={busy || uploader.uploading}>{uploader.uploading ? 'Subiendo…' : (busy ? 'Guardando…' : 'Guardar')}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
