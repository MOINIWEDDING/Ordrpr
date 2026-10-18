'use client';
import Link from 'next/link';
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useMenuItems, money } from '@/hooks/useMenuItems';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import EditablePhoto from '@/components/EditablePhoto';
import ProductCard from '@/components/ProductCard';
import OffersCarousel from '@/components/OffersCarousel';
import GiftCardModal from '@/components/GiftCardModal';
import GiftCardDesignManager from '@/components/GiftCardDesignManager';
import GiftCardGiftModal from '@/components/GiftCardGiftModal';
import Avatar from '@/components/Avatar';
import AvatarPicker from '@/components/AvatarPicker';
import AvatarLibraryManager from '@/components/AvatarLibraryManager';
import TableManager from '@/components/TableManager';
import EarlyBirdManager from '@/components/EarlyBirdManager';
import TaxSettingsManager from '@/components/TaxSettingsManager';
import OrderMessagesManager from '@/components/OrderMessagesManager';
import Reveal from '@/components/Reveal';
import AuthGate from '@/components/AuthGate';
import BranchSwitcher from '@/components/BranchSwitcher';
import BrandLogo from '@/components/BrandLogo';
import BrandSettingsForm from '@/components/BrandSettingsForm';
import ThemeEditor from '@/components/ThemeEditor';
import BranchesManager from '@/components/BranchesManager';
import TeamManager from '@/components/TeamManager';

export default function CuentaPage() {
  const { profile, isStaff, isComensal, logout } = useAuth();

  if (!profile) return <AuthGate />;
  if (isStaff) return <StaffView profile={profile} logout={logout} />;
  if (isComensal) return <ComensalView profile={profile} logout={logout} />;
  return <ClientView profile={profile} logout={logout} />;
}

// Encabezado común: quién eres, con qué rol y en qué sucursal estás.
function AccountHeader({ profile, role, onChangeAvatar }) {
  return (
    <Reveal className="acct-head">
      <div className="acct-head-main">
        <Avatar profile={profile} size={64} />
        <div className="acct-head-text">
          <p className="acct-role">{role}</p>
          <h1>{profile.name || 'Tu cuenta'}</h1>
          {onChangeAvatar && (
            <button type="button" className="acct-link" onClick={onChangeAvatar}>Cambiar avatar</button>
          )}
        </div>
      </div>
      <div className="acct-head-branch"><BranchSwitcher /></div>
    </Reveal>
  );
}

function LogoutButton({ logout }) {
  return <button type="button" className="btn btn-ghost btn-block acct-logout" onClick={logout}>Cerrar sesión</button>;
}

function ComensalView({ profile, logout }) {
  return (
    <section className="cuenta-page">
      <div className="wrap">
        <AccountHeader profile={profile} role="Comensal" />

        <Reveal delay={0.05} style={{ marginTop: 20 }}>
          <Link href="/ordenes" className="acct-cta">
            <span>
              <b>Ir a Órdenes</b>
              <small>Ve y actualiza los pedidos de la sucursal que tengas activa. Es la única sección de tu cuenta.</small>
            </span>
            <Chevron />
          </Link>
        </Reveal>

        <LogoutButton logout={logout} />
      </div>
    </section>
  );
}

function Chevron({ className = '' }) {
  return <svg className={`acct-chevron ${className}`} viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;
}

