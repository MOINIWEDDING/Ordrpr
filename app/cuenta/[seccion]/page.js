'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Reveal from '@/components/Reveal';
import GiftCardGiftModal from '@/components/GiftCardGiftModal';
import { ownerSections, ToolPanel } from '@/components/OwnerSections';

// Una sección del panel del dueño (Tu negocio, Tu página, Pedidos o Clientes) en su propia página.
export default function OwnerSectionPage() {
  const { seccion } = useParams();
  const { profile, isStaff, authReady } = useAuth();
  const [gifting, setGifting] = useState(false);
  const sections = ownerSections({ onGift: () => setGifting(true) });
  const index = sections.findIndex((s) => s.id === seccion);
  const section = sections[index];

  if (!authReady) return <section className="cuenta-page"><div className="wrap"><p className="muted">Cargando…</p></div></section>;

  if (!profile || !isStaff || !section) {
    return (
      <section className="cuenta-page">
        <div className="wrap">
          <BackLink />
          <p className="empty-note">{!section ? 'Esta sección no existe.' : 'Esta sección es solo para el dueño del negocio.'}</p>
        </div>
      </section>
    );
  }

  const prev = sections[index - 1];
  const next = sections[index + 1];

  return (
    <section className="cuenta-page">
      <div className="wrap">
        <BackLink />

        <Reveal className="acct-group">
          <div className="section-head acct-group-head">
            <p className="eyebrow">{section.eyebrow}</p>
            <h1 className="acct-section-title">{section.title}</h1>
            <p>{section.sub}</p>
          </div>
          {section.lead}
          <div className="acct-tools">
            {section.tools.map((t) => <ToolPanel key={t.id} id={t.id} title={t.title} desc={t.desc}>{t.render}</ToolPanel>)}
          </div>
        </Reveal>

        <nav className="acct-pager" aria-label="Otras secciones">
          {prev ? <Link href={`/cuenta/${prev.id}`} className="prev"><small>Anterior</small><b>{prev.eyebrow}</b></Link> : <span />}
          {next ? <Link href={`/cuenta/${next.id}`} className="next"><small>Siguiente</small><b>{next.eyebrow}</b></Link> : <span />}
        </nav>

        {gifting && <GiftCardGiftModal onClose={() => setGifting(false)} onDone={() => {}} />}
      </div>
    </section>
  );
}

function BackLink() {
  return (
    <Link href="/cuenta" className="acct-back">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      Cuenta
    </Link>
  );
}
