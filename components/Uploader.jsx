'use client';
import { PRODUCT_PHOTO_MIN, PRODUCT_PHOTO_MAX, LANDSCAPE_MIN_W, LANDSCAPE_MIN_H, MAX_VIDEO_SECONDS, COVER_W, COVER_H } from '@/lib/upload';

// kind: 'product' (PNG cuadrado sin fondo) | 'avatar' (foto cuadrada normal) | 'site' | 'offer' (foto o video panorámico 16:9)
export default function Uploader({ uploader, kind = 'site', requireTransparent, hint }) {
  const resolvedKind = kind || (requireTransparent ? 'product' : 'site');
  const isProduct = resolvedKind === 'product';
  const isAvatar = resolvedKind === 'avatar';
  const isLogo = resolvedKind === 'logo';
  const isCover = resolvedKind === 'cover';
  const { inputRef, previewUrl, previewIsVideo, progress, uploading, error, onInputChange, reset } = uploader;

  const accept = isProduct ? 'image/png' : (isLogo ? 'image/png,image/jpeg,image/webp,image/svg+xml' : (isAvatar ? 'image/*' : 'image/*,video/mp4,video/webm'));
  const defaultHint = isProduct
    ? `PNG cuadrado, sin fondo, entre ${PRODUCT_PHOTO_MIN}×${PRODUCT_PHOTO_MIN} y ${PRODUCT_PHOTO_MAX}×${PRODUCT_PHOTO_MAX}px.`
    : isLogo
      ? 'PNG, JPG, WebP o SVG de hasta 2 MB. Lo ideal: PNG con fondo transparente.'
      : isAvatar
      ? `Foto cuadrada, entre ${PRODUCT_PHOTO_MIN}×${PRODUCT_PHOTO_MIN} y ${PRODUCT_PHOTO_MAX}×${PRODUCT_PHOTO_MAX}px.`
      : isCover
      ? `Foto o video vertical de ${COVER_W} × ${COVER_H} px (9:16). Video: máx. ${MAX_VIDEO_SECONDS}s, sin sonido.`
      : `Foto o video panorámico (16:9), mínimo ${LANDSCAPE_MIN_W}×${LANDSCAPE_MIN_H}px. Video: máx. ${MAX_VIDEO_SECONDS}s.`;

  return (
    <div className={`uploader${isProduct ? ' transparent-required' : ''}`}>
      <div className={`up-preview${previewUrl ? ' show' : ''}${isAvatar ? ' up-preview-round' : ''}`}>
        {previewUrl ? (
          previewIsVideo
            ? <video src={previewUrl} muted autoPlay loop playsInline />
            : <img src={previewUrl} alt="" />
        ) : null}
        <button type="button" className="up-remove" aria-label="Quitar" onClick={reset}>
          <svg className="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={onInputChange}
      />
      <button type="button" className="up-btn" disabled={uploading} onClick={() => inputRef.current && inputRef.current.click()}>
        <svg className="icon" viewBox="0 0 24 24"><path d="M12 16V5M8 9l4-4 4 4" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
        {uploading ? 'Subiendo…' : `${previewUrl ? 'Cambiar' : 'Elegir'} ${isLogo ? 'logo' : (isProduct || isAvatar ? 'foto' : 'foto o video')}`}
      </button>
      <span className="up-hint">{hint || defaultHint}</span>
      {isProduct && (
        <span className="up-note">¿No sabe cómo quitar el fondo o recortarla cuadrada? Usa remove.bg y luego cualquier recortador de fotos (gratis).</span>
      )}
      <div className={`up-bar${progress > 0 && progress < 100 ? ' show' : ''}`}>
        <i style={{ width: `${progress}%` }} />
      </div>
      {error ? <div className="up-error form-msg error show">{error}</div> : null}
    </div>
  );
}
