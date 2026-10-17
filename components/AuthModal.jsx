'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { AuthMedia } from './AuthHero';
import './auth.css';

// Iconos de línea (mismo trazo para todos)
const I = {
  user: <><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.7-3.6 3.7-5.6 7-5.6s6.3 2 7 5.6" /></>,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="3" /><path d="m4 8 8 5.5L20 8" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2.8" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  cal: <><rect x="4" y="5.5" width="16" height="14.5" rx="3" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  people: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5" /><path d="M16 5.6a3.2 3.2 0 0 1 0 5.8M18 14.9c1.7.6 2.7 2.2 3 4.6" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3.2 3.9M6.6 7.2A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-.9" /><path d="M9.9 9.9a2.8 2.8 0 0 0 4 4" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
};

function Icon({ name, className = 'auth-ico' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      {I[name]}
    </svg>
  );
}

export default function AuthModal() {
  const { modalOpen, closeAuth, mode, setMode, login, signup } = useAuth();
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (modalOpen) {
      setName(''); setGender(''); setAge(''); setEmail(''); setPassword(''); setShowPass(false);
      setMsg({ text: '', type: '' });
    }
  }, [modalOpen, mode]);

  // Con la hoja abierta, la página de atrás no se desplaza; Escape la cierra.
  useEffect(() => {
    if (!modalOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e) { if (e.key === 'Escape') closeAuth(); }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [modalOpen, closeAuth]);

  if (!modalOpen) return null;

  const isLogin = mode === 'login';

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text: '', type: '' });
    if (!BARRO_CONFIGURED) {
      setMsg({ text: 'Falta conectar Supabase: define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.', type: 'error' });
      return;
    }
    setBusy(true);
    try {
      if (isLogin) {
        await login(email.trim().toLowerCase(), password);
        closeAuth();
      } else {
        if (!name.trim()) { setMsg({ text: 'Escribe tu nombre.', type: 'error' }); setBusy(false); return; }
        if (!gender) { setMsg({ text: 'Elige una opción de sexo.', type: 'error' }); setBusy(false); return; }
        if (!age || Number(age) < 1 || Number(age) > 120) { setMsg({ text: 'Escribe una edad válida.', type: 'error' }); setBusy(false); return; }
        const result = await signup(email.trim().toLowerCase(), password, name.trim(), 'cliente', { gender, age });
        if (result.needsConfirmation) {
          setMsg({ text: 'Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesión.', type: 'ok' });
          setTimeout(closeAuth, 2200);
        } else {
          closeAuth();
        }
      }
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const passwordField = (
    <div className="auth-field">
      <label className="auth-sr" htmlFor="authPass">Contraseña</label>
      <Icon name="lock" />
      <input
        id="authPass"
        className="auth-input has-eye"
        type={showPass ? 'text' : 'password'}
        autoComplete={isLogin ? 'current-password' : 'new-password'}
        placeholder="Contraseña"
        required
        minLength={6}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button
        type="button"
        className="auth-eye"
        onClick={() => setShowPass((v) => !v)}
        aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={showPass}
      >
        <Icon name={showPass ? 'eyeOff' : 'eye'} className="auth-ico-static" />
      </button>
    </div>
  );

  return (
    <div className="auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeAuth(); }}>
      <div
        className={`auth-card auth-card--${isLogin ? 'login' : 'signup'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="authTitle"
      >
        <div className="auth-card-hero">
          <AuthMedia />
          <button type="button" className="auth-close" onClick={closeAuth} aria-label="Cerrar">
            <Icon name="close" className="auth-ico-static" />
          </button>
        </div>

        <div className="auth-sheet">
          <form className="auth-form" onSubmit={handleSubmit}>
            <h2 className="auth-title" id="authTitle">{isLogin ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}</h2>
            <p className="auth-sub">
              {isLogin ? 'Entra con tu correo y contraseña.' : 'Guarda tus favoritos, tu carrito y tu balance de gift card.'}
            </p>

            <div className="auth-fields">
              {!isLogin && (
                <div className="auth-field">
                  <label className="auth-sr" htmlFor="authName">Nombre</label>
                  <Icon name="user" />
                  <input id="authName" className="auth-input" type="text" autoComplete="name" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              )}

              <div className="auth-field">
                <label className="auth-sr" htmlFor="authEmail">Correo</label>
                <Icon name="mail" />
                <input id="authEmail" className="auth-input" type="email" autoComplete="email" inputMode="email" placeholder="Correo electrónico" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>

              {!isLogin && (
                <div className="auth-row">
                  <div className="auth-field">
                    <label className="auth-sr" htmlFor="authGender">Sexo</label>
                    <Icon name="people" />
                    <select id="authGender" className={`auth-input${gender ? '' : ' is-empty'}`} value={gender} onChange={(e) => setGender(e.target.value)}>
                      <option value="">Sexo</option>
                      <option value="femenino">Femenino</option>
                      <option value="masculino">Masculino</option>
                      <option value="prefiero_no_decir">Prefiero no decir</option>
                    </select>
                  </div>
                  <div className="auth-field">
                    <label className="auth-sr" htmlFor="authAge">Edad</label>
                    <Icon name="cal" />
                    <input id="authAge" className="auth-input" type="number" min="1" max="120" inputMode="numeric" placeholder="Edad" value={age} onChange={(e) => setAge(e.target.value)} />
                  </div>
                </div>
              )}

              {passwordField}
            </div>

            {!isLogin && <p className="auth-hint">Mínimo 6 caracteres.</p>}

            {msg.text && <div className={`auth-msg ${msg.type}`} role="alert">{msg.text}</div>}

            <button type="submit" className="auth-btn auth-btn--ink auth-submit" disabled={busy}>
              {busy ? (isLogin ? 'Entrando…' : 'Creando…') : (isLogin ? 'Iniciar sesión' : 'Crear cuenta')}
            </button>

            <p className="auth-switch">
              <span>{isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}</span>{' '}
              <button type="button" onClick={() => setMode(isLogin ? 'signup' : 'login')}>{isLogin ? 'Crear una' : 'Iniciar sesión'}</button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
