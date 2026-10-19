'use client';
import { useState, useEffect } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useUploader } from '@/hooks/useUploader';
import Uploader from './Uploader';
import HoursPicker from './HoursPicker';

// Un mismo formulario sirve para el asistente inicial y para el panel del dueño.
// group: 'identity' (nombre, logo) | 'contact' (dirección, horario, redes) | 'money' (moneda, prefijo gift cards)
const FIELDS = {
  identity: ['brand_name', 'tagline', 'description'],
  contact: ['city', 'address', 'phone', 'whatsapp', 'email', 'instagram', 'facebook', 'hours'],
  money: ['currency_symbol', 'currency_position', 'gift_card_prefix', 'extra_currencies'],
};

function initialsPrefix(name) {
  const letters = String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'GC');
}

// Otras monedas que el cliente puede elegir al pagar. El tipo de cambio se escribe como
// "1 US$ = 60 RD$", que es como lo piensa el dueño.
const MAX_EXTRA_CURRENCIES = 5;

function ExtraCurrencies({ baseSymbol, value, onChange }) {
  const update = (i, patch) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="field">
      <label>Otras monedas para pagar (opcional)</label>
      <p className="up-hint" style={{ marginTop: 0 }}>Tus precios siguen en {baseSymbol}. Si agregas otra moneda, el cliente puede elegir pagar en ella y verá el total ya convertido.</p>
      <div className="currency-list">
        {value.map((c, i) => (
          <div className="currency-row" key={i}>
            <div className="currency-row-top">
              <label>
                <span>Nombre</span>
                <input type="text" value={c.name || ''} onChange={(e) => update(i, { name: e.target.value })} placeholder="Ej. Dólar" maxLength={30} />
              </label>
              <label className="currency-symbol">
                <span>Símbolo</span>
                <input type="text" value={c.symbol || ''} onChange={(e) => update(i, { symbol: e.target.value })} placeholder="US$" maxLength={5} />
              </label>
              <button type="button" className="hours-remove" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Quitar esta moneda">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <div className="currency-rate">
              <span>1 {c.symbol || '…'} =</span>
              <input type="text" inputMode="decimal" value={c.rate ?? ''} onChange={(e) => update(i, { rate: e.target.value })} placeholder="60" aria-label={`Cuánto vale 1 ${c.symbol || 'unidad'} en ${baseSymbol}`} />
              <span>{baseSymbol}</span>
            </div>
            <div className="seg-buttons seg-buttons-sm" role="group" aria-label="Dónde va el símbolo">
              {[['before', 'Antes del precio'], ['after', 'Después del precio']].map(([pos, label]) => (
                <button key={pos} type="button" aria-pressed={(c.position || 'before') === pos} className={(c.position || 'before') === pos ? 'active' : ''} onClick={() => update(i, { position: pos })}>{label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {value.length < MAX_EXTRA_CURRENCIES && (
        <button type="button" className="hours-add" onClick={() => onChange([...value, { name: '', symbol: '', position: 'before', rate: '' }])}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Agregar moneda
        </button>
      )}
    </div>
  );
}

// Ejemplo de precio con el mismo formato que usa el menú (ver formatMoney en lib/settingsDefaults).
function pricePreview(form) {
  const symbol = form.currency_symbol || '$';
  let amount;
  try { amount = (1500).toLocaleString(form.locale || 'es-DO'); } catch (e) { amount = '1500'; }
  return form.currency_position === 'after' ? `${amount}${symbol}` : `${symbol}${amount}`;
}

export default function BrandSettingsForm({ group = 'identity', onSaved, submitLabel = 'Guardar' }) {
  const { settings, saveSettings } = useSettings();
  const uploader = useUploader({ kind: 'logo' });
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    const next = {};
    FIELDS[group].forEach((k) => { next[k] = settings[k] ?? ''; });
    setForm(next);
  }, [group, settings]);

  useEffect(() => {
    if (group === 'identity') uploader.setUrl(settings.logo_url || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, settings.logo_url]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    const patch = {};
    FIELDS[group].forEach((k) => { if (k !== 'extra_currencies') patch[k] = String(form[k] ?? '').trim(); });

    if (group === 'identity') {
      if (!patch.brand_name) { setMsg({ type: 'error', text: 'Escribe el nombre de tu negocio.' }); return; }
      if (uploader.uploading) { setMsg({ type: 'error', text: 'Espera a que el logo termine de subir.' }); return; }
      patch.logo_url = uploader.url || '';
      // primer guardado: sugerimos el prefijo de las gift cards con las iniciales del negocio
      if (!settings.gift_card_prefix || settings.gift_card_prefix === 'GC') patch.gift_card_prefix = initialsPrefix(patch.brand_name);
    }
    if (group === 'money') {
      patch.gift_card_prefix = patch.gift_card_prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
      if (patch.gift_card_prefix.length < 2) { setMsg({ type: 'error', text: 'El prefijo de las gift cards necesita entre 2 y 5 letras o números.' }); return; }
      if (!patch.currency_symbol) { setMsg({ type: 'error', text: 'Escribe el símbolo de tu moneda (por ejemplo RD$ o $).' }); return; }
      patch.currency_symbol = patch.currency_symbol.slice(0, 5);
      if (!['before', 'after'].includes(patch.currency_position)) patch.currency_position = 'before';
      const extras = Array.isArray(form.extra_currencies) ? form.extra_currencies : [];
      const clean = [];
      for (const c of extras) {
        const symbol = String(c.symbol || '').trim().slice(0, 5);
        const rate = Number(String(c.rate).replace(',', '.'));
        if (!symbol && !c.rate && !String(c.name || '').trim()) continue; // fila vacía: se ignora
        if (!symbol) { setMsg({ type: 'error', text: 'Cada moneda extra necesita su símbolo (por ejemplo US$ o €).' }); return; }
        if (!(rate > 0)) { setMsg({ type: 'error', text: `Escribe cuánto vale 1 ${symbol} en ${patch.currency_symbol}.` }); return; }
        clean.push({ name: String(c.name || '').trim().slice(0, 30), symbol, position: c.position === 'after' ? 'after' : 'before', rate });
      }
      patch.extra_currencies = clean;
    }

    setBusy(true);
    const { error } = await saveSettings(patch);
    setBusy(false);
    if (error) { setMsg({ type: 'error', text: error.message || 'No se pudo guardar.' }); return; }
    setMsg({ type: 'ok', text: 'Guardado.' });
    if (onSaved) onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="brand-form">
      {group === 'identity' && (
        <>
          <div className="field">
            <label htmlFor="bfName">Nombre del negocio</label>
            <input id="bfName" type="text" value={form.brand_name || ''} onChange={set('brand_name')} placeholder="Ej. La Casa del Sabor" maxLength={60} />
          </div>
          <div className="field">
            <label htmlFor="bfTagline">Eslogan (opcional)</label>
            <input id="bfTagline" type="text" value={form.tagline || ''} onChange={set('tagline')} placeholder="Ej. Comida casera con sazón de siempre" maxLength={90} />
          </div>
          <div className="field">
            <label>Logo</label>
            <Uploader uploader={uploader} kind="logo" />
          </div>
          <div className="field">
            <label htmlFor="bfDesc">Descripción para Google (opcional)</label>
            <textarea id="bfDesc" value={form.description || ''} onChange={set('description')} placeholder="Una o dos frases que aparecerán al compartir tu página." maxLength={200} />
          </div>
        </>
      )}

      {group === 'contact' && (
        <>
          <div className="field"><label htmlFor="bfCity">Ciudad</label><input id="bfCity" type="text" value={form.city || ''} onChange={set('city')} placeholder="Ej. tu ciudad" /></div>
          <div className="field"><label htmlFor="bfAddr">Dirección general</label><input id="bfAddr" type="text" value={form.address || ''} onChange={set('address')} placeholder="Calle y número (cada sucursal puede tener la suya)" /></div>
          <div className="field"><label htmlFor="bfPhone">Teléfono</label><input id="bfPhone" type="tel" value={form.phone || ''} onChange={set('phone')} /></div>
          <div className="field"><label htmlFor="bfWa">WhatsApp (opcional)</label><input id="bfWa" type="tel" value={form.whatsapp || ''} onChange={set('whatsapp')} /></div>
          <div className="field"><label htmlFor="bfMail">Correo (opcional)</label><input id="bfMail" type="email" value={form.email || ''} onChange={set('email')} /></div>
          <div className="field"><label htmlFor="bfIg">Instagram (enlace, opcional)</label><input id="bfIg" type="url" value={form.instagram || ''} onChange={set('instagram')} placeholder="https://instagram.com/tunegocio" /></div>
          <div className="field"><label htmlFor="bfFb">Facebook (enlace, opcional)</label><input id="bfFb" type="url" value={form.facebook || ''} onChange={set('facebook')} placeholder="https://facebook.com/tunegocio" /></div>
          <div className="field"><label htmlFor="bfHours">Horario general</label><HoursPicker id="bfHours" value={form.hours || ''} onChange={(hours) => setForm((f) => ({ ...f, hours }))} /></div>
        </>
      )}

      {group === 'money' && (
        <>
          <div className="field"><label htmlFor="bfSym">Símbolo de la moneda</label><input id="bfSym" type="text" value={form.currency_symbol || ''} onChange={set('currency_symbol')} placeholder="RD$, $, €…" maxLength={5} /></div>
          <div className="field">
            <label id="bfPosLabel">Dónde va el símbolo</label>
            <div className="seg-buttons" role="group" aria-labelledby="bfPosLabel">
              {[['before', 'Antes del precio'], ['after', 'Después del precio']].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={(form.currency_position || 'before') === value}
                  className={(form.currency_position || 'before') === value ? 'active' : ''}
                  onClick={() => setForm((f) => ({ ...f, currency_position: value }))}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="money-preview">
              <span>Así se verán tus precios</span>
              <b>{pricePreview(form)}</b>
            </div>
          </div>
          <ExtraCurrencies
            baseSymbol={form.currency_symbol || '$'}
            value={Array.isArray(form.extra_currencies) ? form.extra_currencies : []}
            onChange={(extra_currencies) => setForm((f) => ({ ...f, extra_currencies }))}
          />
          <div className="field">
            <label htmlFor="bfPref">Prefijo de las gift cards</label>
            <input id="bfPref" type="text" value={form.gift_card_prefix || ''} onChange={set('gift_card_prefix')} placeholder="Ej. LCS" maxLength={5} />
            <span className="up-hint">Los códigos se verán así: {(form.gift_card_prefix || 'GC').toUpperCase()}-AB12-CD34</span>
          </div>
        </>
      )}

      {msg.text && <div className={`form-msg show ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</div>}
      <button type="submit" className="btn btn-amber" disabled={busy || uploader.uploading} style={{ marginTop: 12 }}>
        {busy ? 'Guardando…' : submitLabel}
      </button>
    </form>
  );
}
