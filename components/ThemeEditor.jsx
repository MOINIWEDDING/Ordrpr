'use client';
import { useState, useEffect } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { applyTheme, isValidHex, DEFAULT_PRIMARY } from '@/lib/theme';

const PRESETS = [
  { name: 'Rojo', hex: '#D5402C' }, { name: 'Naranja', hex: '#E0701F' }, { name: 'Mostaza', hex: '#C99A1B' },
  { name: 'Verde', hex: '#2E7D32' }, { name: 'Turquesa', hex: '#00897B' }, { name: 'Azul', hex: '#1565C0' },
  { name: 'Violeta', hex: '#6A1B9A' }, { name: 'Rosa', hex: '#C2185B' }, { name: 'Café', hex: '#6D4C41' }, { name: 'Negro', hex: '#1F1F1F' },
];

export default function ThemeEditor({ onSaved, submitLabel = 'Guardar color' }) {
  const { settings, saveSettings } = useSettings();
  const [color, setColor] = useState(settings.primary_color || DEFAULT_PRIMARY);
  const [text, setText] = useState(settings.primary_color || DEFAULT_PRIMARY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  useEffect(() => { setColor(settings.primary_color); setText(settings.primary_color); }, [settings.primary_color]);

  // vista previa en vivo: toda la página cambia mientras eliges
  function pick(hex) {
    setColor(hex); setText(hex); setMsg({ type: '', text: '' });
    applyTheme(hex);
  }
  function onText(v) {
    setText(v);
    if (isValidHex(v)) { setColor(v); applyTheme(v); }
  }
  // si sale sin guardar, vuelve al color guardado
  useEffect(() => () => applyTheme(settings.primary_color), [settings.primary_color]);

  async function save() {
    if (!isValidHex(color)) { setMsg({ type: 'error', text: 'Escribe un color válido, por ejemplo #D5402C.' }); return; }
    setBusy(true);
    const { error } = await saveSettings({ primary_color: color.toUpperCase() });
    setBusy(false);
    if (error) { setMsg({ type: 'error', text: error.message || 'No se pudo guardar.' }); return; }
    setMsg({ type: 'ok', text: 'Color guardado.' });
    if (onSaved) onSaved();
  }

  return (
    <div className="theme-editor">
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Elige el color de tu marca. Los botones, íconos y detalles de toda la página lo usan. Mira cómo cambia en vivo.</p>
      <div className="theme-swatches">
        {PRESETS.map((p) => (
          <button key={p.hex} type="button" title={p.name} aria-label={p.name} onClick={() => pick(p.hex)}
            className={`theme-swatch${color.toLowerCase() === p.hex.toLowerCase() ? ' active' : ''}`} style={{ background: p.hex }} />
        ))}
      </div>
      <div className="theme-custom">
        <input type="color" value={isValidHex(color) ? color : DEFAULT_PRIMARY} onChange={(e) => pick(e.target.value)} aria-label="Elegir color" />
        <input type="text" value={text} onChange={(e) => onText(e.target.value)} maxLength={7} spellCheck="false" aria-label="Color en formato hexadecimal" />
      </div>
      <div className="theme-preview">
        <button type="button" className="btn btn-amber">Pedir ahora</button>
        <span className="role-tag">Etiqueta</span>
        <span className="cart-badge" style={{ position: 'static' }}>3</span>
      </div>
      {msg.text && <div className={`form-msg show ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</div>}
      <button type="button" className="btn btn-amber" onClick={save} disabled={busy} style={{ marginTop: 12 }}>{busy ? 'Guardando…' : submitLabel}</button>
    </div>
  );
}
