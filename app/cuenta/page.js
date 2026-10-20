'use client';
import Link from 'next/link';
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useMenuItems, money } from '@/hooks/useMenuItems';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import ProductCard from '@/components/ProductCard';
import GiftCardModal from '@/components/GiftCardModal';
import Avatar from '@/components/Avatar';
import AvatarPicker from '@/components/AvatarPicker';
import Reveal from '@/components/Reveal';
import AuthGate from '@/components/AuthGate';
import BranchSwitcher from '@/components/BranchSwitcher';
import { Chevron, ownerSections } from '@/components/OwnerSections';

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

        <NewsletterToggle profile={profile} />

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

// El cliente decide si sigue recibiendo los correos del negocio (lo aceptó al registrarse).
function NewsletterToggle({ profile }) {
  const { refreshProfile } = useAuth();
  const { settings } = useSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!BARRO_CONFIGURED || profile.newsletter === undefined) return null;
  const on = Boolean(profile.newsletter);

  async function toggle(next) {
    setBusy(true);
    setError('');
    const { error: err } = await sb.rpc('set_newsletter', { on_input: next });
    if (err) setError('No se pudo guardar. Intenta de nuevo.');
    await refreshProfile();
    setBusy(false);
  }

  return (
    <div className="acct-newsletter">
      <div className="pe-toggles">
        <label className={`pe-toggle${on ? ' on' : ''}`} htmlFor="acctNewsletter">
          <span className="pe-toggle-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></svg></span>
          <span className="pe-toggle-text"><b>Novedades por correo</b><small>Promociones de {settings.brand_name || 'este negocio'}</small></span>
          <input id="acctNewsletter" type="checkbox" role="switch" checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
          <span className="pe-switch" aria-hidden="true" />
        </label>
      </div>
      {error && <div className="form-msg show error">{error}</div>}
    </div>
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
  const sections = ownerSections({ onGift: () => {} });

  return (
    <section className="cuenta-page">
      <div className="wrap">
        <AccountHeader profile={profile} role="Dueño" onChangeAvatar={() => setPickingAvatar(true)} />

        {pickingAvatar && <AvatarPicker onClose={() => setPickingAvatar(false)} />}

        <div className="section-head acct-group-head" style={{ marginTop: 34 }}>
          <p className="eyebrow">Panel del dueño</p>
          <h2>Administra tu negocio</h2>
          <p>Cada sección tiene su propia página. Entra a la que necesites.</p>
        </div>

        <div className="acct-sections">
          {sections.map((sec, i) => (
            <Reveal key={sec.id} delay={0.03 + i * 0.03}>
              <Link href={`/cuenta/${sec.id}`} className="acct-section-card">
                <span className="acct-section-text">
                  <span className="acct-role">{sec.eyebrow}</span>
                  <b>{sec.title}</b>
                  <small>{sec.tools.map((t) => t.title).join(' · ')}</small>
                </span>
                <Chevron />
              </Link>
            </Reveal>
          ))}
        </div>

        <LogoutButton logout={logout} />
      </div>
    </section>
  );
}
