'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { renderJob } from '@/lib/print/receipt';
import { useLiveReload, beep } from '@/lib/pos';

// Impresora virtual: muestra en pantalla, como tickets, lo que le llega a esta impresora. Sirve para
// probar comandas, prefacturas y facturas sin tener una impresora conectada.
export default function VirtualPrinterPage() {
  const { id } = useParams();
  const { canManageOrders, authReady } = useAuth();
  const [printer, setPrinter] = useState(null);
  const [jobs, setJobs] = useState([]);

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED || !canManageOrders) return;
    const [{ data: p }, { data: j }] = await Promise.all([
      sb.from('printers').select('*').eq('id', id).maybeSingle(),
      sb.from('print_jobs').select('*').eq('printer_id', id).order('created_at', { ascending: false }).limit(20),
    ]);
    setPrinter(p || null);
    const list = j || [];
    setJobs(list);
    // lo nuevo se "imprime": se marca hecho y suena
    const pending = list.filter((x) => x.status === 'pending');
    if (pending.length) {
      beep();
      await sb.from('print_jobs').update({ status: 'done', done_at: new Date().toISOString() }).in('id', pending.map((x) => x.id));
    }
  }, [id, canManageOrders]);
  useEffect(() => { load(); }, [load]);
  useLiveReload(['print_jobs'], load, 8000);

  if (!authReady) return null;
  if (!canManageOrders) return <section className="vprinter"><p className="empty-note">Solo el personal del local puede ver esta impresora.</p></section>;

  return (
    <section className="vprinter">
      <div className="vprinter-head">
        <p className="eyebrow">Impresora virtual</p>
        <h2>{printer ? printer.name : '…'}</h2>
        <span>Los tickets nuevos aparecen arriba</span>
      </div>
      <div className="vprinter-feed">
        {jobs.length === 0 && <p className="empty-note">Todavía no ha llegado nada.</p>}
        {jobs.map((j) => (
          <div key={j.id} className="vprinter-ticket">
            <span className="vprinter-meta">{j.kind} · {new Date(j.created_at).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
            <pre>{renderJob(j, printer ? printer.paper : 80).join('\n')}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}
