'use client';
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useSettings } from '@/context/SettingsContext';

const BranchContext = createContext(null);
const KEY = 'rp-branch';

const DEMO_BRANCHES = [{ id: 'principal', name: 'Sucursal principal', sort_order: 1, active: true }];

export function BranchProvider({ children }) {
  const { settings } = useSettings();
  const [rows, setRows] = useState([]);
  const [branch, setBranchState] = useState(null);
  const [storageRead, setStorageRead] = useState(false);
  const [branchesLoaded, setBranchesLoaded] = useState(false);

  const reloadBranches = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setRows(DEMO_BRANCHES); setBranchesLoaded(true); return; }
    const { data } = await sb.from('branches').select('*').eq('active', true).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    setRows(data || []);
    setBranchesLoaded(true);
  }, []);

  useEffect(() => { reloadBranches(); }, [reloadBranches]);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(KEY);
      if (saved) setBranchState(saved);
    } catch (e) { /* ignore */ }
    setStorageRead(true);
  }, []);

  const setBranch = useCallback((id) => {
    setBranchState(id);
    try { window.sessionStorage.setItem(KEY, id); } catch (e) { /* ignore */ }
  }, []);

  // Cada sucursal lleva un nombre completo listo para mostrar ("Marca · Sucursal").
  const branches = useMemo(() => rows.map((b) => ({
    ...b,
    full: rows.length > 1 ? `${settings.brand_name} · ${b.name}` : b.name,
  })), [rows, settings.brand_name]);

  // Con una sola sucursal no hay nada que elegir; si la guardada ya no existe, se descarta.
  useEffect(() => {
    if (!branchesLoaded || !storageRead) return;
    if (branches.length === 1 && branch !== branches[0].id) { setBranch(branches[0].id); return; }
    if (branch && branches.length > 0 && !branches.some((b) => b.id === branch)) {
      setBranchState(null);
      try { window.sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    }
  }, [branches, branch, branchesLoaded, storageRead, setBranch]);

  const branchInfo = branches.find((b) => b.id === branch) || null;
  const ready = storageRead && branchesLoaded;

  return (
    <BranchContext.Provider value={{ branch, branchInfo, branches, setBranch, ready, reloadBranches }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch debe usarse dentro de <BranchProvider>');
  return ctx;
}
