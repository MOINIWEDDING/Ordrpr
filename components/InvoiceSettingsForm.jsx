'use client';
import { useEffect, useState } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

// Datos del negocio que salen en cada factura y en los comprobantes electrónicos: razón social, RNC,
// dirección y una nota al pie. Los cambian el dueño y el contador.
export default function InvoiceSettingsForm() {
  const { settings, reload } = useSettings();
  const [form, setForm] = useState({ legal: '', rnc: '', address: '', footer: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    setForm({ legal: settings.business_legal_name || '', rnc: settings.business_rnc || '', address: settings.address || '', footer: settings.invoice_footer || '' });
  }, [settings.business_legal_name, settings.business_rnc, settings.address, settings.invoice_footer]);

  async function save(e) {
    e.preventDefault();
    const rnc = form.rnc.replace(/[^0-9]/g, '');
    if (rnc && rnc.length !== 9 && rnc.length !== 11) { setMsg({ type: 'error', text: 'El RNC tiene 9 dígitos (o 11 si es una cédula).' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ type: 'error', text: 'Conecta Supabase para guardar.' }); return; }
    setBusy(true);
    const { error } = await sb.rpc('accounting_set_business', { legal_name_input: form.legal, rnc_input: rnc, address_input: form.address, footer_input: form.footer });
    setBusy(false);
    if (error) {
      setMsg({ type: 'error', text: /accounting_set_business|schema cache/i.test(error.message || '') ? 'Falta actualizar la base de datos de este restaurante.' : error.message });
      return;
    }
    await reload();
    setMsg({ type: 'ok', text: 'Guardado. Las facturas nuevas ya salen con estos datos.' });
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form onSubmit={save} className="fiscal-form">
      <div className="tfield">
        <input id="invLegal" placeholder=" " maxLength={120} value={form.legal} onChange={set('legal')} />
        <label htmlFor="invLegal">Razón social</label>
      </div>
      <div className="tfield">
        <input id="invRnc" placeholder=" " inputMode="numeric" maxLength={13} value={form.rnc} onChange={set('rnc')} />
        <label htmlFor="invRnc">RNC</label>
      </div>
      <div className="tfield">
        <input id="invAddress" placeholder=" " maxLength={200} value={form.address} onChange={set('address')} />
        <label htmlFor="invAddress">Dirección fiscal</label>
      </div>
      <div className="tfield">
        <input id="invFooter" placeholder=" " maxLength={200} value={form.footer} onChange={set('footer')} />
        <label htmlFor="invFooter">Nota al pie de la factura</label>
      </div>
      {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
      <button type="submit" className="btn btn-amber" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
    </form>
  );
}
