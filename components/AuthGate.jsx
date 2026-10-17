'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import BranchSwitcher from './BranchSwitcher';
import GuestInfoGate from './GuestInfoGate';
import { AuthMedia } from './AuthHero';
import './auth.css';

// Pantalla que ve quien aún no ha entrado: la portada que eligió el dueño llena toda la parte
// de arriba y, debajo, los botones para crear cuenta, iniciar sesión o seguir como invitado.
export default function AuthGate() {
  const { openAuth } = useAuth();
  const router = useRouter();
  const [askingGuestInfo, setAskingGuestInfo] = useState(false);

  // Sin barra de navegación en esta pantalla: tampoco reservamos el espacio de abajo.
  useEffect(() => {
    document.body.classList.add('no-tabbar-padding');
    return () => document.body.classList.remove('no-tabbar-padding');
  }, []);

  // Quien ve esta pantalla ya recibió la bienvenida: el inicio no debe devolverlo aquí
  // (si no, al terminar como invitado volvería a /cuenta en vez de quedarse en el inicio).
  useEffect(() => {
    try { window.sessionStorage.setItem('rp-welcome-seen', '1'); } catch (e) { /* ignore */ }
  }, []);

  return (
    <motion.div
      className="auth-land"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="auth-land-hero">
        <AuthMedia />
      </div>

      <div className="auth-land-panel">
        <p className="auth-lead">Entra para empezar</p>
        <p className="auth-lead-sub">Guarda tus favoritos, tu carrito y tu balance de gift card.</p>

        <div className="auth-actions">
          <button type="button" className="auth-btn auth-btn--ink" onClick={() => openAuth('signup', 'cliente')}>Crear cuenta</button>
          <button type="button" className="auth-btn auth-btn--white" onClick={() => openAuth('login', 'cliente')}>Iniciar sesión</button>
        </div>
        <button type="button" className="auth-guest" onClick={() => setAskingGuestInfo(true)}>Continuar como invitado</button>

        <div className="auth-branch">
          <BranchSwitcher light />
        </div>
      </div>

      <AnimatePresence>
        {askingGuestInfo && <GuestInfoGate onDone={() => router.push('/')} />}
      </AnimatePresence>
    </motion.div>
  );
}
