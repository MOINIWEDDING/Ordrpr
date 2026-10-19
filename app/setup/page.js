'use client';
import { useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useBranch } from '@/context/BranchContext';
import BrandSettingsForm from '@/components/BrandSettingsForm';
import ThemeEditor from '@/components/ThemeEditor';
import BranchesManager from '@/components/BranchesManager';

const STEPS = [
  { key: 'identity', title: 'Tu negocio', sub: 'El nombre y el logo que verán tus clientes.' },
  { key: 'colors', title: 'Tus colores', sub: 'Un color de marca y toda la página se adapta.' },
  { key: 'branches', title: 'Tus sucursales', sub: 'Agrega los locales donde recibes pedidos. Con una sola, tus clientes no tendrán que elegir.' },
  { key: 'contact', title: 'Contacto y horario', sub: 'Lo que aparece en "Visítanos" y en el pie de página.' },
  { key: 'money', title: 'Moneda y gift cards', sub: 'Cómo se muestran los precios y cómo empiezan los códigos de las gift cards.' },
  { key: 'menu', title: '¡Casi listo!', sub: 'Lo último: cargar tu menú.' },
];

export default function SetupPage() {
  const { profile, isStaff, authReady, openAuth } = useAuth();
  const { settings, saveSettings } = useSettings();
  const { branches } = useBranch();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');

  if (!authReady) return <section className="cuenta-page"><div className="wrap"><p className="muted">Cargando…</p></div></section>;

  // Cuando el negocio ya tiene dueño (o terminó la configuración), para los demás esta página no existe.
  if ((settings.owner_ready || settings.setup_completed) && !(profile && isStaff)) notFound();

  if (!profile || !isStaff) {
    return (
      <section className="cuenta-page">
        <div className="wrap" style={{ maxWidth: 560 }}>
          <div className="section-head">
            <p className="eyebrow">Configuración</p>
            <h2>Primero, crea tu cuenta de dueño</h2>
            <p>
              {profile
                ? 'Esta cuenta no tiene permisos de dueño. Entra con la cuenta con la que se creó el negocio.'
                : 'La primera cuenta que se registra en esta página queda como dueña del negocio. Regístrate ahora, antes de compartir el enlace con nadie.'}
            </p>
          </div>
          {!profile && (
            <>
              <button type="button" className="btn btn-amber btn-block" onClick={() => openAuth('signup', 'cliente')}>Crear mi cuenta de dueño</button>
              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => openAuth('login', 'cliente')}>Ya tengo cuenta</button>
            </>
          )}
        </div>
      </section>
    );
  }

  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const needsBranch = current.key === 'branches' && branches.length === 0;

  async function finish() {
    setFinishing(true);
    setError('');
    const { error: err } = await saveSettings({ setup_completed: true });
    setFinishing(false);
    if (err) { setError(err.message || 'No se pudo terminar.'); return; }
  }

  return (
    <section className="cuenta-page">
      <div className="wrap" style={{ maxWidth: 640 }}>
        <div className="setup-steps" aria-label="Progreso">
          {STEPS.map((s, i) => (
            <button key={s.key} type="button" className={`setup-dot${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}
              onClick={() => setStep(i)} aria-label={`Paso ${i + 1}: ${s.title}`}>{i < step ? '✓' : i + 1}</button>
          ))}
        </div>

        <div className="section-head" style={{ marginTop: 18 }}>
          <p className="eyebrow">Paso {step + 1} de {STEPS.length}</p>
          <h2>{current.title}</h2>
          <p>{current.sub}</p>
        </div>

        {current.key === 'identity' && <BrandSettingsForm group="identity" submitLabel="Guardar" />}
        {current.key === 'colors' && <ThemeEditor />}
        {current.key === 'branches' && <BranchesManager />}
        {current.key === 'contact' && <BrandSettingsForm group="contact" submitLabel="Guardar" />}
        {current.key === 'money' && <BrandSettingsForm group="money" submitLabel="Guardar" />}

        {current.key === 'menu' && (
          <div className="setup-final">
            <ol className="setup-checklist">
              <li className={settings.brand_name && settings.brand_name !== 'Mi Restaurante' ? 'done' : ''}>Nombre y logo</li>
              <li className="done">Colores</li>
              <li className={branches.length ? 'done' : ''}>Al menos una sucursal</li>
            </ol>
            <p className="muted" style={{ fontSize: 14, margin: '14px 0' }}>
              Ahora crea tus categorías y productos. Entra a <b>Menú</b>: con tu cuenta de dueño verás los botones para agregar categorías, productos, fotos y precios.
              También puedes configurar mesas, impuestos y promociones desde <b>Cuenta</b> cuando quieras.
            </p>
            {error && <div className="form-msg show error">{error}</div>}
            {settings.setup_completed ? (
              <div className="form-msg show ok">Configuración terminada. Tu página ya está lista para recibir clientes.</div>
            ) : (
              <button type="button" className="btn btn-amber btn-block" onClick={finish} disabled={finishing}>{finishing ? 'Guardando…' : 'Marcar como terminada'}</button>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <Link href="/menu" className="btn btn-amber" style={{ flex: 1, textAlign: 'center' }}>Ir a cargar mi menú</Link>
              <Link href="/" className="btn btn-ghost" style={{ flex: 1, textAlign: 'center' }}>Ver mi página</Link>
            </div>
          </div>
        )}

        <div className="setup-nav">
          <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Atrás</button>
          {!last && (
            <button type="button" className="btn btn-amber" onClick={() => setStep((s) => s + 1)} disabled={needsBranch}
              title={needsBranch ? 'Agrega al menos una sucursal para continuar' : ''}>
              {needsBranch ? 'Agrega una sucursal' : 'Siguiente'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
