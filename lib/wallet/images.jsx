import { ImageResponse } from 'next/og';
import StampIcon from '@/components/StampIcon';

// Imágenes del pase de Apple Wallet, dibujadas con los colores y el sello que eligió el local.

async function png(element, width, height) {
  const res = new ImageResponse(element, { width, height });
  return Buffer.from(await res.arrayBuffer());
}

const isHttps = (u) => /^https:\/\//.test(u || '');

// Franja con los sellos (strip.png): 375×123 en @1x.
export function stripImage({ s, stamps }, scale) {
  const W = 375 * scale;
  const H = 123 * scale;
  const total = s.stamps_required;
  const rows = total > 10 ? 2 : 1;
  const perRow = Math.ceil(total / rows);
  const pad = 18 * scale;
  const gap = (rows === 2 ? 7 : 9) * scale;
  const size = Math.min((W - pad * 2 - gap * (perRow - 1)) / perRow, (H - pad * 2 - gap * (rows - 1)) / rows);
  const ring = Math.max(2, Math.round(size * 0.06));
  const items = Array.from({ length: total }, (_, i) => i < stamps);
  return png(
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: s.bg_color }}>
      {isHttps(s.strip_image_url) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.strip_image_url} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' }} />
      )}
      {isHttps(s.strip_image_url) && <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, background: s.bg_color, opacity: 0.55 }} />}
      <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap }}>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} style={{ display: 'flex', gap }}>
            {items.slice(r * perRow, (r + 1) * perRow).map((filled, i) => (
              <div
                key={i}
                style={{
                  width: size, height: size, borderRadius: size, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: filled ? s.stamp_color : 'transparent',
                  border: filled ? `${ring}px solid ${s.stamp_color}` : `${ring}px solid ${s.fg_color}`,
                  opacity: filled ? 1 : 0.4,
                }}
              >
                {filled && (isHttps(s.stamp_image_url)
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={s.stamp_image_url} width={size * 0.66} height={size * 0.66} style={{ objectFit: 'contain' }} />
                  : <StampIcon name={s.stamp_icon} color="#ffffff" strokeWidth={3.6} size={size * 0.7} />)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>,
    W, H,
  );
}

// Ícono (icon.png, 29×29 en @1x): el logo sobre el color del pase, o la inicial del negocio.
export function iconImage({ s, logo, brand }, scale) {
  const W = 29 * scale;
  return png(
    <div style={{ width: W, height: W, display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.bg_color, color: s.fg_color, fontSize: W * 0.55, fontWeight: 700 }}>
      {isHttps(logo)
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={logo} width={W * 0.8} height={W * 0.8} style={{ objectFit: 'contain' }} />
        : (brand || '•').trim().charAt(0).toUpperCase()}
    </div>,
    W, W,
  );
}

// Logo de arriba a la izquierda (logo.png, hasta 160×50 en @1x).
export function logoImage({ logo }, scale) {
  const W = 160 * scale;
  const H = 50 * scale;
  return png(
    <div style={{ width: W, height: H, display: 'flex', alignItems: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} height={H} style={{ maxWidth: W, height: H, objectFit: 'contain' }} />
    </div>,
    W, H,
  );
}
