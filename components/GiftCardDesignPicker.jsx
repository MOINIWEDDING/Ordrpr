'use client';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { useUploader } from '@/hooks/useUploader';
import Uploader from './Uploader';
import Modal from './Modal';

export default function GiftCardDesignPicker({ designs, selectedId, onSelect, onDesignAdded }) {
  const { profile } = useAuth();
  const visible = designs.filter((d) => d.scope === 'global' || d.owner_user_id === profile.id);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <div className="offers-wrap" style={{ margin: 0 }}>
        <div className="offers-track">
          {visible.map((d) => (
            <button
              type="button"
              key={d.id}
              className={`offer-card design-pick${selectedId === d.id ? ' selected' : ''}`}
              onClick={() => onSelect(d.id)}
            >
              <div className="ph"><img className="real" src={d.image_url} alt={d.name} /></div>
              <div className="offer-content">
                <h3 style={{ fontSize: 16 }}>{d.name}</h3>
                {d.scope === 'personal' && <p style={{ fontSize: 11 }}>Tu diseño personalizado</p>}
              </div>
              {selectedId === d.id && (
                <span className="design-pick-check">
                  <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                </span>
              )}
            </button>
          ))}
          <button type="button" className="offers-add" onClick={() => setAdding(true)}>
            <div className="plus"><svg className="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></div>
            <span>Crear diseño personalizado</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {adding && (
          <AddDesignModal
            onClose={() => setAdding(false)}
            onSaved={(id) => { onDesignAdded(); onSelect(id); setAdding(false); }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function AddDesignModal({ onClose, onSaved }) {
  const { profile } = useAuth();
  const uploader = useUploader({ kind: 'offer' });
  const [name, setName] = useState('');
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setMsg({ text: 'Ponle un nombre a tu diseño.', type: 'error' }); return; }
    if (uploader.uploading) { setMsg({ text: 'Espera a que la foto termine de subir.', type: 'error' }); return; }
    if (!uploader.url) { setMsg({ text: 'Sube una foto para tu diseño.', type: 'error' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ text: 'Conecta Supabase para guardar de verdad.', type: 'error' }); return; }
    setBusy(true);
    const { data, error } = await sb.from('gift_card_designs')
      .insert({ name: name.trim(), image_url: uploader.url, scope: 'personal', owner_user_id: profile.id })
      .select().single();
    setBusy(false);
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    onSaved(data.id);
  }

  return (
    <Modal onClose={onClose}>
      <div className="modal-top">
        <p className="eyebrow">Gift card</p>
        <h3>Tu diseño personalizado</h3>
        <p className="modal-sub">Solo lo verán tú y la persona a quien le regales esta gift card.</p>
      </div>
      <div className="modal-body">
        <form onSubmit={handleSubmit}>
          <div className="field"><label htmlFor="designName">Nombre del diseño</label>
            <input id="designName" type="text" placeholder="Ej. Cumpleaños de Ana" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field"><label>Foto</label><Uploader uploader={uploader} kind="offer" /></div>
          {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-amber" disabled={busy || uploader.uploading}>{uploader.uploading ? 'Subiendo…' : (busy ? 'Guardando…' : 'Usar este diseño')}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
