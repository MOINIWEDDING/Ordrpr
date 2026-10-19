// Íconos para los sellos del pase (sin 'use client': también los usa el servidor para dibujar el
// pase de Apple Wallet). Trazos sobre una cuadrícula de 48×48.
export const STAMP_ICONS = {
  star: [['path', { d: 'M24 6l5.5 12L42 20l-9.5 8.5L35 41l-11-6.5L13 41l2.5-12.5L6 20l12.5-2z' }]],
  heart: [['path', { d: 'M24 40s-14-8.5-14-19a8 8 0 0 1 14-5.3A8 8 0 0 1 38 21c0 10.5-14 19-14 19z' }]],
  coffee: [['path', { d: 'M10 18h22v10a10 10 0 0 1-10 10h-2a10 10 0 0 1-10-10z' }], ['path', { d: 'M32 21h3a5 5 0 0 1 0 10h-3' }], ['path', { d: 'M16 7c-2 3 2 4 0 7M22 7c-2 3 2 4 0 7M28 7c-2 3 2 4 0 7' }]],
  burger: [['path', { d: 'M9 22a15 10 0 0 1 30 0z' }], ['path', { d: 'M8 28h32' }], ['path', { d: 'M10 33h28a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z' }]],
  pizza: [['path', { d: 'M24 42 8 12c10-5 22-5 32 0z' }], ['circle', { cx: 19, cy: 18, r: 2 }], ['circle', { cx: 29, cy: 21, r: 2 }], ['circle', { cx: 23, cy: 29, r: 2 }]],
  flame: [['path', { d: 'M24 6c6 8 11 15 11 22a11 11 0 0 1-22 0c0-3 1-6 3-9-.5 3.5 1 6 3.5 6s3.5-2.3 2.6-5.4c-1.2-4-.4-8.3 2.9-13.6z' }]],
  meat: [['path', { d: 'M14 12a11 11 0 0 1 15.5 15.5L19 38c-3 3-8 3-10.6.4S5.9 31.4 9 28z' }], ['circle', { cx: 33.5, cy: 37.5, r: 3 }]],
  drink: [['path', { d: 'M15 14h18l-2 22a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3z' }], ['path', { d: 'M18.5 14l1-6h9l1 6' }]],
  dessert: [['path', { d: 'M7 33 24 10l17 23z' }], ['path', { d: 'M11 29h26M14.5 25h19' }]],
  crown: [['path', { d: 'M8 34 6 14l10 9 8-13 8 13 10-9-2 20z' }], ['path', { d: 'M8 39h32' }]],
  smile: [['circle', { cx: 24, cy: 24, r: 16 }], ['path', { d: 'M17 28a9 9 0 0 0 14 0' }], ['circle', { cx: 18.5, cy: 20, r: 1.6 }], ['circle', { cx: 29.5, cy: 20, r: 1.6 }]],
  check: [['path', { d: 'M10 25l9 9 19-20' }]],
};

export const STAMP_ICON_KEYS = Object.keys(STAMP_ICONS);

export default function StampIcon({ name = 'star', color = 'currentColor', strokeWidth = 3, size, style }) {
  const parts = STAMP_ICONS[name] || STAMP_ICONS.star;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} style={style} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {parts.map(([Tag, attrs], i) => <Tag key={i} {...attrs} />)}
    </svg>
  );
}
