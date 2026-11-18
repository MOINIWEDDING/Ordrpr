'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null); // {id, name, role}
  const [authReady, setAuthReady] = useState(!BARRO_CONFIGURED);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [role, setRole] = useState('cliente'); // 'cliente' | 'staff'

  const refreshProfile = useCallback(async () => {
    if (!BARRO_CONFIGURED) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { setProfile(null); return; }
    const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    if (error || !data) {
      setProfile({ id: session.user.id, name: session.user.email, role: 'cliente', email: session.user.email });
    } else {
      setProfile({ ...data, name: (data.name && data.name.trim()) ? data.name : session.user.email, email: session.user.email });
    }
  }, []);

  useEffect(() => {
    if (!BARRO_CONFIGURED) return;
    refreshProfile().finally(() => setAuthReady(true));
    const { data: sub } = sb.auth.onAuthStateChange(() => { refreshProfile(); });
    return () => sub.subscription.unsubscribe();
  }, [refreshProfile]);

  const userRole = profile ? profile.role : null;
  const isStaff = userRole === 'staff'; // el dueño
  const isComensal = userRole === 'comensal';
  const isCashier = userRole === 'cajero';
  const isWaiter = userRole === 'camarero';
  const isKitchen = userRole === 'cocina';
  const isAccountant = userRole === 'contador';
  // el dueño y el contador ven la contabilidad
  const canSeeAccounting = isStaff || isAccountant;
  // todo el personal ve las órdenes; caja y camareros además manejan cuentas
  const canManageOrders = isStaff || isComensal || isCashier || isWaiter || isKitchen;
  const canUsePos = isStaff || isComensal || isCashier || isWaiter;

  const openAuth = useCallback((m, r) => { setMode(m); setRole(r); setModalOpen(true); }, []);
  const closeAuth = useCallback(() => setModalOpen(false), []);

  const login = useCallback(async (email, password) => {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Correo o contraseña incorrectos.');
    await refreshProfile();
  }, [refreshProfile]);

  const signup = useCallback(async (email, password, name, roleChosen, extra = {}) => {
    const { data, error } = await sb.auth.signUp({
      email, password, options: { data: { name, role: roleChosen, gender: extra.gender || '', age: extra.age || '', newsletter: extra.newsletter ? 'true' : '' } },
    });
    if (error) throw new Error(error.message);
    if (data.session === null) {
      return { needsConfirmation: true };
    }
    await refreshProfile();
    return { needsConfirmation: false };
  }, [refreshProfile]);

  const logout = useCallback(async () => {
    await sb.auth.signOut();
    setProfile(null);
    // en un aparato del local, al salir vuelve a la pantalla del equipo para que entre otra persona
    try { if (window.localStorage.getItem('rp-staff-device')) window.location.href = '/equipo'; } catch (e) { /* nada */ }
  }, []);

  return (
    <AuthContext.Provider value={{
      profile, authReady, userRole, isStaff, isComensal, isCashier, isWaiter, isKitchen, isAccountant, canSeeAccounting, canManageOrders, canUsePos,
      modalOpen, mode, role, setMode, setRole,
      openAuth, closeAuth, login, signup, logout, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
