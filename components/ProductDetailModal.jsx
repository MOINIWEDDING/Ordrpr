'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/context/CartContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useCurrency, basePriceFor } from '@/context/CurrencyContext';
import { normalizeGroups, initialSelection, toggleChoice, missingRequired, groupHint } from '@/lib/productOptions';

export default function ProductDetailModal({ item, tint = 'manana', onClose }) {
  const { addItem } = useCart();
  const { currency, format } = useCurrency();
  const { isFav, toggle } = useFavorites();
  const [qty, setQty] = useState(1);
  const options = normalizeGroups(item.options);
  const [selected, setSelected] = useState(() => initialSelection(options));
  const [missing, setMissing] = useState('');
  const tags = (item.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  const fav = isFav(item.id);

  // precio de una unidad en la moneda elegida: el precio especial del producto (si tiene) más las opciones
  const unitPrice = basePriceFor(item, currency) + selected.reduce((s, o) => s + (o.price || 0), 0);

  function chooseOption(groupName, choice) {
    setMissing('');
    setSelected((prev) => toggleChoice(options, prev, groupName, choice));
  }

  function handleAdd() {
    const need = missingRequired(options, selected);
    if (need) { setMissing(need); return; }
    // en el orden de los grupos, para que el carrito y la orden lo muestren igual que el menú
    const ordered = options.flatMap((g) => g.choices.filter((c) => selected.some((o) => o.group === g.name && o.label === c.label)).map((c) => ({ group: g.name, ...c })));
    addItem(item, qty, ordered);
    onClose();
  }

  return (
    <AnimatePresence>
      <motion.div
        className="pd-overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <motion.div
          className="pd-sheet"
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <div className="pd-hero" style={{ background: `var(--tint-${tint})` }}>
            <button type="button" className="pd-back" onClick={onClose} aria-label="Volver">
              <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" className={`pd-fav${fav ? ' on' : ''}`} onClick={() => toggle(item.id)} aria-label="Favorito">
              <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9.3-8.8C1.2 8 2.7 4.8 6 4.2c2-.4 3.7.5 6 2.6 2.3-2.1 4-3 6-2.6 3.3.6 4.8 3.8 3.3 7C19 15.6 12 20 12 20z" /></svg>
            </button>
            <div className="pd-photo">
              {item.image_url
                ? <img src={item.image_url} alt={item.name} />
                : <div className="pd-photo-empty"><svg viewBox="0 0 24 24"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.4" /></svg></div>}
            </div>
          </div>

          <div className="pd-body">
            <h2>{item.name}</h2>
            <p className="pd-sub">{item.category}{tags.length ? ` · ${tags.join(', ')}` : ''}</p>

            <div className="pd-price-row">
              <span className="pd-price">{format(unitPrice)}</span>
              <div className="qty-stepper">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Menos">–</button>
                <span>{qty}</span>
                <button type="button" onClick={() => setQty((q) => q + 1)} aria-label="Más">+</button>
              </div>
            </div>

            {options.map((group) => (
              <div key={group.name} className={`pd-options-group${missing === group.name ? ' missing' : ''}`}>
                <div className="pd-options-head">
                  <h3 className="pd-section-title">{group.name}</h3>
                  <span className={`pd-options-hint${group.required ? ' required' : ''}`}>{groupHint(group)}</span>
                </div>
                <div className="pd-options-choices">
                  {group.choices.map((choice) => {
                    const isActive = selected.some((o) => o.group === group.name && o.label === choice.label);
                    return (
                      <button
                        type="button"
                        key={choice.label}
                        role={group.type === 'multiple' ? 'checkbox' : 'radio'}
                        aria-checked={isActive}
                        className={`pd-option-pill${isActive ? ' active' : ''}${group.type === 'multiple' ? ' multi' : ''}`}
                        onClick={() => chooseOption(group.name, choice)}
                      >
                        {choice.label}{choice.price > 0 ? ` +${format(choice.price)}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <h3 className="pd-section-title">Descripción</h3>
            <p className="pd-desc">
              {item.description && item.description.trim()
                ? item.description
                : 'Preparado al momento por nuestro equipo.'}
            </p>
          </div>

          {missing && <p className="pd-missing" role="alert">Elige {missing.toLowerCase()} para continuar</p>}
          <div className="pd-cta-wrap">
            <motion.button whileTap={{ scale: 0.92 }} type="button" className="pd-cta" onClick={handleAdd} aria-label="Agregar al carrito">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
