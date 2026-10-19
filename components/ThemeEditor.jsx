'use client';
import { useState, useEffect } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { applyTheme, isValidHex, isLightBackground, DEFAULT_PRIMARY, DEFAULT_BACKGROUND } from '@/lib/theme';

const PRESETS = [
  { name: 'Rojo', hex: '#D5402C' }, { name: 'Naranja', hex: '#E0701F' }, { name: 'Mostaza', hex: '#C99A1B' },
  { name: 'Verde', hex: '#2E7D32' }, { name: 'Turquesa', hex: '#00897B' }, { name: 'Azul', hex: '#1565C0' },
  { name: 'Violeta', hex: '#6A1B9A' }, { name: 'Rosa', hex: '#C2185B' }, { name: 'Café', hex: '#6D4C41' }, { name: 'Negro', hex: '#1F1F1F' },
];

// Fondos claros: las tarjetas son blancas y el texto oscuro, así que un fondo oscuro no se leería.
const BACKGROUNDS = [
  { name: 'Crema', hex: DEFAULT_BACKGROUND }, { name: 'Blanco', hex: '#FFFFFF' }, { name: 'Arena', hex: '#F6F1E7' },
  { name: 'Gris', hex: '#F4F5F7' }, { name: 'Menta', hex: '#EFF6F1' }, { name: 'Cielo', hex: '#EEF4FB' },
  { name: 'Rosa', hex: '#FBF1F1' }, { name: 'Lavanda', hex: '#F4F1FA' },
];

export default function ThemeEditor({ onSaved, submitLabel = 'Guardar colores' }) {
  const { settings, saveSettings } = useSettings();
  const savedBg = settings.background_color || DEFAULT_BACKGROUND;
  const [color, setColor] = useState(settings.primary_color || DEFAULT_PRIMARY);
  const [text, setText] = useState(settings.primary_color || DEFAULT_PRIMARY);
  const [bg, setBg] = useState(savedBg);
  const [bgText, setBgText] = useState(savedBg);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  useEffect(() => { setColor(settings.primary_color); setText(settings.primary_color); }, [settings.primary_color]);
  useEffect(() => { setBg(savedBg); setBgText(savedBg); }, [savedBg]);

  // vista previa en vivo: toda la página cambia mientras eliges
  function pick(hex) {
    setColor(hex); setText(hex); setMsg({ type: '', text: '' });
    applyTheme(hex, bg);
  }
  function onText(v) {
    setText(v);
    if (isValidHex(v)) { setColor(v); applyTheme(v, bg); }
  }
  function pickBg(hex) {
    setBgText(hex);
    if (!isValidHex(hex)) return;
    if (!isLightBackground(hex)) { setMsg({ type: 'error', text: 'Ese fondo es muy oscuro: el texto no se leería. Elige un color más claro.' }); return; }
    setBg(hex); setMsg({ type: '', text: '' });
    applyTheme(color, hex);
  }
  // si sale sin guardar, vuelve a los colores guardados
  useEffect(() => () => applyTheme(settings.primary_color, savedBg), [settings.primary_color, savedBg]);

  async function save() {
    if (!isValidHex(color)) { setMsg({ type: 'error', text: 'Escribe un color válido, por ejemplo #D5402C.' }); return; }
    if (!isLightBackground(bg)) { setMsg({ type: 'error', text: 'Elige un color de fondo claro.' }); return; }
    setBusy(true);
    const { error } = await saveSettings({ primary_color: color.toUpperCase(), background_color: bg.toUpperCase() });
    setBusy(false);
    if (error) { setMsg({ type: 'error', text: error.message || 'No se pudo guardar.' }); return; }
    setMsg({ type: 'ok', text: 'Colores guardados.' });
    if (onSaved) onSaved();
  }

  return (
    <div className="theme-editor">
      <h5 className="theme-editor-title">Color de marca</h5>
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

      <h5 className="theme-editor-title">Color de fondo</h5>
      <div className="theme-swatches">
        {BACKGROUNDS.map((p) => (
          <button key={p.hex} type="button" title={p.name} aria-label={`Fondo ${p.name}`} onClick={() => pickBg(p.hex)}
            className={`theme-swatch theme-swatch-bg${bg.toLowerCase() === p.hex.toLowerCase() ? ' active' : ''}`} style={{ background: p.hex }} />
        ))}
      </div>
      <div className="theme-custom">
        <input type="color" value={isValidHex(bg) ? bg : DEFAULT_BACKGROUND} onChange={(e) => pickBg(e.target.value)} aria-label="Elegir color de fondo" />
        <input type="text" value={bgText} onChange={(e) => pickBg(e.target.value)} maxLength={7} spellCheck="false" aria-label="Color de fondo en formato hexadecimal" />
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
