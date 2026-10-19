'use client';
import { useState, useEffect } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useUploader } from '@/hooks/useUploader';
import Uploader from './Uploader';
import Modal from './Modal';
import { useSettings } from '@/context/SettingsContext';
import { useCurrency } from '@/context/CurrencyContext';
import { convertFromBase, formatIn } from '@/lib/settingsDefaults';

export default function ProductModal({ item, defaultCategory, categories, onClose, onSaved }) {
  const uploader = useUploader({ requireTransparent: true });
  const [name, setName] = useState(item ? item.name : '');
  const [price, setPrice] = useState(item ? item.price : '');
  const [cost, setCost] = useState(item ? (item.cost || '') : '');
  const [category, setCategory] = useState(item ? item.category : (defaultCategory || (categories[0] && categories[0].name) || ''));
  const [tags, setTags] = useState(item ? (item.tags || '') : '');
  const [description, setDescription] = useState(item ? (item.description || '') : '');
  const [featured, setFeatured] = useState(item ? !!item.featured : false);
  const [isBeverage, setIsBeverage] = useState(item ? !!item.is_beverage : false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const { settings } = useSettings();
  const { currencies } = useCurrency(); // monedas con tasa de hoy, para mostrar a cuánto equivale cada precio especial
  const extraCurrencies = Array.isArray(settings.extra_currencies) ? settings.extra_currencies.filter((c) => c && c.code) : [];
  const baseSymbol = settings.currency_symbol || '$';
  // Precio especial por moneda, escrito en moneda principal: { USD: 350 } = si pagan en dólares se cobra el equivalente de RD$350.
  const [currencyPrices, setCurrencyPrices] = useState(() => {
    const saved = (item && item.currency_prices) || {};
    const out = {};
    Object.keys(saved).forEach((k) => { out[k] = String(saved[k]); });
    return out;
  });

  useEffect(() => { if (item && item.image_url) uploader.setUrl(item.image_url); }, []); // eslint-disable-line

  async function handleSubmit(e) {
    e.preventDefault();
    const priceNum = parseFloat(price);
    if (!name.trim() || Number.isNaN(priceNum)) { setMsg({ text: 'Completa el nombre y el precio.', type: 'error' }); return; }
    if (uploader.uploading) { setMsg({ text: 'Espera a que la foto termine de subir.', type: 'error' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ text: 'Conecta Supabase para guardar cambios de verdad.', type: 'error' }); return; }
    const prices = {};
    extraCurrencies.forEach((c) => {
      const n = parseFloat(currencyPrices[c.code]);
      if (n > 0) prices[c.code] = n;
    });
    const payload = { name: name.trim(), price: priceNum, cost: parseFloat(cost) || 0, category, image_url: uploader.url, tags: tags.trim(), description: description.trim(), featured, is_beverage: isBeverage, currency_prices: prices };
    if (item) payload.updated_at = new Date().toISOString();
    const save = (data) => (item ? sb.from('menu_items').update(data).eq('id', item.id) : sb.from('menu_items').insert(data));
    let { error } = await save(payload);
    // si la base de datos aún no tiene la columna de precios por moneda (falta su migración), se guarda lo demás
    if (error && /currency_prices/i.test(error.message || '')) {
      const rest = { ...payload };
      delete rest.currency_prices;
      ({ error } = await save(rest));
    }
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    await onSaved();
    onClose();
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="modal-top">
        <p className="eyebrow">Menú</p>
        <h3>{item ? 'Editar producto' : 'Agregar producto'}</h3>
      </div>
      <div className="modal-body">
        <form onSubmit={handleSubmit}>
          <div className="field"><label htmlFor="pName">Nombre del plato o bebida</label>
            <input id="pName" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="pPrice">Precio ({baseSymbol})</label>
              <input id="pPrice" type="number" min="0" step="1" inputMode="numeric" required value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="field"><label htmlFor="pCost">Costo (opcional)</label>
              <input id="pCost" type="number" min="0" step="1" inputMode="numeric" placeholder="Para calcular ganancia" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
          </div>
          {extraCurrencies.length > 0 && (
            <div className="field">
              <label>Precio especial por moneda (opcional)</label>
              <p className="currency-price-hint">Escríbelo en {baseSymbol}. Si lo dejas vacío, se cobra el precio normal convertido con la tasa del día.</p>
              <div className="currency-price-list">
                {extraCurrencies.map((c) => {
                  const live = currencies.find((x) => x.code === c.code);
                  const n = parseFloat(currencyPrices[c.code]);
                  return (
                    <div className="currency-price-row" key={c.code}>
                      <label htmlFor={`pPrice-${c.code}`}>Si pagan en {c.symbol}</label>
                      <input
                        id={`pPrice-${c.code}`}
                        type="number" min="0" step="1" inputMode="numeric"
                        placeholder={price ? String(price) : ''}
                        value={currencyPrices[c.code] || ''}
                        onChange={(e) => setCurrencyPrices((p) => ({ ...p, [c.code]: e.target.value }))}
                      />
                      <span className="currency-price-eq">
                        {live && (n > 0 || parseFloat(price) > 0)
                          ? `≈ ${formatIn(convertFromBase(n > 0 ? n : parseFloat(price), live), live)} hoy`
                          : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="field"><label htmlFor="pCat">Categoría</label>
            <select id="pCat" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Foto del producto</label><Uploader uploader={uploader} requireTransparent /></div>
          <div className="field"><label htmlFor="pTags">Etiquetas (separadas por coma)</label>
            <input id="pTags" type="text" placeholder="Dominicano, Filtrado, Frutal" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="field"><label htmlFor="pDesc">Descripción</label>
            <textarea id="pDesc" placeholder="Ingredientes, tamaño, notas…" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
            <input id="pFeatured" type="checkbox" style={{ width: 'auto' }} checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            <label htmlFor="pFeatured" style={{ margin: 0, textTransform: 'none', fontSize: 13, letterSpacing: 0, fontWeight: 500, color: 'var(--ink)' }}>Marcar como favorito</label>
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <input id="pBeverage" type="checkbox" style={{ width: 'auto' }} checked={isBeverage} onChange={(e) => setIsBeverage(e.target.checked)} />
            <label htmlFor="pBeverage" style={{ margin: 0, textTransform: 'none', fontSize: 13, letterSpacing: 0, fontWeight: 500, color: 'var(--ink)' }}>Es una bebida (para promociones como el Early Bird)</label>
          </div>
          {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-amber" disabled={uploader.uploading}>{uploader.uploading ? 'Subiendo…' : (item ? 'Guardar cambios' : 'Guardar producto')}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
