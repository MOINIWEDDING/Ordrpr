'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { useAvatars } from '@/hooks/useAvatars';
import Modal from './Modal';

export default function AvatarPicker({ onClose }) {
  const { profile, refreshProfile } = useAuth();
  const { avatars, loading } = useAvatars();
  const [selected, setSelected] = useState(profile.avatar_url || null);
  const [spin, setSpin] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function pick(url) {
    setSpin((s) => s + 1080);
    setSelected(url);
  }

  async function handleSave() {
    if (!selected) { setError('Elige una foto primero.'); return; }
    if (!BARRO_CONFIGURED) { setError('Conecta Supabase para guardar cambios de verdad.'); return; }
    setBusy(true);
    setError('');
    const { error: updateError } = await sb.from('profiles').update({ avatar_url: selected }).eq('id', profile.id);
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    await refreshProfile();
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div className="modal-top">
        <p className="eyebrow">Tu cuenta</p>
        <h3>Elige tu avatar</h3>
        <p className="modal-sub">Selecciona una de las fotos disponibles. Puedes cambiarla cuando quieras.</p>
      </div>
      <div className="modal-body">
        <div className="avatar-preview-wrap">
          <motion.div
            className="avatar-preview-big"
            animate={{ rotate: spin }}
            transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          >
            {selected
              ? <img src={selected} alt="" />
              : <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>}
          </motion.div>
        </div>

        {loading ? null : avatars.length === 0 ? (
          <p className="empty-note">El local todavía no ha agregado fotos de avatar.</p>
        ) : (
          <div className="avatar-thumb-row">
            {avatars.map((a) => (
              <motion.button
                type="button"
                key={a.id}
                className={`avatar-thumb${selected === a.image_url ? ' active' : ''}`}
                onClick={() => pick(a.image_url)}
                whileHover={{ y: -3 }}
                whileTap={{ y: 0, scale: 0.94 }}
                aria-label="Elegir esta foto"
                aria-pressed={selected === a.image_url}
              >
                <img src={a.image_url} alt="" />
                <AnimatePresence>
                  {selected === a.image_url && (
                    <motion.span
                      className="avatar-thumb-ring"
                      initial={{ opacity: 0, rotate: -90 }}
                      animate={{ opacity: 1, rotate: 0 }}
                      exit={{ opacity: 0, rotate: 90 }}
                      transition={{ type: 'spring', stiffness: 250, damping: 16 }}
                    />
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </div>
        )}

        {error && <div className="form-msg show error" style={{ marginTop: 16 }}>{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-amber" disabled={busy} onClick={handleSave}>{busy ? 'Guardando…' : 'Guardar avatar'}</button>
        </div>
      </div>
    </Modal>
  );
}
