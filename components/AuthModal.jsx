'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { BARRO_CONFIGURED } from '@/lib/supabaseClient';
import Modal from './Modal';

export default function AuthModal() {
  const { modalOpen, closeAuth, mode, setMode, login, signup } = useAuth();
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (modalOpen) {
      setName(''); setGender(''); setAge(''); setEmail(''); setPassword('');
      setMsg({ text: '', type: '' });
    }
  }, [modalOpen, mode]);

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

  return (
    <Modal open={modalOpen} onClose={closeAuth}>
      <div className="modal-top">
        <p className="eyebrow">Acceso</p>
        <h3>{isLogin ? 'Inicia sesión' : 'Crea tu cuenta'}</h3>
        <p className="modal-sub">
          {isLogin ? 'Entra con tu correo y contraseña.' : 'Guarda tus favoritos, tu carrito y tu balance de gift card.'}
        </p>
      </div>
      <div className="modal-body">
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <div className="field">
                <label htmlFor="authName">Nombre</label>
                <input id="authName" type="text" autoComplete="name" placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="authGender">Sexo</label>
                  <select id="authGender" value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">Elige…</option>
                    <option value="femenino">Femenino</option>
                    <option value="masculino">Masculino</option>
                    <option value="prefiero_no_decir">Prefiero no decir</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="authAge">Edad</label>
                  <input id="authAge" type="number" min="1" max="120" inputMode="numeric" placeholder="Ej. 28" value={age} onChange={(e) => setAge(e.target.value)} />
                </div>
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="authEmail">Correo</label>
            <input id="authEmail" type="email" autoComplete="email" inputMode="email" placeholder="tu@correo.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="authPass">Contraseña</label>
            <input id="authPass" type="password" autoComplete="current-password" placeholder="••••••••" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
          <div className="modal-actions">
            <button type="submit" className="btn btn-amber" disabled={busy}>{isLogin ? 'Iniciar sesión' : 'Crear cuenta'}</button>
          </div>
          <div className="switch-mode">
            <span>{isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}</span>{' '}
            <button type="button" onClick={() => setMode(isLogin ? 'signup' : 'login')}>{isLogin ? 'Crear una' : 'Iniciar sesión'}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
