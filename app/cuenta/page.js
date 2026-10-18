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

function ComensalView({ profile, logout }) {
  return (
    <section className="cuenta-page">
      <div className="wrap">
        <Reveal className="profile-card">
          <Avatar profile={profile} />
          <div>
            <h3>{profile.name}</h3>
            <span className="role-tag">Comensal</span>
          </div>
        </Reveal>

        <BranchSwitcher />

        <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>
          Tu cuenta solo tiene acceso a Órdenes — ahí puedes ver y actualizar los pedidos de la sucursal que tengas activa.
        </p>
        <Link href="/ordenes" className="btn btn-amber btn-block" style={{ marginTop: 16 }}>Ir a Órdenes</Link>

        <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={logout}>Cerrar sesión</button>
      </div>
    </section>
  );
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
        <Reveal className="profile-card">
          <Avatar profile={profile} />
          <div>
            <h2 style={{ fontSize: 22 }}>{profile.name}</h2>
            <span className="role-tag">Cliente</span>
            <button type="button" className="avatar-change-link" onClick={() => setPickingAvatar(true)}>Cambiar avatar</button>
          </div>
        </Reveal>

        {pickingAvatar && <AvatarPicker onClose={() => setPickingAvatar(false)} />}

        <BranchSwitcher />

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
        </div>
        {isGuest && <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Sesión de invitado: tus favoritos no se guardan al cerrar el navegador.</p>}
        {favItems.length === 0 ? (
          <p className="empty-note">Todavía no tienes favoritos. Toca el corazón en cualquier producto del menú.</p>
        ) : (
          <div className="home-grid">
            {favItems.map((item) => <ProductCard key={item.id} item={item} tint="manana" />)}
          </div>
        )}

        <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 40 }} onClick={logout}>Cerrar sesión</button>
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
              <div className="ph">
                {gc.design?.image_url && <img className="real" src={gc.design.image_url} alt="" />}
              </div>
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

