import { getServerSettings } from '@/lib/serverSettings';

// Permite "Añadir a pantalla de inicio" (en iPhone es necesario para recibir notificaciones push).
export default async function manifest() {
  const s = await getServerSettings();
  return {
    name: s.brand_name,
    short_name: s.brand_name.length > 14 ? s.brand_name.slice(0, 14) : s.brand_name,
    description: s.tagline || `Haz tu pedido en línea en ${s.brand_name}.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FBF8F2',
    theme_color: s.primary_color || '#D5402C',
    icons: [{ src: s.logo_url || '/favicon.svg', sizes: 'any', purpose: 'any' }],
  };
}
