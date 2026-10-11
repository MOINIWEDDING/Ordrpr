// Convierte UN color de marca (hex) en todas las variables CSS que usa la plataforma.
export const DEFAULT_PRIMARY = '#D5402C';

export function isValidHex(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());
}

export function hexToHsl(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { h: Math.round(hue), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// Luminancia relativa (WCAG) para decidir si el texto sobre el color va blanco u oscuro.
function luminance(hex) {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function themeVars(primary) {
  const hex = isValidHex(primary) ? primary.trim() : DEFAULT_PRIMARY;
  const { h, s, l } = hexToHsl(hex);
  const deepL = Math.max(l - 14, 12);
  const softS = Math.min(s, 75);
  return {
    '--amber': hex,
    '--amber-deep': `hsl(${h} ${s}% ${deepL}%)`,
    '--amber-soft': `hsl(${h} ${softS}% 92%)`,
    '--on-amber': luminance(hex) > 0.5 ? '#1a1410' : '#ffffff',
    '--brand-h': String(h),
  };
}

// Para inyectar en el HTML del servidor (evita el "parpadeo" de color al cargar).
export function themeCss(primary) {
  const vars = themeVars(primary);
  return `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`;
}

export function applyTheme(primary) {
  if (typeof document === 'undefined') return;
  const vars = themeVars(primary);
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
}
