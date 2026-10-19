'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/context/CartContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useCurrency } from '@/context/CurrencyContext';
import ProductDetailModal from './ProductDetailModal';
import BrandLogo from './BrandLogo';

export default function ProductCard({ item, tint = 'manana', onEdit, onDelete, showDivider = true }) {
  const { addItem } = useCart();
  const { formatItem } = useCurrency();
  const { isFav, toggle } = useFavorites();
  const [confirming, setConfirming] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const tags = (item.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  const fav = isFav(item.id);

  function handleAdd(e) {
    e.stopPropagation();
    if (Array.isArray(item.options) && item.options.length > 0) {
      setDetailOpen(true); // hay que elegir opciones (leche, sirup, tamaño…) antes de agregar
      return;
    }
    addItem(item);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 700);
  }

  function stop(fn) {
    return (e) => { e.stopPropagation(); fn(e); };
  }

  return (
    <>
      <motion.article
        className="p-card"
        whileHover={{ y: -6 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        onClick={() => setDetailOpen(true)}
        role="button"
        tabIndex={0}
      >
        <div className="p-photo" style={{ '--tint': `var(--tint-${tint})`, '--tint-deep': `var(--tint-${tint}-deep)` }}>
          {!item.image_url && (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="ph-icon" style={{ width: 30, height: 30, stroke: '#fff', opacity: .6 }} viewBox="0 0 24 24"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.4" /></svg>
            </div>
          )}
          <div className="p-photo-tint" />
          <div className="p-photo-fade" />
          {item.featured && <span className="p-tagline">Favorito de la casa</span>}

          <motion.button
            type="button"
            className={`card-fav${fav ? ' on' : ''}`}
            aria-label="Favorito"
            whileTap={{ scale: 0.8 }}
            onClick={stop(() => toggle(item.id))}
          >
            <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9.3-8.8C1.2 8 2.7 4.8 6 4.2c2-.4 3.7.5 6 2.6 2.3-2.1 4-3 6-2.6 3.3.6 4.8 3.8 3.3 7C19 15.6 12 20 12 20z" /></svg>
          </motion.button>

          {(onEdit || onDelete) && (
            <div className="p-admin">
              {onEdit && (
                <button type="button" className="icon-btn" aria-label="Editar" onClick={stop(() => onEdit(item))}>
                  <svg className="icon" style={{ width: 13, height: 13 }} viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                </button>
              )}
              {onDelete && (
                <button type="button" className="icon-btn danger" aria-label="Eliminar" onClick={stop(() => setConfirming(true))}>
                  <svg className="icon" style={{ width: 13, height: 13 }} viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>
                </button>
              )}
            </div>
          )}

          {confirming && (
            <div className="confirm-del-sm" onClick={(e) => e.stopPropagation()}>
              <span>¿Eliminar este producto?</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-amber" style={{ border: 'none' }} onClick={stop(() => { onDelete(item); setConfirming(false); })}>Sí, eliminar</button>
                <button type="button" className="btn-ghost" style={{ border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff' }} onClick={stop(() => setConfirming(false))}>Cancelar</button>
              </div>
            </div>
          )}
        </div>

        {item.image_url && (
          <img className="p-photo-pop" src={item.image_url} alt={item.name} />
        )}

        <div className="p-info" style={{ '--tint-deep': `var(--tint-${tint}-deep)` }}>
          <BrandLogo alt="" className="card-logo-mark" />
          <h4>{item.name}</h4>
          {tags.length > 0 && (
            <div className="p-tags">{tags.map((t) => <span key={t}>{t}</span>)}</div>
          )}
          {showDivider && <div className="p-divider" />}
          <div className="p-bottom-row">
            <span className="p-price">{formatItem(item)}</span>
            <motion.button
              type="button"
              className={`p-plus${justAdded ? ' bump' : ''}`}
              aria-label="Agregar al carrito"
              whileTap={{ scale: 0.82 }}
              onClick={handleAdd}
            >
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
            </motion.button>
          </div>
        </div>
      </motion.article>

      <AnimatePresence>
        {detailOpen && (
          <ProductDetailModal item={item} tint={tint} onClose={() => setDetailOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