function ClientView({ profile, logout }) {
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const { items } = useMenuItems();
  const { ids, isGuest } = useFavorites();
  const favItems = useMemo(() => items.filter((i) => ids.has(i.id)), [items, ids]);
  const [giftModal, setGiftModal] = useState(null); // 'buy' | 'redeem' | null
  const [giftCards, setGiftCards] = useState([]);
  const [viewingCard, setViewingCard] = useState(null);

  const loadGiftCards = useCallback(async () => {
    if (!BARRO_CONFIGURED) return;
    // Se hace en dos pasos (en vez de un "join" embebido) para que nunca se
    // pierda una tarjeta por culpa de permisos sobre un diseño relacionado.
    const { data: cards, error } = await sb
      .from('gift_cards')
      .select('*')
      .or(`buyer_user_id.eq.${profile.id},redeemed_by.eq.${profile.id}${profile.email ? `,recipient_email.eq.${profile.email}` : ''}`)
      .order('created_at', { ascending: false });
    if (error || !cards) return;

    const designIds = [...new Set(cards.map((c) => c.design_id).filter(Boolean))];
    let designsById = {};
    if (designIds.length) {
      const { data: designs } = await sb.from('gift_card_designs').select('id, name, image_url').in('id', designIds);
      (designs || []).forEach((d) => { designsById[d.id] = d; });
    }
    setGiftCards(cards.map((c) => ({ ...c, design: designsById[c.design_id] || null })));
  }, [profile.id]);

  useEffect(() => { loadGiftCards(); }, [loadGiftCards]);

  return (
    <section className="cuenta-page">
      <div className="wrap">
        <AccountHeader profile={profile} role="Cliente" onChangeAvatar={() => setPickingAvatar(true)} />

        {pickingAvatar && <AvatarPicker onClose={() => setPickingAvatar(false)} />}

        <Reveal className="giftcard-card" delay={0.08}>
          <BrandLogo alt="" className="card-logo-mark" />
          <span className="eyebrow" style={{ color: 'rgba(243,236,221,0.75)' }}>Balance de gift card</span>
          <h3>{money(profile.gift_card_balance || 0)}</h3>
          <div className="giftcard-actions">
            <button type="button" className="btn btn-amber btn-sm" onClick={() => setGiftModal('buy')}>Comprar</button>
            <button type="button" className="btn btn-ghost-light btn-sm" onClick={() => setGiftModal('redeem')}>Canjear</button>
          </div>
        </Reveal>

        {giftCards.length > 0 && (
          <GiftCardBanners cards={giftCards} onSelect={setViewingCard} />
        )}

        <div className="home-section-top" style={{ marginTop: 34 }}>
          <h3>Tus favoritos</h3>
          {favItems.length > 0 && <span className="acct-count">{favItems.length}</span>}
        </div>
        {isGuest && <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Sesión de invitado: tus favoritos no se guardan al cerrar el navegador.</p>}
        {favItems.length === 0 ? (
          <div className="acct-empty">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
            <p>Todavía no tienes favoritos. Toca el corazón en cualquier producto del menú y aparecerá aquí.</p>
            <Link href="/menu" className="pill-btn-dark">Ver el menú</Link>
          </div>
        ) : (
          <div className="home-grid">
            {favItems.map((item) => <ProductCard key={item.id} item={item} tint="manana" />)}
          </div>
        )}

        <LogoutButton logout={logout} />
      </div>

      <AnimatePresence>
        {giftModal && (
          <GiftCardModal mode={giftModal} onClose={() => setGiftModal(null)} onDone={loadGiftCards} />
        )}
        {viewingCard && (
          <GiftCardDetailModal card={viewingCard} onClose={() => setViewingCard(null)} />
        )}
      </AnimatePresence>
    </section>
  );
}

