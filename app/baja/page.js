'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSettings } from '@/context/SettingsContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

// Enlace de baja de los correos (/baja?t=…). Se confirma con un botón: algunos programas de correo
// abren los enlaces solos para revisarlos, y eso no debe dar de baja a nadie.
function Baja() {
  const params = useSearchParams();
  const { settings } = useSettings();
  const token = params.get('t') || '';
  const [state, setState] = useState('ask'); // ask | busy | done | invalid
  const brand = settings.brand_name || 'este negocio';

  async function confirm() {
    if (!BARRO_CONFIGURED || token.length < 16) { setState('invalid'); return; }
    setState('busy');
    const { data, error } = await sb.rpc('newsletter_unsubscribe', { token_input: token });
    setState(!error && data && data.ok ? 'done' : 'invalid');
  }

  return (
    <section className="baja-page">
      <div className="baja-card">
        <span className="baja-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></svg>
        </span>
        {state === 'done' ? (
          <>
            <h2>Listo, ya no recibirás nuestros correos</h2>
            <p>Si cambias de opinión, actívalos de nuevo en tu cuenta.</p>
            <Link href="/cuenta" className="btn btn-ghost">Ir a mi cuenta</Link>
          </>
        ) : state === 'invalid' ? (
          <>
            <h2>Este enlace no es válido</h2>
            <p>Inicia sesión y apaga los correos desde tu cuenta.</p>
            <Link href="/cuenta" className="btn btn-amber">Ir a mi cuenta</Link>
          </>
        ) : (
          <>
            <h2>¿Dejar de recibir correos de {brand}?</h2>
            <p>No te enviaremos más novedades ni promociones.</p>
            <button type="button" className="btn btn-amber" onClick={confirm} disabled={state === 'busy'}>{state === 'busy' ? 'Un momento…' : 'Darme de baja'}</button>
            <Link href="/" className="baja-cancel">No, seguir recibiéndolos</Link>
          </>
        )}
      </div>
    </section>
  );
}

export default function BajaPage() {
  return <Suspense fallback={null}><Baja /></Suspense>;
}
