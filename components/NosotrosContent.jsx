'use client';
import EditablePhoto from '@/components/EditablePhoto';
import EditableText from '@/components/EditableText';
import NosotrosGallery from '@/components/NosotrosGallery';
import NosotrosPilares from '@/components/NosotrosPilares';
import NosotrosCultura from '@/components/NosotrosCultura';
import EditableButton from '@/components/EditableButton';
import Reveal from '@/components/Reveal';
import { SiteContentProvider } from '@/context/SiteContentContext';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

export default function NosotrosContent() {
  const { settings, loading } = useSettings();
  const { isStaff } = useAuth();
  const hidden = settings.show_nosotros === false;
  // oculta: los clientes ven un aviso; el equipo la sigue viendo para poder editarla
  if (hidden && !isStaff) {
    if (loading) return null;
    return (
      <section className="wrap nosotros-off">
        <h2>Esta página no está disponible</h2>
        <Link href="/" className="btn btn-amber">Ir al inicio</Link>
      </section>
    );
  }
  return (
    <SiteContentProvider>
      {hidden && <div className="wrap nosotros-hidden-note">Oculta para tus clientes</div>}
      <section className="historia" id="nosotros" style={{ paddingTop: 28 }}>
        <div className="wrap historia-grid">
          <Reveal className="historia-photos">
            <EditablePhoto imgKey="founder" label="Foto del fundador" className="main" />
            <EditablePhoto imgKey="gallery-2" className="detail" />
          </Reveal>
          <Reveal delay={0.1}>
            <EditableText contentKey="nosotros.origen.eyebrow" defaultValue="Origen y fundador" as="p" className="eyebrow" />
            <EditableText
              contentKey="nosotros.origen.heading"
              defaultValue="Nuestra historia."
              as="h2"
              style={{ fontSize: 26, marginTop: 10 }}
            />
            <EditableText
              contentKey="nosotros.origen.body"
              defaultValue={'Cuéntales a tus clientes cómo empezó todo: quién fundó el negocio, qué los inspiró y qué los hace distintos. Haz clic en este texto para editarlo.'}
              as="p"
              multiline
              style={{ marginTop: 14, fontSize: 14.5, lineHeight: 1.7, color: 'var(--ink-soft)' }}
            />
            <div className="founder-tag">
              <div className="av">•</div>
              <div>
                <EditableText contentKey="nosotros.origen.founder_name" defaultValue="Nombre del fundador" as="b" />
                <EditableText contentKey="nosotros.origen.founder_tag" defaultValue="Fundador · 2022" as="span" />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="pilares">
        <div className="wrap">
          <Reveal className="section-head">
            <EditableText contentKey="nosotros.pilares.eyebrow" defaultValue="El concepto" as="p" className="eyebrow" />
            <EditableText contentKey="nosotros.pilares.heading" defaultValue="Lo que nos define." as="h2" />
            <EditableText contentKey="nosotros.pilares.sub" defaultValue="Desde sus inicios, el lugar fue concebido bajo dos pilares." as="p" />
          </Reveal>
          <NosotrosPilares />
        </div>
      </section>

      <section className="azotea" id="azotea">
        <div className="wrap azotea-grid">
          <Reveal style={{ position: 'relative' }}>
            <div className="azotea-badge">
              <EditableText contentKey="nosotros.azotea.badge" defaultValue="El rincón favorito" as="span" />
            </div>
            <EditablePhoto imgKey="azotea" label="Foto de la terraza" />
          </Reveal>
          <Reveal delay={0.1}>
            <EditableText contentKey="nosotros.azotea.eyebrow" defaultValue="El rincón favorito" as="p" className="eyebrow" />
            <EditableText
              contentKey="nosotros.azotea.heading"
              defaultValue="Un lugar para quedarse."
              as="h2"
              style={{ fontSize: 26, marginTop: 10 }}
            />
            <EditableText
              contentKey="nosotros.azotea.body"
              defaultValue="Describe el ambiente de tu local: el espacio, la música, el tipo de gente que lo visita. Haz clic para editar este texto."
              as="p" multiline className="body"
            />
            <EditableButton
              contentKey="nosotros.azotea.button"
              defaultLabel="Reservar un espacio"
              defaultHref="/visitanos"
              className="btn btn-ghost-light btn-block"
              style={{ marginTop: 20 }}
            />
          </Reveal>
        </div>
      </section>

      <section className="cultura">
        <div className="wrap">
          <Reveal className="section-head">
            <EditableText contentKey="nosotros.cultura.eyebrow" defaultValue="Más que un menú" as="p" className="eyebrow" />
            <EditableText contentKey="nosotros.cultura.heading" defaultValue="Lo que hacemos además de cocinar." as="h2" />
            <EditableText contentKey="nosotros.cultura.sub" defaultValue="Eventos, catas, colaboraciones o proyectos de tu negocio." as="p" />
          </Reveal>
          <NosotrosCultura />
        </div>
      </section>

      <section id="espacio">
        <div className="wrap">
          <Reveal className="section-head">
            <EditableText contentKey="nosotros.espacio.eyebrow" defaultValue="El local" as="p" className="eyebrow" />
            <EditableText contentKey="nosotros.espacio.heading" defaultValue="Un vistazo por dentro." as="h2" />
            <EditableText contentKey="nosotros.espacio.sub" defaultValue="Desliza para ver más." as="p" />
          </Reveal>
          <NosotrosGallery />
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="footer-bottom" style={{ border: 'none', paddingTop: 0 }}>
            <span>© {new Date().getFullYear()} {settings.brand_name}.</span>
            <span><a href="/">Volver al inicio</a></span>
          </div>
        </div>
      </footer>
    </SiteContentProvider>
  );
}
