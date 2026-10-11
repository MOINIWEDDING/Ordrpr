'use client';
import { useSettings } from '@/context/SettingsContext';

// Logo del negocio. Si todavía no sube uno, muestra un círculo con la inicial en el color de marca.
export default function BrandLogo({ className = '', alt, style }) {
  const { settings } = useSettings();
  const name = settings.brand_name || '';
  if (settings.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={settings.logo_url} alt={alt !== undefined ? alt : name} className={className} style={style} />;
  }
  const initial = (name.trim()[0] || '•').toUpperCase();
  return (
    <svg
      viewBox="0 0 100 100" role="img" aria-label={alt !== undefined ? alt : name}
      className={className} style={style}
    >
      <circle cx="50" cy="50" r="50" fill="var(--amber)" />
      <text x="50" y="67" textAnchor="middle" fontSize="54" fontWeight="800" fill="var(--on-amber)" fontFamily="var(--font-display), sans-serif">{initial}</text>
    </svg>
  );
}
