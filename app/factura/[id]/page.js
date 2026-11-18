'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { printReceipt } from '@/lib/printReceipt';
import { Factura, invoiceNumber } from '@/components/Receipt';
import { kickEcf } from '@/lib/ecf/kick';

// Una factura: la ve quien la pagó (su cuenta o su pedido), el personal, o quien tiene el código de
// la cuenta de la mesa (?c=…). Se imprime o se guarda en PDF desde el navegador.
function FacturaView() {
  const { id } = useParams();
  const params = useSearchParams();
  const { authReady, canManageOrders } = useAuth();
  const [invoice, setInvoice] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    if (!authReady) return;
    if (!BARRO_CONFIGURED) { setState('missing'); return; }
    let alive = true;
    let tries = 0;
    const get = () => sb.rpc('invoice_get', { invoice_input: id, code_input: params.get('c') || null }).then(({ data }) => {
      if (!alive) return;
      setInvoice(data || null);
      setState(data ? 'ok' : 'missing');
      // si el comprobante electrónico sigue en camino, se pide el envío y se vuelve a mirar
      if (data && ['pendiente', 'enviando', 'enviado', 'error'].includes(data.ecf_status) && tries < 4) {
        tries += 1;
        kickEcf();
        setTimeout(get, 2500);
      }
    });
    get();
    return () => { alive = false; };
  }, [id, params, authReady]);

  useEffect(() => {
    if (!invoice) return undefined;
    const before = document.title;
    document.title = `Factura ${invoiceNumber(invoice.number)}`;
    return () => { document.title = before; };
  }, [invoice]);

  if (state === 'loading') return <section className="factura-page"><p className="empty-note">Cargando la factura…</p></section>;
  if (state === 'missing') {
    return (
      <section className="factura-page">
        <div className="mesa-card">
          <h2>No encontramos esta factura</h2>
          <p>Inicia sesión con la cuenta con la que pediste, o abre el enlace desde tu cuenta de la mesa.</p>
          <Link href="/pedidos" className="btn btn-amber">Mis pedidos</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="factura-page">
      <div className="factura-tools">
        <Link href={canManageOrders ? '/caja' : '/pedidos'} className="rp-back">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          {canManageOrders ? 'Caja' : 'Mis pedidos'}
        </Link>
        <button type="button" className="btn btn-amber btn-sm" onClick={printReceipt}>Imprimir o guardar PDF</button>
      </div>
      <div className="print-target"><Factura invoice={invoice} /></div>
    </section>
  );
}

export default function FacturaPage() {
  return <Suspense fallback={null}><FacturaView /></Suspense>;
}
