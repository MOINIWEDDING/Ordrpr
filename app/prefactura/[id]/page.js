'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useTaxSettings } from '@/hooks/useTaxSettings';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { printReceipt } from '@/lib/printReceipt';
import { Prefactura } from '@/components/Receipt';

// La prefactura de una cuenta abierta en su propia página, igual que la factura: se imprime o se guarda
// en PDF desde el navegador. La ve el personal o quien tiene el código de la mesa (?c=…).
function PrefacturaView() {
  const { id } = useParams();
  const params = useSearchParams();
  const { authReady, canUsePos } = useAuth();
  const { settings } = useSettings();
  const [tab, setTab] = useState(null);
  const [state, setState] = useState('loading');
  const { charges } = useTaxSettings(tab ? tab.branch : null);

  useEffect(() => {
    if (!authReady) return;
    if (!BARRO_CONFIGURED) { setState('missing'); return; }
    sb.rpc('tab_get', { tab_input: id, code_input: params.get('c') || null }).then(({ data }) => {
      setTab(data || null);
      setState(data ? 'ok' : 'missing');
    });
  }, [id, params, authReady]);

  useEffect(() => {
    if (!tab) return undefined;
    const before = document.title;
    document.title = `Prefactura ${tab.table_label || ''}`.trim();
    return () => { document.title = before; };
  }, [tab]);

  const back = canUsePos ? { href: '/caja', label: 'Caja' } : { href: '/mi-mesa', label: 'Mi mesa' };
  if (state === 'loading') return <section className="factura-page"><p className="empty-note">Cargando la prefactura…</p></section>;
  if (state === 'missing') {
    return (
      <section className="factura-page">
        <div className="mesa-card">
          <h2>No encontramos esta cuenta</h2>
          <p>Ábrela desde la caja o desde tu cuenta de la mesa.</p>
          <Link href={back.href} className="btn btn-amber">{back.label}</Link>
        </div>
      </section>
    );
  }

  const business = { brand_name: settings.brand_name, legal_name: settings.business_legal_name, rnc: settings.business_rnc, address: settings.address, phone: settings.phone, logo_url: settings.logo_url, currency_symbol: settings.currency_symbol, currency_position: settings.currency_position };
  const due = { ...tab, orders: (tab.orders || []).filter((o) => !o.paid) };
  return (
    <section className="factura-page">
      <div className="factura-tools">
        <Link href={back.href} className="rp-back">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          {back.label}
        </Link>
        <button type="button" className="btn btn-amber btn-sm" onClick={printReceipt}>Imprimir o guardar PDF</button>
      </div>
      <div className="print-target"><Prefactura tab={due} charges={charges} business={business} /></div>
    </section>
  );
}

export default function PrefacturaPage() {
  return <Suspense fallback={null}><PrefacturaView /></Suspense>;
}
