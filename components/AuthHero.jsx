'use client';
import { useEffect, useRef, useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { isVideoUrl } from '@/lib/upload';
import { useSettings } from '@/context/SettingsContext';

// Portada del acceso (login y registro): foto o video que sube el dueño desde
// Cuenta → Fotos del sitio → "Portada de acceso". Mientras no suba nada se muestra
// un adorno de esferas suaves que toma los tonos del color de marca.

function useAuthCover() {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    async function load() {
      if (!BARRO_CONFIGURED) return;
      const { data, error } = await sb.from('site_images').select('url').eq('key', 'welcome').maybeSingle();
      if (active && !error && data && data.url) setUrl(data.url);
    }
    load();
    return () => { active = false; };
  }, []);
  return url;
}

// (hue relativo al color de marca, tamaño, posición y ritmo de cada esfera)
const ORBS = [
  { o: 0,   s: 54, style: { right: '-11%', top: '5%' },     d: 7.5 },
  { o: 150, s: 46, style: { left: '-10%', top: '9%' },      d: 8.5 },
  { o: 210, s: 60, style: { left: '-13%', bottom: '3%' },   d: 9 },
  { o: 48,  s: 56, style: { right: '-13%', bottom: '-3%' }, d: 8 },
  { o: -32, s: 17, style: { left: '43%', top: '3%' },       d: 6 },
  { o: 22,  s: 19, style: { left: '37%', bottom: '2%' },    d: 6.5 },
];

function Orbs() {
  return (
    <div className="auth-orbs" aria-hidden="true">
      {ORBS.map((b, i) => (
        <span
          key={i}
          className="auth-orb"
          style={{ ...b.style, '--o': b.o, '--k': b.s, '--d': `${b.d}s`, animationDelay: `${-i * 1.3}s` }}
        />
      ))}
      <svg className="auth-doodle" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path vectorEffect="non-scaling-stroke" d="M24 44 C 34 24, 56 16, 80 26" />
        <path vectorEffect="non-scaling-stroke" d="M12 70 C 28 74, 44 68, 52 56" />
      </svg>
      <span className="auth-bubble">¡Hola!</span>
    </div>
  );
}

export function AuthMedia() {
  const url = useAuthCover();
  const [ready, setReady] = useState(false);
  const videoRef = useRef(null);
  const isVideo = isVideoUrl(url);

  // Con "reducir movimiento" activado el video se queda en su primer cuadro.
  function onVideoReady() {
    setReady(true);
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches && videoRef.current) videoRef.current.pause();
    } catch (e) { /* ignore */ }
  }

  return (
    <div className="auth-media">
      <Orbs />
      {url && (isVideo ? (
        <video
          ref={videoRef}
          className={`auth-media-fill${ready ? ' is-ready' : ''}`}
          src={url}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onLoadedData={onVideoReady}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={`auth-media-fill${ready ? ' is-ready' : ''}`}
          src={url}
          alt=""
          // si la foto ya estaba en caché, puede estar lista antes de que React escuche "load"
          ref={(el) => { if (el && el.complete && el.naturalWidth > 0) setReady(true); }}
          onLoad={() => setReady(true)}
        />
      ))}
    </div>
  );
}

// Nombre del negocio en grande (o su logo, si ya lo subió).
export function AuthBrand() {
  const { settings } = useSettings();
  const name = (settings.brand_name || '').trim();
  // La palabra más larga decide el tamaño: así el nombre nunca se parte a la mitad.
  // (los nombres de varias palabras se achican un poco más para que no ocupen media pantalla)
  const longest = Math.max(4, name.length * 0.45, ...name.split(/\s+/).map((w) => w.length));
  return (
    <div className="auth-brand">
      {settings.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="auth-logo" src={settings.logo_url} alt={name} />
      ) : (
        <h1 className="auth-wordmark" style={{ '--len': longest }}>{name}</h1>
      )}
    </div>
  );
}