function GiftCardBanners({ cards, onSelect }) {
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <>
      <div className="home-section-top" style={{ marginTop: 30 }}>
        <h3>Tus gift cards</h3>
      </div>
      <div className="offers-wrap" style={{ margin: '0 -20px' }}>
        <div className="offers-track" ref={trackRef} onScroll={onScroll}>
          {cards.map((gc) => (
            <button type="button" key={gc.id} className="offer-card giftcard-slide" onClick={() => onSelect(gc)}>
              {gc.design?.image_url && (
                <div className="ph"><img className="real" src={gc.design.image_url} alt="" /></div>
              )}
              <BrandLogo alt="" className="card-logo-mark" />
              <div className="offer-content">
                <span className="giftcard-slide-status">{gc.status === 'activa' ? 'Activa' : gc.status === 'pendiente' ? 'Pendiente de pago' : 'Canjeada'}</span>
                <span className="giftcard-slide-code">{gc.code}</span>
                <span className="giftcard-slide-amount">{money(gc.amount)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      {cards.length > 1 && (
        <div className="offers-dots">
          {cards.map((_, i) => <span key={i} className={i === index ? 'active' : ''} />)}
        </div>
      )}
    </>
  );
}

function GiftCardDetailModal({ card, onClose }) {
  return (
    <motion.div className="overlay show" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div className="modal" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
          <svg className="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        {card.design?.image_url && (
          <div className="ph" style={{ height: 160, borderRadius: '14px 14px 0 0', border: 'none' }}>
            <img className="real" src={card.design.image_url} alt="" />
          </div>
        )}
        <div className="modal-body">
          <p className="eyebrow on-cream">{card.design?.name || 'Gift card'}</p>
          <h3 style={{ marginTop: 4 }}>{money(card.amount)}</h3>
          <div className="giftcard-code" style={{ marginTop: 16 }}>{card.code}</div>
          <div className="info-list" style={{ marginTop: 20 }}>
            <div className="info-row">
              <div><b>Estado</b><span>{card.status === 'activa' ? 'Activa' : card.status === 'pendiente' ? 'Pendiente de pago' : 'Canjeada'}</span></div>
            </div>
            <div className="info-row">
              <div><b>Fecha de compra</b><span>{new Date(card.created_at).toLocaleDateString('es-DO')}</span></div>
            </div>
            {card.status === 'canjeada' && card.redeemed_by_name && (
              <div className="info-row">
                <div><b>Canjeada por</b><span>{card.redeemed_by_name}</span></div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Herramientas del dueño, agrupadas por para qué sirven. Cada una se abre como un panel
// y su contenido se carga solo la primera vez que se abre (antes se cargaban todas al entrar).
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

function StaffView({ profile, logout }) {
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [gifting, setGifting] = useState(false);

  const groups = [
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
              <button type="button" className="pill-btn-dark" style={{ marginBottom: 16 }} onClick={() => setGifting(true)}>Regalar una gift card</button>
              <GiftCardDesignManager />
            </>
          ),
        },
        { id: 'avatars', title: 'Fotos de avatar', desc: 'Los clientes eligen entre estas fotos; ellos no pueden subir las suyas.', render: () => <AvatarLibraryManager /> },
      ],
    },
  ];

  return (
    <section className="cuenta-page">
      <div className="wrap">
        <AccountHeader profile={profile} role="Dueño" onChangeAvatar={() => setPickingAvatar(true)} />

        {pickingAvatar && <AvatarPicker onClose={() => setPickingAvatar(false)} />}

        <nav className="acct-jump" aria-label="Secciones del panel">
          {groups.map((g) => <a key={g.id} href={`#${g.id}`}>{g.eyebrow}</a>)}
        </nav>

        {groups.map((g, gi) => (
          <Reveal key={g.id} delay={0.03 + gi * 0.03} className="acct-group">
            <div className="section-head acct-group-head" id={g.id}>
              <p className="eyebrow">{g.eyebrow}</p>
              <h2>{g.title}</h2>
              <p>{g.sub}</p>
            </div>
            {g.lead}
            <div className="acct-tools">
              {g.tools.map((t) => <ToolPanel key={t.id} id={t.id} title={t.title} desc={t.desc}>{t.render}</ToolPanel>)}
            </div>
          </Reveal>
        ))}

        {gifting && <GiftCardGiftModal onClose={() => setGifting(false)} onDone={() => {}} />}

        <LogoutButton logout={logout} />
      </div>
    </section>
  );
}

// Panel plegable. El contenido se monta la primera vez que se abre y después solo se oculta,
// así no se pierde lo que el dueño estaba escribiendo si lo cierra y lo vuelve a abrir.
function ToolPanel({ id, title, desc, children }) {
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
