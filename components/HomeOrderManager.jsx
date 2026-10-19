'use client';
import { useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useCategories } from '@/hooks/useCategories';
import { useMenuItems } from '@/hooks/useMenuItems';
import ProductIcon from './ProductIcon';

// Orden y visibilidad del inicio: subir, bajar o poner primera cada categoría (y cada producto
// dentro de su categoría) y ocultarlos del inicio. Lo oculto sigue apareciendo en el menú.
export default function HomeOrderManager() {
  const { categories, reload: reloadCategories } = useCategories();
  const { items, reload: reloadItems } = useMenuItems();
  const [open, setOpen] = useState(null); // categoría abierta para ordenar sus productos
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Guarda el nuevo orden numerando todas las filas de la lista (0, 1, 2…).
  async function saveOrder(table, list) {
    if (!BARRO_CONFIGURED) return;
    setBusy(true);
    setError('');
    const results = await Promise.all(list.map((row, i) => (row.sort_order === i ? null : sb.from(table).update({ sort_order: i }).eq('id', row.id))));
    const failed = results.find((r) => r && r.error);
    if (failed) setError(failed.error.message);
    setBusy(false);
  }

  async function move(table, list, index, to, reload) {
    if (to < 0 || to >= list.length || to === index) return;
    const next = [...list];
    const [row] = next.splice(index, 1);
    next.splice(to, 0, row);
    await saveOrder(table, next);
    await reload();
  }

  async function toggleHidden(table, row, reload) {
    if (!BARRO_CONFIGURED) return;
    setBusy(true);
    setError('');
    const { error: err } = await sb.from(table).update({ home_hidden: !row.home_hidden }).eq('id', row.id);
    if (err) setError(err.message);
    setBusy(false);
    await reload();
  }

  if (!categories.length) return <p className="empty-note">Todavía no tienes categorías.</p>;

  return (
    <div className={`home-order${busy ? ' busy' : ''}`}>
      {error && <div className="form-msg show error">{error}</div>}
      {categories.map((cat, ci) => {
        const catItems = items.filter((i) => i.category === cat.name);
        const isOpen = open === cat.id;
        return (
          <div key={cat.id} className={`home-order-cat${cat.home_hidden ? ' hidden-home' : ''}`}>
            <div className="home-order-row">
              <button type="button" className="home-order-name" onClick={() => setOpen(isOpen ? null : cat.id)} aria-expanded={isOpen}>
                <span className="home-order-icon" style={{ background: `var(--tint-${cat.tint || 'manana'})` }}><ProductIcon name={cat.icon} /></span>
                <span className="home-order-text">
                  <b>{cat.name}</b>
                  <small>{catItems.length} producto{catItems.length === 1 ? '' : 's'}{cat.home_hidden ? ' · oculta en el inicio' : ''}</small>
                </span>
              </button>
              <OrderButtons
                first={ci === 0}
                last={ci === categories.length - 1}
                hidden={cat.home_hidden}
                disabled={busy}
                onTop={() => move('categories', categories, ci, 0, reloadCategories)}
                onUp={() => move('categories', categories, ci, ci - 1, reloadCategories)}
                onDown={() => move('categories', categories, ci, ci + 1, reloadCategories)}
                onToggle={() => toggleHidden('categories', cat, reloadCategories)}
              />
            </div>
            {isOpen && (
              <div className="home-order-items">
                {catItems.length === 0 && <p className="muted" style={{ fontSize: 13, margin: '4px 0 8px' }}>Sin productos.</p>}
                {catItems.map((it, ii) => (
                  <div key={it.id} className={`home-order-row home-order-item${it.home_hidden ? ' hidden-home' : ''}`}>
                    <span className="home-order-text">
                      <b>{it.name}</b>
                      {it.home_hidden && <small>oculto en el inicio</small>}
                    </span>
                    <OrderButtons
                      first={ii === 0}
                      last={ii === catItems.length - 1}
                      hidden={it.home_hidden}
                      disabled={busy}
                      onTop={() => move('menu_items', catItems, ii, 0, reloadItems)}
                      onUp={() => move('menu_items', catItems, ii, ii - 1, reloadItems)}
                      onDown={() => move('menu_items', catItems, ii, ii + 1, reloadItems)}
                      onToggle={() => toggleHidden('menu_items', it, reloadItems)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OrderButtons({ first, last, hidden, disabled, onTop, onUp, onDown, onToggle }) {
  return (
    <div className="home-order-btns">
      <button type="button" onClick={onTop} disabled={disabled || first} aria-label="Poner primero" title="Poner primero">
        <svg viewBox="0 0 24 24"><path d="M6 5h12M12 19V9M7 13l5-5 5 5" /></svg>
      </button>
      <button type="button" onClick={onUp} disabled={disabled || first} aria-label="Subir" title="Subir">
        <svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" /></svg>
      </button>
      <button type="button" onClick={onDown} disabled={disabled || last} aria-label="Bajar" title="Bajar">
        <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <button type="button" className={hidden ? 'off' : ''} onClick={onToggle} disabled={disabled} aria-pressed={!hidden} aria-label={hidden ? 'Mostrar en el inicio' : 'Ocultar del inicio'} title={hidden ? 'Mostrar en el inicio' : 'Ocultar del inicio'}>
        {hidden
          ? <svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3 3.4M6.6 6.6A17 17 0 0 0 3 12s4 6 9 6a9.7 9.7 0 0 0 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
          : <svg viewBox="0 0 24 24"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="3" /></svg>}
      </button>
    </div>
  );
}
