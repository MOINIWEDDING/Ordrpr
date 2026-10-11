'use client';
import { useEffect } from 'react';

export default function Modal({ open = true, onClose, wide = false, children }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose && onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className={`modal${wide ? ' wide' : ''}`}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
          <svg className="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        {children}
      </div>
    </div>
  );
}
