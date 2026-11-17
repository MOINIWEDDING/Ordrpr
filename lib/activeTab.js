'use client';
import { useEffect, useState } from 'react';

// La cuenta abierta del cliente en este aparato: { id, code, table_id, table_label, branch }. Con el código
// cualquiera de la mesa ve la cuenta y pide en ella (ver tab_get / tab_add_order en Supabase).
const KEY = 'rp-active-tab';
const EVENT = 'rp-active-tab';

export function getActiveTab() {
  try {
    const t = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    return t && typeof t.id === 'string' && typeof t.code === 'string' ? t : null;
  } catch (e) { return null; }
}

export function setActiveTab(tab) {
  try {
    if (tab) window.localStorage.setItem(KEY, JSON.stringify({ id: tab.id, code: tab.code, table_id: tab.table_id || '', table_label: tab.table_label || '', branch: tab.branch || '' }));
    else window.localStorage.removeItem(KEY);
  } catch (e) { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useActiveTab() {
  const [tab, setTab] = useState(null);
  useEffect(() => {
    const read = () => setTab(getActiveTab());
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    return () => { window.removeEventListener(EVENT, read); window.removeEventListener('storage', read); };
  }, []);
  return tab;
}
