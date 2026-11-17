'use client';
import { useEffect, useState } from 'react';
import { useSettings } from '@/context/SettingsContext';

// Datos del negocio que salen en cada factura: razón social, RNC y una nota al pie.
export default function InvoiceSettingsForm() {
  const { settings, saveSettings } = useSettings();
  const [form, setForm] = useState({ business_legal_name: '', business_rnc: '', invoice_footer: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    setForm({ business_legal_name: settings.business_legal_name || '', business_rnc: settings.business_rnc || '', invoice_footer: settings.invoice_footer || '' });
  }, [settings.business_legal_name, settings.business_rnc, settings.invoice_footer]);

  async function save(e) {
    e.preventDefault();
    const rnc = form.business_rnc.replace(/[^0-9]/g, '');
    if (rnc && rnc.length !== 9 && rnc.length !== 11) { setMsg({ type: 'error', text: 'El RNC tiene 9 dígitos (o 11 si es una cédula).' }); return; }
    setBusy(true);
    const { error } = await saveSettings({ business_legal_name: form.business_legal_name.trim(), business_rnc: rnc, invoice_footer: form.invoice_footer.trim() });
    setBusy(false);
    setMsg(error
      ? { type: 'error', text: /business_|invoice_footer/i.test(error.message || '') ? 'Falta actualizar la base de datos de este restaurante.' : error.message }
      : { type: 'ok', text: 'Guardado. Las facturas nuevas ya salen con estos datos.' });
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form onSubmit={save}>
      <div className="field">
        <label htmlFor="invLegal">Razón social</label>
        <input id="invLegal" type="text" maxLength={120} placeholder="Restaurante Ejemplo SRL" value={form.business_legal_name} onChange={set('business_legal_name')} />
      </div>
      <div className="field">
        <label htmlFor="invRnc">RNC</label>
        <input id="invRnc" type="text" inputMode="numeric" maxLength={13} placeholder="131000000" value={form.business_rnc} onChange={set('business_rnc')} />
      </div>
      <div className="field">
        <label htmlFor="invFooter">Nota al pie de la factura</label>
        <textarea id="invFooter" rows={2} maxLength={200} placeholder="Gracias por preferirnos" value={form.invoice_footer} onChange={set('invoice_footer')} />
      </div>
      {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
      <button type="submit" className="btn btn-amber" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
    </form>
  );
}
