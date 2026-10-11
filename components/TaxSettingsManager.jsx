'use client';
import { useState, useEffect } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useBranch } from '@/context/BranchContext';
import { useTaxSettings } from '@/hooks/useTaxSettings';

export default function TaxSettingsManager() {
  const { branch, branchInfo } = useBranch();
  const { charges, loading, reload } = useTaxSettings(branch);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => { setRows(charges); }, [charges]);

  function updateRow(i, field, value) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { label: '', percent: 0 }]);
  }

  function removeRow(i) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!branch) { setMsg({ text: 'Elige una sucursal primero.', type: 'error' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ text: 'Conecta Supabase para guardar de verdad.', type: 'error' }); return; }
    const clean = rows
      .map((r) => ({ label: (r.label || '').trim() || 'Impuesto', percent: Number(r.percent) || 0 }))
      .filter((r) => r.percent > 0);
    setBusy(true);
    setMsg({ text: '', type: '' });
    const { error } = await sb.from('tax_settings').upsert({ branch, charges: clean, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    setRows(clean);
    setMsg({ text: 'Guardado.', type: 'ok' });
    await reload();
  }

  if (!branch) return <p className="empty-note">Elige una sucursal (arriba, en &quot;Cambiar&quot;) para configurar sus impuestos.</p>;
  if (loading) return null;

  const totalPercent = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0);

  return (
    <div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Configurando: <b>{branchInfo?.full}</b></p>

      <div className="tax-rows">
        {rows.map((r, i) => (
          <div className="tax-row" key={i}>
            <input
              type="text"
              placeholder="Nombre (ej. ITBIS)"
              value={r.label}
              onChange={(e) => updateRow(i, 'label', e.target.value)}
            />
            <div className="tax-percent-field">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={r.percent}
                onChange={(e) => updateRow(i, 'percent', e.target.value)}
              />
              <span>%</span>
            </div>
            <button type="button" className="icon-btn danger" aria-label="Quitar" onClick={() => removeRow(i)}>
              <svg className="icon" style={{ width: 13, height: 13 }} viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="empty-note">Sin impuestos configurados — el checkout no cobrará ningún recargo extra.</p>}
      </div>

      <button type="button" className="carta-add-link" onClick={addRow}>+ Agregar impuesto o porciento</button>

      {rows.length > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Total combinado: <b>{totalPercent}%</b> se sumará al precio de los productos en el checkout.
        </p>
      )}

      {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
      <button type="button" className="btn btn-amber" disabled={busy} style={{ marginTop: 14 }} onClick={handleSave}>{busy ? 'Guardando…' : 'Guardar'}</button>
    </div>
  );
}
