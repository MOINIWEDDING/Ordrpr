'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import { useMenuItems } from '@/hooks/useMenuItems';
import { useCategories } from '@/hooks/useCategories';
import ProductCard from './ProductCard';
import ProductModal from './ProductModal';
import ProductIcon from './ProductIcon';
import CategoryModal from './CategoryModal';
import Reveal from './Reveal';

export default function CategoryCarousels({ limit = null, showAddCategory = true }) {
  const { isStaff } = useAuth();
  const { categories, reload: reloadCategories } = useCategories();
  const { items, reload: reloadItems } = useMenuItems();

  const [editingItem, setEditingItem] = useState(null); // {item, defaultCategory} | null
  const [editingCategory, setEditingCategory] = useState(null); // category | 'new' | null

  const categoriesWithItems = limit
    ? categories.filter((c) => items.some((i) => i.category === c.name))
    : categories;

  async function reload() { await Promise.all([reloadItems(), reloadCategories()]); }

  return (
    <>
      {categoriesWithItems.map((cat) => (
        <CategorySection
          key={cat.id}
          category={cat}
          items={items.filter((i) => i.category === cat.name).slice(0, limit || undefined)}
          allCount={items.filter((i) => i.category === cat.name).length}
          limited={!!limit}
          onAddProduct={() => setEditingItem({ item: null, defaultCategory: cat.name })}
          onEditProduct={(item) => setEditingItem({ item, defaultCategory: cat.name })}
          onEditCategory={() => setEditingCategory(cat)}
          onDeletedItem={reload}
        />
      ))}

      {isStaff && showAddCategory && (
        <Reveal className="carousel-section">
          <button type="button" className="add-category-btn" onClick={() => setEditingCategory('new')}>
            <span className="plus"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></span>
            Agregar categoría nueva (ej. Populares)
          </button>
        </Reveal>
      )}

      <AnimatePresence>
        {editingItem && (
          <ProductModal
            item={editingItem.item}
            defaultCategory={editingItem.defaultCategory}
            categories={categories}
            onClose={() => setEditingItem(null)}
            onSaved={reload}
          />
        )}
        {editingCategory && (
          <CategoryModal
            category={editingCategory === 'new' ? null : editingCategory}
            onClose={() => setEditingCategory(null)}
            onSaved={reloadCategories}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function CategorySection({ category, items, allCount, limited, onAddProduct, onEditProduct, onEditCategory, onDeletedItem }) {
  const { isStaff } = useAuth();
  const trackRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  function update() {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft >= max - 4 || max <= 4);
  }
  useEffect(() => { update(); }, [items.length]); // eslint-disable-line

  function scrollBy(dir) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -el.clientWidth * 0.8 : el.clientWidth * 0.8, behavior: 'smooth' });
  }

  async function handleDelete(item) {
    if (BARRO_CONFIGURED) {
      const { error } = await sb.from('menu_items').delete().eq('id', item.id);
      if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    }
    await onDeletedItem();
  }

  const isEmpty = items.length === 0;

  return (
    <Reveal className="carousel-section">
      <div className="carousel-head">
        <h3>
          <span className="cat-head-icon" style={{ background: `var(--tint-${category.tint})` }}>
            <ProductIcon name={category.icon} />
          </span>
          {category.name}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {limited && allCount > items.length && (
            <Link href={`/menu?cat=${encodeURIComponent(category.name)}`} className="see-all">Ver todo</Link>
          )}
          {isStaff && !limited && (
            <button type="button" className="icon-btn" aria-label="Editar categoría" onClick={onEditCategory}>
              <svg className="icon" style={{ width: 14, height: 14 }} viewBox="0 0 24 24"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
            </button>
          )}
        </div>
      </div>

      {isEmpty && !isStaff ? null : (
        <div className="carousel-wrap">
          {!isEmpty && (
            <button type="button" className="carousel-arrow left" disabled={atStart} aria-label="Anterior" onClick={() => scrollBy('left')}>
              <svg className="icon" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
          )}
          <div className="carousel-track" ref={trackRef} onScroll={update}>
            {items.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                tint={category.tint}
                onEdit={isStaff ? onEditProduct : undefined}
                onDelete={isStaff ? handleDelete : undefined}
                showDivider={false}
              />
            ))}
            {isStaff && !limited && (
              <button type="button" className="add-card" onClick={onAddProduct}>
                <div className="plus"><svg className="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></div>
                <span>Agregar producto</span>
              </button>
            )}
          </div>
          {!isEmpty && (
            <button type="button" className="carousel-arrow right" disabled={atEnd} aria-label="Siguiente" onClick={() => scrollBy('right')}>
              <svg className="icon" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
        </div>
      )}
    </Reveal>
  );
}
