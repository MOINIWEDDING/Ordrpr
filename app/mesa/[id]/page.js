'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useBranch } from '@/context/BranchContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { getActiveTab, setActiveTab } from '@/lib/activeTab';

// Lo que abre el QR de cada mesa: abrir la cuenta o unirse a la que ya está abierta con su código.
export default function MesaPage() {
  const { id } = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const { settings } = useSettings();
  const { setBranch } = useBranch();
  const [table, setTable] = useState(null);
  const [state, setState] = useState('loading'); // loading | open | join | missing
  const [name, setName] = useState('');
  const [guests, setGuests] = useState(2);
  const [code, setCode] = useState('');
  const [existing, setExisting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (profile && profile.name && !name) setName(profile.name); }, [profile, name]);

  useEffect(() => {
    if (!BARRO_CONFIGURED) { setState('missing'); return; }
    (async () => {
      const { data } = await sb.from('dining_tables').select('id, label, branch').eq('id', id).maybeSingle();
      if (!data) { setState('missing'); return; }
      setTable(data);
      // si este aparato ya tiene la cuenta de esta mesa abierta, directo a ella
      const mine = getActiveTab();
      if (mine && mine.table_id === data.id) {
        const { data: t } = await sb.rpc('tab_get', { tab_input: mine.id, code_input: mine.code });
        if (t && (t.status === 'open' || t.status === 'bill')) { router.replace('/mi-mesa'); return; }
      }
      setState('open');
    })();
  }, [id, router]);

  function enter(tab) {
    setActiveTab(tab);
    if (tab.branch) setBranch(tab.branch);
    router.push('/mi-mesa');
  }

  async function openTab(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Escribe tu nombre.'); return; }
    setBusy(true);
    setError('');
    const { data, error: err } = await sb.rpc('tab_open', { table_input: table.id, name_input: name.trim(), guests_input: guests });
    setBusy(false);
    if (err) { setError(/tab_open|schema cache/i.test(err.message) ? 'Las cuentas abiertas todavía no están disponibles en este restaurante.' : err.message); return; }
    if (data && data.ok) { enter(data.tab); return; }
    if (data && data.reason === 'exists') { setExisting(data); setState('join'); return; }
    setError('No se pudo abrir la cuenta.');
  }

  async function join(e) {
    e.preventDefault();
    if (!existing || !existing.tab_id) { setError('Pide el código a quien abrió la cuenta.'); return; }
    setBusy(true);
    setError('');
    const { data } = await sb.rpc('tab_get', { tab_input: existing.tab_id, code_input: code.trim() });
    setBusy(false);
    if (!data) { setError('Ese código no es el de esta mesa.'); return; }
    enter(data);
  }

  if (state === 'loading') return <section className="mesa-page"><p className="empty-note">Un momento…</p></section>;
  if (state === 'missing') {
    return (
      <section className="mesa-page">
        <div className="mesa-card">
          <h2>Esta mesa no existe</h2>
          <p>Pide ayuda a un camarero.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mesa-page">
      <div className="mesa-card">
        <p className="eyebrow">{settings.brand_name}</p>
        <h2 className="mesa-title">{table.label}</h2>
        {state === 'join' ? (
          <form onSubmit={join} className="mesa-form">
            <p className="mesa-lead">Esta mesa ya tiene una cuenta abierta{existing.opened_name ? ` a nombre de ${existing.opened_name}` : ''}. Pídele el código para unirte.</p>
            <input className="mesa-code" type="text" inputMode="text" autoCapitalize="characters" maxLength={6} placeholder="CÓDIGO" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Código de la cuenta" />
            {error && <div className="form-msg show error">{error}</div>}
            <button type="submit" className="btn btn-amber btn-block" disabled={busy || code.trim().length < 4}>{busy ? 'Entrando…' : 'Unirme a la cuenta'}</button>
          </form>
        ) : (
          <form onSubmit={openTab} className="mesa-form">
            <p className="mesa-lead">Abre la cuenta de tu mesa: pide cuando quieras y paga al final.</p>
            <div className="field">
              <label htmlFor="mesaName">Tu nombre</label>
              <input id="mesaName" type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="¿A nombre de quién?" />
            </div>
            <div className="field">
              <label>¿Cuántos son?</label>
              <div className="qty-stepper">
                <button type="button" onClick={() => setGuests((n) => Math.max(1, n - 1))} aria-label="Menos">–</button>
                <span>{guests}</span>
                <button type="button" onClick={() => setGuests((n) => Math.min(30, n + 1))} aria-label="Más">+</button>
              </div>
            </div>
            {error && <div className="form-msg show error">{error}</div>}
            <button type="submit" className="btn btn-amber btn-block" disabled={busy}>{busy ? 'Abriendo…' : 'Abrir cuenta'}</button>
          </form>
        )}
      </div>
    </section>
  );
}