function StaffView({ profile, logout }) {
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [gifting, setGifting] = useState(false);
  return (
    <section className="cuenta-page">
      <div className="wrap">
        <Reveal className="profile-card">
          <Avatar profile={profile} />
          <div>
            <h2 style={{ fontSize: 22 }}>{profile.name}</h2>
            <span className="role-tag">Comensal · Dueño</span>
            <button type="button" className="avatar-change-link" onClick={() => setPickingAvatar(true)}>Cambiar avatar</button>
          </div>
        </Reveal>

        {pickingAvatar && <AvatarPicker onClose={() => setPickingAvatar(false)} />}

        <BranchSwitcher />

        <Reveal delay={0.03}>
          <div className="section-head" style={{ marginTop: 34 }}>
            <p className="eyebrow">Tu negocio</p>
            <h2 style={{ fontSize: 22 }}>Configuración</h2>
            <p>Nombre, logo, colores, sucursales y equipo. Los cambios se ven al instante en toda la página.</p>
          </div>
          <Link href="/setup" className="pill-btn-dark" style={{ marginBottom: 14, display: 'inline-block' }}>Abrir asistente de configuración</Link>
          <details className="admin-details"><summary>Nombre y logo</summary><div><BrandSettingsForm group="identity" /></div></details>
          <details className="admin-details"><summary>Colores</summary><div><ThemeEditor /></div></details>
          <details className="admin-details"><summary>Sucursales</summary><div><BranchesManager /></div></details>
          <details className="admin-details"><summary>Equipo (dueños y comensales)</summary><div><TeamManager /></div></details>
          <details className="admin-details"><summary>Contacto y horario</summary><div><BrandSettingsForm group="contact" /></div></details>
          <details className="admin-details"><summary>Moneda y gift cards</summary><div><BrandSettingsForm group="money" /></div></details>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="section-head" style={{ marginTop: 34 }}>
            <p className="eyebrow">Panel del dueño</p>
            <h2 style={{ fontSize: 22 }}>Personalización de la página</h2>
            <p>Los productos y categorías se editan directamente en Inicio y Menú (aparecen los controles al pasar el cursor). Aquí puedes manejar las fotos del sitio y los banners de oferta.</p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="home-section-top"><h3>Fotos del sitio</h3></div>
          <div className="admin-photo-grid">
            <div><EditablePhoto imgKey="welcome" label="Portada de acceso" className="admin-thumb" uploadKind="cover" modalSub="Es la foto o video que se ve arriba en la entrada, el inicio de sesión y el registro. Debe ser vertical de 1080 × 1920 px (9:16). Pon lo importante en la mitad de arriba: abajo lo tapan los botones. Un video corto (hasta 20 s, sin sonido) se repite solo." /><span>Portada de acceso (login y registro)</span></div>
            <div><EditablePhoto imgKey="hero" label="Portada" className="admin-thumb" /><span>Portada / oferta</span></div>
            <div><EditablePhoto imgKey="founder" label="Fundador" className="admin-thumb" /><span>Fundador</span></div>
            <div><EditablePhoto imgKey="azotea" label="Ambiente" className="admin-thumb" /><span>Ambiente / terraza</span></div>
            <div><EditablePhoto imgKey="gallery-0" label="Galería 1" className="admin-thumb" /><span>Galería 1</span></div>
            <div><EditablePhoto imgKey="gallery-1" label="Galería 2" className="admin-thumb" /><span>Galería 2</span></div>
            <div><EditablePhoto imgKey="gallery-2" label="Galería 3" className="admin-thumb" /><span>Galería 3</span></div>
            <div><EditablePhoto imgKey="map" label="Mapa" className="admin-thumb" /><span>Mapa / fachada</span></div>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="home-section-top" style={{ marginTop: 34 }}><h3>Banners de oferta</h3></div>
          <OffersCarousel />
        </Reveal>

        <Reveal delay={0.2}>
          <div className="home-section-top" style={{ marginTop: 34 }}>
            <h3>Diseños de gift card</h3>
            <button type="button" className="pill-btn-dark" onClick={() => setGifting(true)}>Regalar una</button>
          </div>
          <GiftCardDesignManager />
        </Reveal>

        {gifting && <GiftCardGiftModal onClose={() => setGifting(false)} onDone={() => {}} />}

        <Reveal delay={0.22}>
          <div className="home-section-top" style={{ marginTop: 34 }}>
            <h3>Fotos de avatar</h3>
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Los clientes eligen entre estas fotos — ellos no pueden subir las suyas.</p>
          <AvatarLibraryManager />
        </Reveal>

        <Reveal delay={0.24}>
          <div className="home-section-top" style={{ marginTop: 34 }}><h3>Mesas</h3></div>
          <TableManager />
        </Reveal>

        <Reveal delay={0.26}>
          <div className="home-section-top" style={{ marginTop: 34 }}><h3>Early Bird · bebida gratis</h3></div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>El primero que pida dentro de este horario se gana el premio. Se reinicia solo cada día.</p>
          <EarlyBirdManager />
        </Reveal>

        <Reveal delay={0.28}>
          <div className="home-section-top" style={{ marginTop: 34 }}><h3>Impuestos y porcientos</h3></div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Se suman automáticamente al precio de los productos cuando alguien paga desde la app.</p>
          <TaxSettingsManager />
        </Reveal>

        <Reveal delay={0.29}>
          <div className="home-section-top" style={{ marginTop: 34 }}><h3>Avisos de pedidos</h3></div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Escribe el mensaje que le sale al cliente cuando cambias el estado de su pedido en Órdenes.</p>
          <OrderMessagesManager />
        </Reveal>

        <Reveal delay={0.3}>
          <div className="home-section-top" style={{ marginTop: 34 }}><h3>Página &quot;Nosotros&quot;</h3></div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Esa página no está en tu barra de navegación, pero puedes editarle el texto y las fotos desde aquí.</p>
          <Link href="/nosotros" className="pill-btn-dark">Editar página de Nosotros</Link>
        </Reveal>

        <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 20 }} onClick={logout}>Cerrar sesión</button>
      </div>
    </section>
  );
}
