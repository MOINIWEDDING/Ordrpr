'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { enablePush, pushState } from '@/lib/push';

// Invitación a recibir los avisos del pedido como notificación del teléfono (funcionan con la página cerrada).
export default function PushPrompt() {
  const { profile } = useAuth();
  const [state, setState] = useState('unsupported');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setState(pushState()); }, []);

  async function turnOn() {
    setBusy(true);
    setFailed(false);
    const res = await enablePush(profile);
    setBusy(false);
    const next = pushState();
    // el permiso puede quedar concedido aunque el aparato no haya podido suscribirse: no se da por activado
    if (!res.ok && (res.reason === 'error' || res.reason === 'sdk')) { setFailed(true); setState('default'); return; }
    setState(next);
  }

  const box = { margin: '18px 0 0', padding: '14px 16px', borderRadius: 16, background: 'var(--cream-2)', fontSize: 13.5, lineHeight: 1.45 };

  if (state === 'default') {
    return (
      <div style={box}>
        <b>Entérate aunque cierres la página.</b>
        <span className="muted" style={{ display: 'block', margin: '2px 0 10px' }}>Te avisamos al teléfono cuando tu pedido esté en preparación, listo o entregado.</span>
        <button type="button" className="btn btn-amber" disabled={busy} onClick={turnOn}>{busy ? 'Activando…' : 'Activar notificaciones'}</button>
        {failed && <span style={{ display: 'block', marginTop: 8, color: 'var(--danger, #b3261e)' }}>No se pudieron activar las notificaciones en este aparato. Inténtalo otra vez.</span>}
      </div>
    );
  }
  if (state === 'ios-install') {
    return (
      <div style={box}>
        <b>¿Quieres avisos en tu iPhone?</b>
        <span className="muted" style={{ display: 'block', marginTop: 2 }}>Toca Compartir y elige “Añadir a pantalla de inicio”. Abre la app desde ahí y activa las notificaciones en esta pantalla.</span>
      </div>
    );
  }
  if (state === 'denied') {
    return (
      <div style={box}>
        <span className="muted">Las notificaciones están bloqueadas para esta página. Puedes permitirlas en los ajustes de tu navegador.</span>
      </div>
    );
  }
  if (state === 'granted') {
    return <p className="muted" style={{ fontSize: 12.5, margin: '14px 0 0' }}>Notificaciones activadas: te avisaremos aunque cierres la página.</p>;
  }
  return null;
}
