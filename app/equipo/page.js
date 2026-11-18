'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useBranch } from '@/context/BranchContext';
import { useSettings } from '@/context/SettingsContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { getStaffDevice, setStaffDevice, HOME_FOR_ROLE } from '@/lib/staffDevice';

const ROLE_LABEL = { cajero: 'Caja', camarero: 'Camarero', cocina: 'Cocina', comensal: 'Órdenes', contador: 'Contabilidad' };
const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase();
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'cancel'];

// Pantalla del equipo en un aparato del local: cada quien toca su nombre y pone su PIN. Si el aparato no
// está activado, el dueño lo activa aquí mismo con su sesión.
export default function EquipoPage() {
  const router = useRouter();
  const { profile, authReady, isStaff, logout, openAuth } = useAuth();
  const { branches, setBranch } = useBranch();
  const { settings } = useSettings();
  const reduce = useReducedMotion();
  const [device, setDevice] = useState(null);
  const [checked, setChecked] = useState(false);
  const [roster, setRoster] = useState(null);
  const [who, setWho] = useState(null);
  const [pin, setPin] = useState('');
  const [state, setState] = useState({ kind: 'idle' }); // idle | busy | error | locked
  const [now, setNow] = useState(null);
  const [devName, setDevName] = useState('');
  const [devBranch, setDevBranch] = useState('');
  const [activating, setActivating] = useState(false);
  const [actError, setActError] = useState('');
  const submitted = useRef('');

  useEffect(() => {
    setDevice(getStaffDevice());
    setChecked(true);
    document.body.classList.add('equipo-mode');
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => { document.body.classList.remove('equipo-mode'); clearInterval(t); };
  }, []);

  const loadRoster = useCallback(async () => {
    if (!device || !BARRO_CONFIGURED) return;
    const { data, error } = await sb.rpc('staff_roster', { device_input: device.token });
    if (error) { setRoster([]); return; }
    setRoster(data || []);
  }, [device]);
  useEffect(() => { loadRoster(); }, [loadRoster]);

  const enter = useCallback(async (code) => {
    if (!who || state.kind === 'busy') return;
    setState({ kind: 'busy' });
    let res;
    try {
      res = await fetch('/api/equipo/entrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device: device.token, user_id: who.user_id, pin: code }) });
    } catch (e) { setState({ kind: 'error', text: 'Sin conexión. Intenta de nuevo.' }); setPin(''); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setPin('');
      if (data.reason === 'locked') { setState({ kind: 'locked', until: data.until }); loadRoster(); return; }
      if (data.reason === 'device') { setStaffDevice(null); setDevice(null); return; }
      if (data.reason === 'pin') {
        setState({ kind: 'error', text: data.left > 0 ? `PIN incorrecto · ${data.left === 1 ? 'queda 1 intento' : `quedan ${data.left} intentos`}` : 'PIN incorrecto' });
        return;
      }
      setState({ kind: 'error', text: data.error || 'No se pudo entrar.' });
      return;
    }
    if (profile) await sb.auth.signOut();
    const { error } = await sb.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
    if (error) { setState({ kind: 'error', text: 'No se pudo abrir la sesión.' }); setPin(''); return; }
    if (device.branch) setBranch(device.branch);
    router.push(HOME_FOR_ROLE[who.role] || '/');
  }, [who, state.kind, device, profile, router, setBranch, loadRoster]);

  useEffect(() => {
    if (pin.length === 4 && submitted.current !== `${who && who.user_id}:${pin}`) {
      submitted.current = `${who && who.user_id}:${pin}`;
      enter(pin);
    }
    if (pin.length < 4) submitted.current = '';
  }, [pin, enter, who]);

  function press(k) {
    if (state.kind === 'busy' || state.kind === 'locked') return;
    if (k === 'cancel') { setWho(null); setPin(''); setState({ kind: 'idle' }); return; }
    if (k === 'back') { setPin((p) => p.slice(0, -1)); return; }
    if (state.kind === 'error') setState({ kind: 'idle' });
    setPin((p) => (p.length < 4 ? p + k : p));
  }

  useEffect(() => {
    if (!who) return undefined;
    const onKey = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Escape') press('cancel');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  async function activate(e) {
    e.preventDefault();
    setActError('');
    setActivating(true);
    const { data, error } = await sb.rpc('staff_device_add', { name_input: devName.trim() || 'Aparato del local', branch_input: devBranch || null });
    setActivating(false);
    if (error) { setActError(/staff_device|schema cache/i.test(error.message) ? 'Falta actualizar la base de datos de este restaurante.' : error.message); return; }
    const d = { token: data, name: devName.trim() || 'Aparato del local', branch: devBranch || null };
    setStaffDevice(d);
    setDevice(d);
    // el aparato queda para el equipo: la sesión del dueño no se queda abierta aquí
    await logout();
  }

  const brand = settings.brand_name || '';
  const time = now ? now.toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' }) : '';
  const lockedUntil = state.kind === 'locked' && state.until ? new Date(state.until).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' }) : '';

  if (!checked || !authReady) return <section className="crew" />;

  return (
    <section className="crew">
      <div className="crew-top">
        <span className="crew-brand">{brand}</span>
        <span className="crew-time">{time}</span>
      </div>

      {!device ? (
        <div className="crew-setup">
          <p className="eyebrow">Equipo</p>
          <h1>Este aparato todavía no es del local</h1>
          {isStaff ? (
            <form onSubmit={activate} className="crew-setup-form">
              <div className="tfield is-dark">
                <input id="devName" placeholder=" " maxLength={40} value={devName} onChange={(e) => setDevName(e.target.value)} />
                <label htmlFor="devName">Nombre del aparato (ej. Tablet de la caja)</label>
              </div>
              {branches.length > 1 && (
                <div className="crew-branches" role="radiogroup" aria-label="Sucursal">
                  {branches.map((b) => (
                    <button key={b.id} type="button" role="radio" aria-checked={devBranch === b.id} className={devBranch === b.id ? 'on' : ''} onClick={() => setDevBranch(b.id)}>{b.full}</button>
                  ))}
                </div>
              )}
              {actError && <div className="form-msg show error">{actError}</div>}
              <button type="submit" className="crew-primary" disabled={activating}>{activating ? 'Activando…' : 'Usar este aparato para el equipo'}</button>
            </form>
          ) : (
            <>
              <p className="crew-lead">El dueño lo activa una vez desde aquí con su cuenta. Después, el equipo entra con su nombre y su PIN.</p>
              <button type="button" className="crew-primary" onClick={() => openAuth('login', 'staff')}>Entrar como dueño</button>
            </>
          )}
        </div>
      ) : profile && !isStaff && HOME_FOR_ROLE[profile.role] ? (
        <div className="crew-setup">
          <p className="eyebrow">Sesión abierta</p>
          <h1>{profile.name}</h1>
          <button type="button" className="crew-primary" onClick={() => router.push(HOME_FOR_ROLE[profile.role])}>Ir a mi pantalla</button>
          <button type="button" className="crew-ghost" onClick={logout}>Salir</button>
        </div>
      ) : (
        <>
          <div className="crew-head">
            <p className="eyebrow">{device.name}</p>
            <h1>¿Quién entra?</h1>
          </div>
          {roster === null ? null : roster.length === 0 ? (
            <p className="crew-lead">Todavía no hay nadie con PIN. El dueño los agrega en Cuenta → Tu negocio → Equipo.</p>
          ) : (
            <ul className="crew-grid">
              {roster.map((r, i) => (
                <motion.li key={r.user_id} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.035, duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}>
                  <button type="button" className={`crew-tile is-${r.role}${r.locked ? ' is-locked' : ''}`} onClick={() => { setWho(r); setPin(''); setState(r.locked ? { kind: 'locked' } : { kind: 'idle' }); }}>
                    <span className="crew-avatar">{initials(r.name)}</span>
                    <b>{r.name}</b>
                    <small>{r.locked ? 'Bloqueado' : ROLE_LABEL[r.role] || r.role}</small>
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
          {isStaff && (
            <div className="crew-foot">
              <span>Sesión del dueño</span>
              <button type="button" onClick={() => router.push('/cuenta/negocio')}>Equipo y PIN</button>
              <button type="button" onClick={() => { if (window.confirm('¿Quitar este aparato? El equipo ya no podrá entrar con PIN aquí.')) { setStaffDevice(null); setDevice(null); } }}>Quitar este aparato</button>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {who && (
          <motion.div className="crew-pin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label={`PIN de ${who.name}`}>
            <motion.div className="crew-pin-card" initial={reduce ? false : { y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reduce ? undefined : { y: 20, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 30 }}>
              <span className={`crew-avatar is-big is-${who.role}`}>{initials(who.name)}</span>
              <h2>{who.name}</h2>
              <motion.div
                className={`crew-dots${state.kind === 'error' ? ' is-error' : ''}`}
                animate={state.kind === 'error' && !reduce ? { x: [0, -12, 12, -8, 8, -3, 0] } : { x: 0 }}
                transition={{ duration: 0.42 }}
                aria-label={`${pin.length} de 4 números`}
              >
                {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
              </motion.div>
              <p className="crew-pin-msg" aria-live="polite">
                {state.kind === 'busy' ? 'Entrando…' : state.kind === 'error' ? state.text : state.kind === 'locked' ? `Demasiados intentos. Bloqueado${lockedUntil ? ` hasta las ${lockedUntil}` : ' por 15 minutos'}.` : 'Escribe tu PIN'}
              </p>
              <div className="crew-keys">
                {KEYS.map((k) => (
                  <button key={k} type="button" className={`crew-key${k === 'back' || k === 'cancel' ? ' is-aux' : ''}`} onClick={() => press(k)}
                    disabled={(state.kind === 'busy' || state.kind === 'locked') && k !== 'cancel'}
                    aria-label={k === 'back' ? 'Borrar' : k === 'cancel' ? 'Cancelar' : k}>
                    {k === 'back' ? <svg viewBox="0 0 24 24"><path d="M9 6h11v12H9l-5-6 5-6Z" /><path d="m12 10 4 4M16 10l-4 4" /></svg>
                      : k === 'cancel' ? 'Cancelar' : k}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
