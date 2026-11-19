'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useCurrency, basePriceFor } from '@/context/CurrencyContext';
import { normalizeGroups, initialSelection, toggleChoice, missingRequired, groupHint } from '@/lib/productOptions';

// El producto: foto grande (o su inicial sobre el color de su categoría), lo que lleva, las opciones como
// filas para tocar, una nota para la cocina y, abajo y siempre a la vista, la cantidad y «Agregar · total».
export default function ProductDetailModal({ item, tint = 'manana', onClose }) {
  const { addItem } = useCart();
  const { isStaff } = useAuth(); // el dueño ve el producto, pero no tiene carrito
  const { currency, format } = useCurrency();
  const { isFav, toggle } = useFavorites();
  const reduce = useReducedMotion();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const options = normalizeGroups(item.options);
  const [selected, setSelected] = useState(() => initialSelection(options));
  const [missing, setMissing] = useState('');
  const tags = (item.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  const fav = isFav(item.id);
  const soldOut = item.available === false;
  const description = item.description && item.description.trim();
  const ingredients = item.ingredients && item.ingredients.trim();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // precio de una unidad en la moneda elegida: el precio especial del producto (si tiene) más las opciones
  const unitPrice = basePriceFor(item, currency) + selected.reduce((s, o) => s + (o.price || 0), 0);

  function chooseOption(groupName, choice) {
    setMissing('');
    setSelected((prev) => toggleChoice(options, prev, groupName, choice));
  }

  function handleAdd() {
    if (soldOut) return;
    const need = missingRequired(options, selected);
    if (need) {
      setMissing(need);
      const el = document.getElementById(`pdx-group-${need}`);
      if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      return;
    }
    // en el orden de los grupos, para que el carrito y la orden lo muestren igual que el menú
    const ordered = options.flatMap((g) => g.choices.filter((c) => selected.some((o) => o.group === g.name && o.label === c.label)).map((c) => ({ group: g.name, ...c })));
    addItem(item, qty, ordered, note);
    onClose();
  }

  const rise = (i) => (reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.08 + i * 0.04, duration: 0.32, ease: [0.22, 0.61, 0.36, 1] } });

  return (
    <AnimatePresence>
      <motion.div
        className="pdx-overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          className="pdx"
          role="dialog" aria-modal="true" aria-label={item.name}
          initial={reduce ? { opacity: 0 } : { y: '100%' }} animate={reduce ? { opacity: 1 } : { y: 0 }} exit={reduce ? { opacity: 0 } : { y: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        >
          <div className="pdx-scroll">
            <div className={`pdx-hero${item.image_url ? ' has-photo' : ''}`} style={item.image_url ? undefined : { '--pdx-tint': `var(--tint-${tint})`, '--pdx-deep': `var(--tint-${tint}-deep)` }}>
              {item.image_url
                ? <img src={item.image_url} alt={item.name} />
                : <span className="pdx-initial" aria-hidden="true">{(item.name || '?').trim().charAt(0)}</span>}
              <button type="button" className={`pdx-round pdx-fav${fav ? ' on' : ''}`} onClick={() => toggle(item.id)} aria-label={fav ? 'Quitar de favoritos' : 'Guardar en favoritos'} aria-pressed={fav}>
                <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9.3-8.8C1.2 8 2.7 4.8 6 4.2c2-.4 3.7.5 6 2.6 2.3-2.1 4-3 6-2.6 3.3.6 4.8 3.8 3.3 7C19 15.6 12 20 12 20z" /></svg>
              </button>
              <button type="button" className="pdx-round pdx-close" onClick={onClose} aria-label="Cerrar">
                <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
              {soldOut && <span className="pdx-soldout">Agotado</span>}
            </div>

            <div className="pdx-body">
              <motion.div className="pdx-head" {...rise(0)}>
                {item.category && <p className="eyebrow">{item.category}</p>}
                <div className="pdx-title">
                  <h2>{item.name}</h2>
                  <b className="pdx-price">{format(basePriceFor(item, currency))}</b>
                </div>
                {tags.length > 0 && <div className="pdx-tags">{tags.map((t) => <span key={t}>{t}</span>)}</div>}
                {description && <p className="pdx-desc">{description}</p>}
              </motion.div>

              {ingredients && (
                <motion.div className="pdx-ingredients" {...rise(1)}>
                  <span>Lleva</span>
                  <p>{ingredients}</p>
                </motion.div>
              )}

              {options.map((group, gi) => (
                <motion.fieldset key={group.name} id={`pdx-group-${group.name}`} className={`pdx-group${missing === group.name ? ' is-missing' : ''}`} {...rise(2 + gi)}>
                  <legend className="pdx-group-head">
                    <b>{group.name}</b>
                    <span className={group.required ? 'is-required' : ''}>{groupHint(group)}</span>
                  </legend>
                  <div className="pdx-choices">
                    {group.choices.map((choice) => {
                      const isActive = selected.some((o) => o.group === group.name && o.label === choice.label);
                      const multi = group.type === 'multiple';
                      return (
                        <button
                          type="button"
                          key={choice.label}
                          role={multi ? 'checkbox' : 'radio'}
                          aria-checked={isActive}
                          className={`pdx-choice${isActive ? ' on' : ''}${multi ? ' is-multi' : ''}`}
                          onClick={() => chooseOption(group.name, choice)}
                        >
                          <span className="pdx-mark" aria-hidden="true">{isActive && <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
                          <span className="pdx-choice-label">{choice.label}</span>
                          {choice.price > 0 && <span className="pdx-choice-price">+{format(choice.price)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </motion.fieldset>
              ))}

              {!soldOut && !isStaff && (
                <motion.div className="tfield pdx-note" {...rise(2 + options.length)}>
                  <input id={`pdx-note-${item.id}`} placeholder=" " maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
                  <label htmlFor={`pdx-note-${item.id}`}>Nota para la cocina (opcional)</label>
                </motion.div>
              )}
            </div>
          </div>

          {!isStaff && <div className="pdx-foot">
            {missing && <p className="pdx-alert" role="alert">Elige {missing.toLowerCase()} para continuar</p>}
            {soldOut ? (
              <p className="pdx-alert is-soldout" role="alert">Agotado por ahora</p>
            ) : (
              <div className="pdx-actions">
                <div className="ci-step is-big pdx-qty">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Uno menos" disabled={qty <= 1}><svg viewBox="0 0 24 24"><path d="M6 12h12" /></svg></button>
                  <span aria-live="polite">{qty}</span>
                  <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Uno más"><svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12" /></svg></button>
                </div>
                <motion.button whileTap={reduce ? undefined : { scale: 0.97 }} type="button" className="cart-cta pdx-add" onClick={handleAdd}>
                  <span>Agregar</span>
                  <b>{format(unitPrice * qty)}</b>
                </motion.button>
              </div>
            )}
          </div>}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
