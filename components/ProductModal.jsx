'use client';
import { useState, useEffect } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useUploader } from '@/hooks/useUploader';
import { money } from '@/hooks/useMenuItems';
import { PRODUCT_PHOTO_MIN, PRODUCT_PHOTO_MAX } from '@/lib/upload';
import Modal from './Modal';
import ProductIcon from './ProductIcon';
import { useSettings } from '@/context/SettingsContext';

// Editor de productos: arriba una vista previa en vivo de la tarjeta (tal como la verá el cliente,
// con el color de su categoría); debajo los datos agrupados en Producto, Precio y Detalles.
export default function ProductModal({ item, defaultCategory, categories, onClose, onSaved }) {
  const uploader = useUploader({ requireTransparent: true });
  const [name, setName] = useState(item ? item.name : '');
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const [cost, setCost] = useState(item ? (item.cost ? String(item.cost) : '') : '');
  const [category, setCategory] = useState(item ? item.category : (defaultCategory || (categories[0] && categories[0].name) || ''));
  const [tags, setTags] = useState(() => splitTags(item ? item.tags : ''));
  const [tagDraft, setTagDraft] = useState('');
  const [description, setDescription] = useState(item ? (item.description || '') : '');
  const [featured, setFeatured] = useState(item ? !!item.featured : false);
  const [isBeverage, setIsBeverage] = useState(item ? !!item.is_beverage : false);
  const [onHome, setOnHome] = useState(item ? !item.home_hidden : true);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [saving, setSaving] = useState(false);
  const { settings } = useSettings();
  const extraCurrencies = Array.isArray(settings.extra_currencies) ? settings.extra_currencies.filter((c) => c && c.code) : [];
  const baseSymbol = settings.currency_symbol || '$';
  // Precio especial por moneda, escrito en esa moneda: { USD: 6 } = si pagan en dólares, cuesta US$6.
  const [currencyPrices, setCurrencyPrices] = useState(() => {
    const saved = (item && item.currency_prices) || {};
    const out = {};
    Object.keys(saved).forEach((k) => { out[k] = String(saved[k]); });
    return out;
  });

  useEffect(() => { if (item && item.image_url) uploader.setUrl(item.image_url); }, []); // eslint-disable-line

  const tint = (categories.find((c) => c.name === category) || {}).tint || 'manana';
  const priceNum = parseFloat(price);
  const costNum = parseFloat(cost);
  const profit = priceNum > 0 && costNum > 0 ? priceNum - costNum : null;

  function addTag(raw) {
    const clean = raw.replace(/,/g, ' ').trim();
    if (!clean) return;
    setTags((t) => (t.some((x) => x.toLowerCase() === clean.toLowerCase()) ? t : [...t, clean]));
    setTagDraft('');
  }

  function onTagKey(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft); }
    else if (e.key === 'Backspace' && !tagDraft && tags.length) setTags((t) => t.slice(0, -1));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || Number.isNaN(priceNum)) { setMsg({ text: 'Completa el nombre y el precio.', type: 'error' }); return; }
    if (uploader.uploading) { setMsg({ text: 'Espera a que la foto termine de subir.', type: 'error' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ text: 'Conecta Supabase para guardar cambios de verdad.', type: 'error' }); return; }
    const allTags = tagDraft.trim() ? [...tags, tagDraft.trim()] : tags;
    const prices = {};
    extraCurrencies.forEach((c) => {
      const n = parseFloat(currencyPrices[c.code]);
      if (n > 0) prices[c.code] = n;
    });
    const payload = {
      name: name.trim(), price: priceNum, cost: costNum || 0, category, image_url: uploader.url,
      tags: allTags.join(', '), description: description.trim(), featured, is_beverage: isBeverage, currency_prices: prices, home_hidden: !onHome,
    };
    if (item) payload.updated_at = new Date().toISOString();
    setSaving(true);
    const save = (data) => (item ? sb.from('menu_items').update(data).eq('id', item.id) : sb.from('menu_items').insert(data));
    let { error } = await save(payload);
    // si la base de datos aún no tiene alguna columna nueva (falta su migración), se guarda lo demás
    let sent = payload;
    for (const col of ['currency_prices', 'home_hidden']) {
      if (error && new RegExp(col, 'i').test(error.message || '')) {
        sent = { ...sent };
        delete sent[col];
        ({ error } = await save(sent));
      }
    }
    setSaving(false);
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    await onSaved();
    onClose();
  }

  const pickPhoto = () => uploader.inputRef.current && uploader.inputRef.current.click();

  return (
    <Modal onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="pe">
        <div className="pe-head">
          <p className="eyebrow">Menú</p>
          <h3>{item ? 'Editar producto' : 'Nuevo producto'}</h3>
        </div>

        {/* Vista previa en vivo: es también el lugar para elegir la foto */}
        <div className="pe-preview" style={{ '--tint': `var(--tint-${tint})`, '--tint-deep': `var(--tint-${tint}-deep)` }}>
          <button type="button" className="pe-photo" onClick={pickPhoto} disabled={uploader.uploading} aria-label={uploader.previewUrl ? 'Cambiar foto' : 'Elegir foto'}>
            {uploader.previewUrl ? (
              <img src={uploader.previewUrl} alt="" />
            ) : (
              <span className="pe-photo-empty">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.4" /></svg>
                Agregar foto
              </span>
            )}
            {uploader.previewUrl && !uploader.uploading && <span className="pe-photo-change">Cambiar</span>}
            {uploader.uploading && <span className="pe-photo-progress"><i style={{ width: `${Math.max(uploader.progress, 12)}%` }} /></span>}
          </button>
          {uploader.previewUrl && !uploader.uploading && (
            <button type="button" className="pe-photo-remove" onClick={uploader.reset} aria-label="Quitar foto">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          )}
          <div className="pe-preview-info">
            <span className="pe-preview-name">{name.trim() || 'Nombre del producto'}</span>
            <span className="pe-preview-price">{priceNum >= 0 ? money(priceNum) : money(0)}</span>
          </div>
          <input ref={uploader.inputRef} type="file" accept="image/png" hidden onChange={uploader.onInputChange} />
        </div>
        <p className="pe-photo-hint">PNG sin fondo, cuadrado, de {PRODUCT_PHOTO_MIN} a {PRODUCT_PHOTO_MAX} px</p>
        {uploader.error && <div className="form-msg show error">{uploader.error}</div>}

        <section className="pe-section">
          <h4>Producto</h4>
          <div className="field">
            <label htmlFor="pName">Nombre</label>
            <input id="pName" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Mofongo de camarones" />
          </div>
          <div className="field">
            <label id="pCatLabel">Categoría</label>
            <div className="pe-cats" role="radiogroup" aria-labelledby="pCatLabel">
              {categories.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={category === g.name}
                  className={`pe-cat${category === g.name ? ' active' : ''}`}
                  style={{ '--tint': `var(--tint-${g.tint || 'manana'})`, '--tint-deep': `var(--tint-${g.tint || 'manana'}-deep)` }}
                  onClick={() => setCategory(g.name)}
                >
                  <span className="pe-cat-icon"><ProductIcon name={g.icon} /></span>
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="pe-section">
          <h4>Precio</h4>
          <div className="pe-money-row">
            <div className="field">
              <label htmlFor="pPrice">Precio</label>
              <div className="pe-money">
                <span>{baseSymbol}</span>
                <input id="pPrice" type="number" min="0" step="1" inputMode="numeric" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="pCost">Costo</label>
              <div className="pe-money">
                <span>{baseSymbol}</span>
                <input id="pCost" type="number" min="0" step="1" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          </div>
          {profit !== null && (
            <p className={`pe-profit${profit < 0 ? ' loss' : ''}`}>
              {profit < 0 ? 'Pierdes' : 'Ganas'} <b>{money(Math.abs(profit))}</b> por venta · {Math.round((profit / priceNum) * 100)}%
            </p>
          )}
          {extraCurrencies.length > 0 && (
            <div className="field">
              <label>En otras monedas</label>
              <div className="pe-money-row">
                {extraCurrencies.map((c) => (
                  <div className="pe-money" key={c.code}>
                    <span>{c.symbol}</span>
                    <input
                      id={`pPrice-${c.code}`}
                      aria-label={`Precio en ${c.symbol}`}
                      type="number" min="0" step="0.01" inputMode="decimal"
                      value={currencyPrices[c.code] || ''}
                      onChange={(e) => setCurrencyPrices((p) => ({ ...p, [c.code]: e.target.value }))}
                      placeholder="Automático"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="pe-section">
          <h4>Detalles</h4>
          <div className="field">
            <label htmlFor="pDesc">Descripción</label>
            <textarea id="pDesc" placeholder="Ingredientes, tamaño, notas…" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pTags">Etiquetas</label>
            <div className="pe-tags" onClick={() => document.getElementById('pTags')?.focus()}>
              {tags.map((t) => (
                <span className="pe-tag" key={t}>
                  {t}
                  <button type="button" onClick={() => setTags((all) => all.filter((x) => x !== t))} aria-label={`Quitar ${t}`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </span>
              ))}
              <input
                id="pTags"
                type="text"
                value={tagDraft}
                onChange={(e) => (e.target.value.endsWith(',') ? addTag(e.target.value) : setTagDraft(e.target.value))}
                onKeyDown={onTagKey}
                onBlur={() => addTag(tagDraft)}
                placeholder={tags.length ? 'Agregar otra' : 'Ej. Picante, Vegano'}
                enterKeyHint="enter"
              />
            </div>
          </div>
          <div className="pe-toggles">
            <Toggle id="pOnHome" checked={onHome} onChange={setOnHome} title="Mostrar en el inicio" icon={<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />} />
            <Toggle id="pFeatured" checked={featured} onChange={setFeatured} title="Destacado" icon={<path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4 7.2 18.9l.9-5.4-3.9-3.8 5.4-.8z" />} />
            <Toggle id="pBeverage" checked={isBeverage} onChange={setIsBeverage} title="Es una bebida" sub="Cuenta para el Early Bird" icon={<path d="M7 4h10l-1.2 15a1 1 0 0 1-1 .9H9.2a1 1 0 0 1-1-.9zM6.5 8h11" />} />
          </div>
        </section>

        {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}

        <div className="pe-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-amber" disabled={uploader.uploading || saving}>
            {uploader.uploading ? 'Subiendo foto…' : saving ? 'Guardando…' : (item ? 'Guardar cambios' : 'Crear producto')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function splitTags(text) {
  return String(text || '').split(',').map((t) => t.trim()).filter(Boolean);
}

function Toggle({ id, checked, onChange, title, sub, icon }) {
  return (
    <label className={`pe-toggle${checked ? ' on' : ''}`} htmlFor={id}>
      <span className="pe-toggle-icon"><svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg></span>
      <span className="pe-toggle-text">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="pe-switch" aria-hidden="true" />
    </label>
  );
}
