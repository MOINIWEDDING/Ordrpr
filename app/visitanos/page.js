'use client';
import EditablePhoto from '@/components/EditablePhoto';
import Reveal from '@/components/Reveal';
import { useSettings } from '@/context/SettingsContext';
import { useBranch } from '@/context/BranchContext';

const ICON_PIN = <svg className="icon" viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.3" /></svg>;
const ICON_CLOCK = <svg className="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
const ICON_PHONE = <svg className="icon" viewBox="0 0 24 24"><path d="M6 3h3l1.5 4-2 1.5a13 13 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4 6.2 2 2 0 0 1 6 3z" /></svg>;

function lines(text) {
  return String(text || '').split('\n').map((l, i, arr) => (<span key={i}>{l}{i < arr.length - 1 && <br />}</span>));
}

export default function VisitanosPage() {
  const { settings } = useSettings();
  const { branches } = useBranch();
  const year = new Date().getFullYear();
  const contactPhone = settings.whatsapp || settings.phone;

  // Cada sucursal muestra lo suyo; si no tiene dirección/horario/teléfono se usan los generales del negocio.
  const places = (branches.length ? branches : [{ id: 'general', name: settings.brand_name }]).map((b) => ({
    id: b.id,
    name: branches.length > 1 ? b.name : '',
    address: b.address || [settings.address, settings.city].filter(Boolean).join(' · '),
    hours: b.hours || settings.hours,
    phone: b.phone || contactPhone,
  }));

  return (
    <>
      <section className="visitanos" id="visitanos" style={{ paddingTop: 28 }}>
        <div className="wrap visit-grid">
          <Reveal>
            <EditablePhoto imgKey="map" label="Mapa / fachada" className="map-ph" />
          </Reveal>
          <Reveal delay={0.1}>
            <p className="eyebrow">Visítanos</p>
            <h2 style={{ fontSize: 26, marginTop: 10 }}>Te esperamos{settings.city ? ` en ${settings.city}` : ''}.</h2>
            {places.map((p) => (
              <div className="info-list" key={p.id} style={{ marginTop: 18 }}>
                {p.name && <h4 style={{ marginBottom: 4 }}>{p.name}</h4>}
                {p.address && (
                  <div className="info-row">
                    <div className="ic">{ICON_PIN}</div>
                    <div><b>Dirección</b><span>{p.address}</span></div>
                  </div>
                )}
                {p.hours && (
                  <div className="info-row">
                    <div className="ic">{ICON_CLOCK}</div>
                    <div><b>Horario</b><span>{lines(p.hours)}</span></div>
                  </div>
                )}
                {p.phone && (
                  <div className="info-row">
                    <div className="ic">{ICON_PHONE}</div>
                    <div><b>Reservas y contacto</b><span>{p.phone}</span></div>
                  </div>
                )}
              </div>
            ))}
            <div className="social-row">
              {settings.instagram && (
                <a href={settings.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><svg className="icon" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" /></svg></a>
              )}
              {settings.facebook && (
                <a href={settings.facebook} target="_blank" rel="noreferrer" aria-label="Facebook"><svg className="icon" viewBox="0 0 24 24"><path d="M14 21v-7h2.4l.4-3H14V9c0-.9.3-1.5 1.7-1.5H17V4.8C16.6 4.7 15.6 4.6 14.4 4.6c-2.5 0-4.2 1.5-4.2 4.3V11H7.7v3H10.2v7z" /></svg></a>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="footer-grid">
            <div>
              <div className="logo" style={{ color: 'var(--cream-on-dark)' }}><span className="dot" />{settings.brand_name}</div>
              {settings.tagline && <span style={{ marginTop: 10 }}>{settings.tagline}</span>}
            </div>
            <div>
              <h5>Contacto</h5>
              {settings.address && <span>{settings.address}</span>}
              {settings.city && <span>{settings.city}</span>}
              {contactPhone && <span>{contactPhone}</span>}
              {settings.email && <span>{settings.email}</span>}
            </div>
            {settings.hours && (
              <div>
                <h5>Horario</h5>
                <span>{lines(settings.hours)}</span>
              </div>
            )}
          </div>
          <div className="footer-bottom">
            <span>© {year} {settings.brand_name}.</span>
            {settings.city && <span>{settings.city}</span>}
          </div>
        </div>
      </footer>
    </>
  );
}
