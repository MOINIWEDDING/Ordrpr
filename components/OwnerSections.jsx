'use client';
import Link from 'next/link';
import { useState } from 'react';
import EditablePhoto from '@/components/EditablePhoto';
import OffersCarousel from '@/components/OffersCarousel';
import GiftCardDesignManager from '@/components/GiftCardDesignManager';
import AvatarLibraryManager from '@/components/AvatarLibraryManager';
import TableManager from '@/components/TableManager';
import EarlyBirdManager from '@/components/EarlyBirdManager';
import TaxSettingsManager from '@/components/TaxSettingsManager';
import OrderMessagesManager from '@/components/OrderMessagesManager';
import BrandSettingsForm from '@/components/BrandSettingsForm';
import ThemeEditor from '@/components/ThemeEditor';
import BranchesManager from '@/components/BranchesManager';
import TeamManager from '@/components/TeamManager';
import HomeOrderManager from '@/components/HomeOrderManager';
import CsvImporter from '@/components/CsvImporter';
import MenuDesignEditor from '@/components/MenuDesignEditor';

export function Chevron({ className = '' }) {
  return <svg className={`acct-chevron ${className}`} viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;
}

const SITE_PHOTOS = [
  { key: 'welcome', label: 'Portada de acceso', caption: 'Portada de acceso (login y registro)', uploadKind: 'cover', modalSub: 'Es la foto o video que se ve arriba en la entrada, el inicio de sesión y el registro. Debe ser vertical de 1080 × 1920 px (9:16). Pon lo importante en la mitad de arriba: abajo lo tapan los botones. Un video corto (hasta 20 s, sin sonido) se repite solo.' },
  { key: 'hero', label: 'Portada', caption: 'Portada / oferta' },
  { key: 'founder', label: 'Fundador', caption: 'Fundador' },
  { key: 'azotea', label: 'Ambiente', caption: 'Ambiente / terraza' },
  { key: 'gallery-0', label: 'Galería 1', caption: 'Galería 1' },
  { key: 'gallery-1', label: 'Galería 2', caption: 'Galería 2' },
  { key: 'gallery-2', label: 'Galería 3', caption: 'Galería 3' },
  { key: 'map', label: 'Mapa', caption: 'Mapa / fachada' },
];

function SitePhotos() {
  return (
    <div className="admin-photo-grid">
      {SITE_PHOTOS.map((ph) => (
        <div key={ph.key}>
          <EditablePhoto imgKey={ph.key} label={ph.label} className="admin-thumb" uploadKind={ph.uploadKind} modalSub={ph.modalSub} />
          <span>{ph.caption}</span>
        </div>
      ))}
    </div>
  );
}

