'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useAuth } from './AuthContext';

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { profile } = useAuth();
  const [ids, setIds] = useState(() => new Set());

  const load = useCallback(async () => {
    if (!profile || !BARRO_CONFIGURED) { setIds(new Set()); return; }
    const { data, error } = await sb.from('favorites').select('item_id').eq('user_id', profile.id);
    if (!error && data) setIds(new Set(data.map((r) => r.item_id)));
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  const isFav = useCallback((itemId) => ids.has(itemId), [ids]);

  const toggle = useCallback(async (itemId) => {
    const already = ids.has(itemId);
    setIds((prev) => {
      const next = new Set(prev);
      already ? next.delete(itemId) : next.add(itemId);
      return next;
    });
    if (!profile || !BARRO_CONFIGURED) return; // invitado: solo local, no persiste
    if (already) {
      await sb.from('favorites').delete().eq('user_id', profile.id).eq('item_id', itemId);
    } else {
      await sb.from('favorites').insert({ user_id: profile.id, item_id: itemId });
    }
  }, [ids, profile]);

  return (
    <FavoritesContext.Provider value={{ ids, isFav, toggle, isGuest: !profile }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites debe usarse dentro de <FavoritesProvider>');
  return ctx;
}
