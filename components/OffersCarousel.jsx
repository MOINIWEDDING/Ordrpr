'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useUploader } from '@/hooks/useUploader';
import { isVideoUrl } from '@/lib/upload';
import Modal from './Modal';
import Reveal from './Reveal';

function demoOffers() {
  return [
    { id: 'o1', title: 'Tu primera oferta', subtitle: 'Edita este banner desde el panel del dueño.', image_url: '', cta_text: 'Ver menú', cta_link: '/menu' },
  ];
}

export default function OffersCarousel() {
  const { isStaff } = useAuth();
  const [offers, setOffers] = useState([]);
  const [editing, setEditing] = useState(null); // offer object | 'new' | null
  const [deletingId, setDeletingId] = useState(null);
  const trackRef = useRef(null);
  const [dotIndex, setDotIndex] = useState(0);

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setOffers(demoOffers()); return; }
    const { data, error } = await sb.from('offers').select('*').order('sort_order', { ascending: true });
    // Antes esto se quedaba vacío si la tabla 'offers' no existía todavía
    // (por no haber corrido la migración). Ahora, solo en caso de error real
    // cae en las ofertas de muestra; si de verdad no hay ninguna, respeta eso.
    if (error) { setOffers(demoOffers()); return; }
    setOffers(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    setDotIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  async function handleDelete(id) {
    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('offers').delete().eq('id', id);
      if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    }
    setDeletingId(null);
    await load();
  }

  const showEmptyState = offers.length === 0 && !isStaff;
  if (showEmptyState) return null;

  return (
    <>
      <Reveal className="offers-wrap">
        <div className="offers-track" ref={trackRef} onScroll={onScroll}>
          {offers.map((offer) => (
            <div className="offer-card" key={offer.id}>
              <div className="ph">
                {offer.image_url
                  ? (isVideoUrl(offer.image_url)
                    ? <video className="real" src={offer.image_url} autoPlay muted loop playsInline />
                    : <img className="real" src={offer.image_url} alt={offer.title} />)
                  : <svg className="ph-icon" viewBox="0 0 24 24"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.4" /></svg>}
              </div>
              <div className="offer-content">
                <p className="eyebrow">Oferta</p>
                <h3>{offer.title}</h3>
                {offer.subtitle && <p>{offer.subtitle}</p>}
                <a className="offer-cta" href={offer.cta_link || '/menu'}>
                  {offer.cta_text || 'Ver más'}
                  <svg className="icon" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </a>
              </div>
              <div className="offer-admin">
                <button type="button" className="icon-btn" aria-label="Editar" onClick={() => setEditing(offer)}>
                  <svg className="icon" style={{ width: 14, height: 14 }} viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                </button>
                <button type="button" className="icon-btn danger" aria-label="Eliminar" onClick={() => setDeletingId(offer.id)}>
                  <svg className="icon" style={{ width: 14, height: 14 }} viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
                </button>
              </div>
              {deletingId === offer.id && (
                <div className="confirm-del-sm">
                  <span>¿Eliminar este banner?</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-amber" style={{ border: 'none' }} onClick={() => handleDelete(offer.id)}>Sí, eliminar</button>
                    <button type="button" className="btn-ghost" style={{ border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff' }} onClick={() => setDeletingId(null)}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="offers-add" onClick={() => setEditing('new')}>
            <div className="plus"><svg className="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></div>
            <span>{offers.length ? 'Agregar banner' : 'Agregar banner de oferta'}</span>
          </button>
        </div>
      </Reveal>
      {offers.length > 0 && (
        <div className="offers-dots">
          {offers.map((_, i) => <span key={i} className={i === dotIndex ? 'active' : ''} />)}
        </div>
      )}

      {editing && <OfferModal offer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  );
}

// Accesos rápidos para el enlace del botón del banner.
const LINK_SHORTCUTS = [
  { label: 'Menú', href: '/menu' },
  { label: 'Visítanos', href: '/visitanos' },
  { label: 'Nosotros', href: '/nosotros' },
];

// Editor del banner con el mismo estilo que el de productos: vista previa en vivo arriba (tocarla
// elige la foto o el video) y los datos agrupados debajo.
function OfferModal({ offer, onClose, onSaved }) {
  const uploader = useUploader();
  const [title, setTitle] = useState(offer ? offer.title : '');
  const [subtitle, setSubtitle] = useState(offer ? (offer.subtitle || '') : '');
  const [ctaText, setCtaText] = useState(offer ? (offer.cta_text || 'Ver menú') : 'Ver menú');
  const { settings } = useSettings();
  const linkShortcuts = LINK_SHORTCUTS.filter((l) => l.href !== '/nosotros' || settings.show_nosotros !== false);
  const [ctaLink, setCtaLink] = useState(offer ? (offer.cta_link || '/menu') : '/menu');
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (offer && offer.image_url) uploader.setUrl(offer.image_url); }, []); // eslint-disable-line

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setMsg({ text: 'Escribe un título.', type: 'error' }); return; }
    if (uploader.uploading) { setMsg({ text: 'Espera a que la foto o video termine de subir.', type: 'error' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ text: 'Conecta Supabase para guardar cambios de verdad.', type: 'error' }); return; }
    const payload = {
      title: title.trim(),
      subtitle: subtitle.trim(),
      image_url: uploader.url,
      cta_text: ctaText.trim() || 'Ver menú',
      cta_link: ctaLink.trim() || '/menu',
    };
    setSaving(true);
    let error;
    if (offer) {
      payload.updated_at = new Date().toISOString();
      ({ error } = await sb.from('offers').update(payload).eq('id', offer.id));
    } else {
      ({ error } = await sb.from('offers').insert(payload));
    }
    setSaving(false);
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    await onSaved();
    onClose();
  }

  const pick = () => uploader.inputRef.current && uploader.inputRef.current.click();

  return (
    <Modal onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="pe">
        <div className="pe-head">
          <p className="eyebrow">Banners de oferta</p>
          <h3>{offer ? 'Editar banner' : 'Nuevo banner'}</h3>
        </div>

        <div className="pe-banner">
          <button type="button" className="pe-banner-media" onClick={pick} disabled={uploader.uploading} aria-label={uploader.previewUrl ? 'Cambiar foto o video' : 'Elegir foto o video'}>
            {uploader.previewUrl
              ? (uploader.previewIsVideo
                ? <video src={uploader.previewUrl} autoPlay muted loop playsInline />
                : <img src={uploader.previewUrl} alt="" />)
              : (
                <span className="pe-photo-empty pe-banner-empty">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.4" /></svg>
                  Agregar foto o video
                </span>
              )}
            {uploader.previewUrl && !uploader.uploading && <span className="pe-photo-change">Cambiar</span>}
            {uploader.uploading && <span className="pe-photo-progress"><i style={{ width: `${Math.max(uploader.progress, 12)}%` }} /></span>}
          </button>
          {uploader.previewUrl && !uploader.uploading && (
            <button type="button" className="pe-photo-remove" onClick={uploader.reset} aria-label="Quitar foto o video">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          )}
          <div className="offer-content pe-banner-content">
            <p className="eyebrow">Oferta</p>
            <h3>{title.trim() || 'Título del banner'}</h3>
            {subtitle.trim() && <p>{subtitle}</p>}
            <span className="offer-cta">
              {ctaText.trim() || 'Ver menú'}
              <svg className="icon" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </div>
          <input ref={uploader.inputRef} type="file" accept="image/*,video/mp4,video/webm" hidden onChange={uploader.onInputChange} />
        </div>
        <p className="pe-photo-hint">Foto o video horizontal 16:9 · video de hasta 20 s</p>
        {uploader.error && <div className="form-msg show error">{uploader.error}</div>}

        <section className="pe-section">
          <h4>Texto</h4>
          <div className="field">
            <label htmlFor="offerTitle">Título</label>
            <input id="offerTitle" type="text" placeholder="2×1 en jugos naturales" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="offerSub">Subtítulo</label>
            <input id="offerSub" type="text" placeholder="Todos los martes, de 3 a 6 p. m." value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </div>
        </section>

        <section className="pe-section">
          <h4>Botón</h4>
          <div className="field">
            <label htmlFor="offerCta">Texto</label>
            <input id="offerCta" type="text" placeholder="Ver menú" value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="offerLink">Lleva a</label>
            <div className="pe-link-chips">
              {linkShortcuts.map((l) => (
                <button key={l.href} type="button" className={`pe-link-chip${ctaLink === l.href ? ' active' : ''}`} onClick={() => setCtaLink(l.href)}>{l.label}</button>
              ))}
            </div>
            <input id="offerLink" type="text" placeholder="/menu o https://…" value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} />
          </div>
        </section>

        {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}

        <div className="pe-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-amber" disabled={uploader.uploading || saving}>
            {uploader.uploading ? 'Subiendo…' : saving ? 'Guardando…' : (offer ? 'Guardar cambios' : 'Crear banner')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