// Las secciones del panel del dueño. Cada una tiene su propia página en /cuenta/<id>;
// dentro, cada herramienta es un panel que carga su contenido solo la primera vez que se abre.
export function ownerSections({ onGift }) {
  return [
    {
      id: 'negocio',
      eyebrow: 'Tu negocio',
      title: 'Configuración',
      sub: 'Nombre, logo, colores, sucursales y equipo. Los cambios se ven al instante en toda la página.',
      lead: (
        <Link href="/setup" className="acct-cta acct-cta-dark">
          <span>
            <b>Asistente de configuración</b>
            <small>Te guía paso a paso por lo esencial de tu negocio.</small>
          </span>
          <Chevron />
        </Link>
      ),
      tools: [
        { id: 'identity', title: 'Nombre y logo', desc: 'Nombre, eslogan, logo y descripción para Google.', render: () => <BrandSettingsForm group="identity" /> },
        { id: 'colors', title: 'Colores', desc: 'Los colores de botones, fondos y textos.', render: () => <ThemeEditor /> },
        { id: 'branches', title: 'Sucursales', desc: 'Los locales donde atiendes.', render: () => <BranchesManager /> },
        { id: 'team', title: 'Equipo', desc: 'Dueños y comensales que te ayudan con los pedidos.', render: () => <TeamManager /> },
        { id: 'contact', title: 'Contacto y horario', desc: 'Dirección, teléfono, WhatsApp, redes y horario.', render: () => <BrandSettingsForm group="contact" /> },
        { id: 'money', title: 'Moneda y gift cards', desc: 'Símbolo de la moneda y prefijo de los códigos de gift card.', render: () => <BrandSettingsForm group="money" /> },
      ],
    },
    {
      id: 'pagina',
      eyebrow: 'Tu página',
      title: 'Personalización',
      sub: 'Los productos y categorías se editan directamente en Inicio y Menú (aparecen los controles al pasar el cursor). Aquí manejas las fotos, los banners y la página Nosotros.',
      tools: [
        { id: 'homeorder', title: 'Orden del inicio', desc: 'Sube, baja u oculta categorías y productos del inicio.', render: () => <HomeOrderManager /> },
        { id: 'csv', title: 'Importar productos (CSV)', desc: 'Carga o actualiza muchos productos y categorías de una vez.', render: () => <CsvImporter /> },
        { id: 'menudesign', title: 'Diseño del menú', desc: 'Tu propio CSS y HTML para el menú tipo carta.', render: () => <MenuDesignEditor /> },
        { id: 'photos', title: 'Fotos del sitio', desc: 'Portada de acceso, portada, ambiente, galería y mapa.', render: () => <SitePhotos /> },
        { id: 'offers', title: 'Banners de oferta', desc: 'Los anuncios que se deslizan en Inicio.', render: () => <OffersCarousel /> },
        {
          id: 'nosotros',
          title: 'Página "Nosotros"',
          desc: 'No está en tu barra de navegación, pero puedes editarle el texto y las fotos.',
          render: () => <Link href="/nosotros" className="pill-btn-dark">Editar página de Nosotros</Link>,
        },
      ],
    },
    {
      id: 'pedidos',
      eyebrow: 'Pedidos',
      title: 'Cómo se pide',
      sub: 'Mesas, precios finales, avisos al cliente y promociones del día.',
      tools: [
        { id: 'tables', title: 'Mesas', desc: 'Las mesas que el cliente elige al pedir en la sucursal activa.', render: () => <TableManager /> },
        { id: 'taxes', title: 'Impuestos y porcientos', desc: 'Se suman automáticamente al precio cuando alguien paga desde la app.', render: () => <TaxSettingsManager /> },
        { id: 'messages', title: 'Avisos de pedidos', desc: 'El mensaje que le sale al cliente cuando cambias el estado de su pedido.', render: () => <OrderMessagesManager /> },
        { id: 'earlybird', title: 'Early Bird · bebida gratis', desc: 'El primero que pida dentro del horario se gana el premio. Se reinicia cada día.', render: () => <EarlyBirdManager /> },
      ],
    },
    {
      id: 'clientes',
      eyebrow: 'Clientes',
      title: 'Gift cards y avatares',
      sub: 'Lo que tus clientes compran, reciben y eligen para su perfil.',
      tools: [
        {
          id: 'giftdesigns',
          title: 'Diseños de gift card',
          desc: 'Las tarjetas que tus clientes pueden comprar o recibir de regalo.',
          render: () => (
            <>
              <button type="button" className="pill-btn-dark" style={{ marginBottom: 16 }} onClick={onGift}>Regalar una gift card</button>
              <GiftCardDesignManager />
            </>
          ),
        },
        { id: 'avatars', title: 'Fotos de avatar', desc: 'Los clientes eligen entre estas fotos; ellos no pueden subir las suyas.', render: () => <AvatarLibraryManager /> },
      ],
    },
  ];
}

// Panel plegable. El contenido se monta la primera vez que se abre y después solo se oculta,
// así no se pierde lo que el dueño estaba escribiendo si lo cierra y lo vuelve a abrir.
export function ToolPanel({ id, title, desc, children }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const bodyId = `tool-${id}`;

  function toggle() {
    setMounted(true);
    setOpen((v) => !v);
  }

  return (
    <div className={`acct-tool${open ? ' open' : ''}`}>
      <button type="button" className="acct-tool-head" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
        <span>
          <b>{title}</b>
          <small>{desc}</small>
        </span>
        <Chevron />
      </button>
      {mounted && (
        <div id={bodyId} className="acct-tool-body" hidden={!open}>
          {children()}
        </div>
      )}
    </div>
  );
}
