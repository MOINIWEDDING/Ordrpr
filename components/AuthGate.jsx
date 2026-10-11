'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import BranchSwitcher from './BranchSwitcher';
import GuestInfoGate from './GuestInfoGate';
import BrandLogo from './BrandLogo';
import { useSettings } from '@/context/SettingsContext';

const DEFAULT_PHOTO = '';

export default function AuthGate() {
  const { openAuth } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();
  const [photo, setPhoto] = useState(DEFAULT_PHOTO);
  const [askingGuestInfo, setAskingGuestInfo] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!BARRO_CONFIGURED) return;
      const { data, error } = await sb.from('site_images').select('url').eq('key', 'welcome').single();
      if (active && !error && data && data.url) setPhoto(data.url);
    }
    load();
    return () => { active = false; };
  }, []);

  // Sin barra de navegación en esta pantalla: tampoco reservamos el espacio de abajo.
  useEffect(() => {
    document.body.classList.add('no-tabbar-padding');
    return () => document.body.classList.remove('no-tabbar-padding');
  }, []);

  return (
    <motion.section
      className="authgate"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <div className="authgate-bg" style={{ backgroundImage: photo ? `url(${photo})` : 'linear-gradient(135deg, var(--amber-deep), var(--amber))' }} />
      <div className="authgate-overlay" />

      <motion.div
        className="authgate-card"
        initial={{ y: 24, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 0.61, 0.36, 1] }}
      >
        <div className="authgate-icon authgate-icon-logo">
          <BrandLogo />
        </div>
        <h2>Bienvenido a {settings.brand_name}</h2>
        <p>Guarda tus favoritos, tu carrito y tu balance de gift card.</p>

        <div className="authgate-actions">
          <button type="button" className="btn btn-amber btn-block" onClick={() => openAuth('signup', 'cliente')}>Regístrate</button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => openAuth('login', 'cliente')}>Inicia sesión</button>
          <button type="button" className="authgate-link" onClick={() => setAskingGuestInfo(true)}>Continuar como invitado</button>
        </div>

        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center' }}>
          <BranchSwitcher light />
        </div>
      </motion.div>

      <AnimatePresence>
        {askingGuestInfo && <GuestInfoGate onDone={() => router.push('/')} />}
      </AnimatePresence>
    </motion.section>
  );
}
