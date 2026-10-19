'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSettings } from '@/context/SettingsContext';
import { MAX_CUSTOM_LENGTH } from '@/lib/customContent';

// CSS y HTML propios para el menú tipo carta. El CSS solo afecta a la carta y el HTML se limpia
// antes de mostrarse (ver lib/customContent.js).
const CSS_EXAMPLE = `.carta-header h2 {
  letter-spacing: .25em;
}
.carta-item-name {
  font-weight: 800;
}
.carta-item-price {
  color: #b8860b;
}`;

const HTML_EXAMPLE = `<h2>Nuestro menú</h2>
<p>Cocina criolla hecha al momento.</p>`;

export default function MenuDesignEditor() {
  const { settings, saveSettings } = useSettings();
  const [css, setCss] = useState(settings.menu_custom_css || '');
  const [top, setTop] = useState(settings.menu_custom_html_top || '');
  const [bottom, setBottom] = useState(settings.menu_custom_html_bottom || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    setCss(settings.menu_custom_css || '');
    setTop(settings.menu_custom_html_top || '');
    setBottom(settings.menu_custom_html_bottom || '');
  }, [settings.menu_custom_css, settings.menu_custom_html_top, settings.menu_custom_html_bottom]);

  // Subir un archivo .css o .html lo carga en su campo (se puede revisar antes de guardar).
  function loadFile(setter) {
    return (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setter(String(reader.result || '').slice(0, MAX_CUSTOM_LENGTH));
      reader.readAsText(file, 'utf-8');
      e.target.value = '';
    };
  }

  async function save() {
    setBusy(true);
    setMsg({ type: '', text: '' });
    const { error } = await saveSettings({ menu_custom_css: css, menu_custom_html_top: top, menu_custom_html_bottom: bottom });
    setBusy(false);
    setMsg(error ? { type: 'error', text: error.message || 'No se pudo guardar.' } : { type: 'ok', text: 'Diseño del menú guardado.' });
  }

  return (
    <div className="menu-design">
      <CodeField id="mdCss" label="CSS" accept=".css,text/css" value={css} onChange={setCss} onFile={loadFile(setCss)} placeholder={CSS_EXAMPLE} />
      <CodeField id="mdTop" label="HTML arriba del menú" accept=".html,.htm,text/html" value={top} onChange={setTop} onFile={loadFile(setTop)} placeholder={HTML_EXAMPLE} />
      <CodeField id="mdBottom" label="HTML debajo del menú" accept=".html,.htm,text/html" value={bottom} onChange={setBottom} onFile={loadFile(setBottom)} placeholder="<p>Precios con impuestos incluidos.</p>" />
      {msg.text && <div className={`form-msg show ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</div>}
      <div className="menu-design-actions">
        <button type="button" className="btn btn-amber" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar diseño'}</button>
        <Link href="/menu" className="pill-btn-dark">Ver el menú</Link>
      </div>
    </div>
  );
}

function CodeField({ id, label, accept, value, onChange, onFile, placeholder }) {
  return (
    <div className="field">
      <div className="menu-design-label">
        <label htmlFor={id}>{label}</label>
        <label className="menu-design-upload">
          Subir archivo
          <input type="file" accept={accept} hidden onChange={onFile} />
        </label>
      </div>
      <textarea id={id} className="code-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck="false" maxLength={MAX_CUSTOM_LENGTH} />
    </div>
  );
}
