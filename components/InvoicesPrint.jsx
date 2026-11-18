'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { Factura } from '@/components/Receipt';
import { addDays, startOfDay } from '@/lib/stats';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Todas las facturas de un día o de un mes, una detrás de otra, para guardarlas en PDF desde el navegador:
// /contabilidad/facturas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD[&sucursal=id]
export default function InvoicesPrint() {
  const params = useSearchParams();
  const router = useRouter();
  const { profile, authReady, canSeeAccounting } = useAuth();
  const { settings } = useSettings();
  const [list, setList] = useState(null);
  const from = params.get('desde');
  const to = params.get('hasta');
  const branch = params.get('sucursal') || '';
  const title = params.get('titulo') || `${from} a ${to}`;
  const valid = DAY_RE.test(from || '') && DAY_RE.test(to || '') && from <= to;

  useEffect(() => { if (authReady && profile && !canSeeAccounting) router.push('/'); }, [authReady, profile, canSeeAccounting, router]);
  useEffect(() => {
    document.body.classList.add('report-mode');
    return () => document.body.classList.remove('report-mode');
  }, []);
  useEffect(() => {
    if (!valid || !profile || !canSeeAccounting || !BARRO_CONFIGURED) return;
    let qy = sb.from('invoices').select('*').gte('issued_at', startOfDay(from).toISOString()).lt('issued_at', addDays(startOfDay(to), 1).toISOString()).order('issued_at').limit(3000);
    if (branch) qy = qy.eq('branch', branch);
    qy.then(({ data }) => setList(data || []));
  }, [valid, from, to, branch, profile, canSeeAccounting]);
  useEffect(() => {
    const before = document.title;
    document.title = `Facturas ${settings.brand_name || ''} ${title}`.trim();
    return () => { document.title = before; };
  }, [title, settings.brand_name]);

  if (!profile || !canSeeAccounting) return null;
  const issued = (list || []).filter((x) => x.status === 'emitida');
  return (
    <div className="inv-print-page">
      <div className="rp-toolbar">
        <Link href="/contabilidad" className="rp-back">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Contabilidad
        </Link>
        {list && list.length > 0 && (
          <button type="button" className="btn btn-amber rp-print" onClick={() => window.print()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
            Descargar PDF
          </button>
        )}
      </div>
      {!valid ? <p className="empty-note">Este enlace no es válido.</p> : list === null ? <p className="empty-note">Preparando las facturas…</p> : list.length === 0 ? <p className="empty-note">No hay facturas en este periodo.</p> : (
        <>
          <header className="inv-print-head">
            <b>{settings.business_legal_name || settings.brand_name}</b>
            <span>Facturas · {title}</span>
            <span>{issued.length} emitidas · {money(Math.round(issued.reduce((s, x) => s + Number(x.total || 0), 0)))}{list.length > issued.length ? ` · ${list.length - issued.length} anuladas` : ''}</span>
          </header>
          <div className="inv-print-grid">
            {list.map((inv) => <div key={inv.id} className="inv-print-item"><Factura invoice={inv} /></div>)}
          </div>
        </>
      )}
    </div>
  );
}
