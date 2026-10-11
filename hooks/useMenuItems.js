'use client';
import { useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

export function demoMenu() {
  return [
    { id: 'd1', name: 'Producto de ejemplo 1', category: 'Entradas', price: 250, featured: false, is_beverage: false, tags: '', description: 'Así se verá un producto de tu menú.', image_url: '' },
    { id: 'd2', name: 'Producto de ejemplo 2', category: 'Entradas', price: 320, featured: false, is_beverage: false, tags: '', description: 'Así se verá un producto de tu menú.', image_url: '' },
    { id: 'd3', name: 'Plato de ejemplo 1', category: 'Platos fuertes', price: 480, featured: true, is_beverage: false, tags: '', description: 'Así se verá un producto de tu menú.', image_url: '' },
    { id: 'd4', name: 'Plato de ejemplo 2', category: 'Platos fuertes', price: 560, featured: false, is_beverage: false, tags: '', description: 'Así se verá un producto de tu menú.', image_url: '' },
    { id: 'd5', name: 'Postre de ejemplo', category: 'Postres', price: 220, featured: false, is_beverage: false, tags: '', description: 'Así se verá un producto de tu menú.', image_url: '' },
    { id: 'd6', name: 'Bebida de ejemplo 1', category: 'Bebidas', price: 120, featured: false, is_beverage: true, tags: '', description: 'Así se verá un producto de tu menú.', image_url: '' },
    { id: 'd7', name: 'Bebida de ejemplo 2', category: 'Bebidas', price: 150, featured: false, is_beverage: true, tags: '', description: 'Así se verá un producto de tu menú.', image_url: '' },
  ];
}

export { formatMoney as money } from '@/lib/settingsDefaults';

export function useMenuItems() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    if (!BARRO_CONFIGURED) { setItems(demoMenu()); setLoading(false); return; }
    const { data, error } = await sb.from('menu_items').select('*').order('created_at', { ascending: true });
    if (error) { setItems(demoMenu()); setLoading(false); return; }
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { items, loading, reload: load };
}
