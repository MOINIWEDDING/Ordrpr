'use client';
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const CartContext = createContext(null);
const STORAGE_KEY = 'ej-cart-v1';

function makeLineKey(itemId, selectedOptions) {
  const optKey = (selectedOptions || []).map((o) => `${o.group}:${o.label}`).sort().join('|');
  return `${itemId}::${optKey}`;
}

export function CartProvider({ children }) {
  const [lines, setLines] = useState([]); // [{lineKey, id, name, price, unitPrice, image_url, qty, notes, is_beverage, options}]
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setLines(parsed.lines || []);
        setTableNumber(parsed.tableNumber || '');
        setCustomerName(parsed.customerName || '');
      }
    } catch (e) { /* ignore */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ lines, tableNumber, customerName })); } catch (e) { /* ignore */ }
  }, [lines, tableNumber, customerName, loaded]);

  // selectedOptions: [{group, label, price}] — ya elegidas (leche, sirup, tamaño, etc.)
  const addItem = useCallback((item, qty = 1, selectedOptions = []) => {
    const unitPrice = item.price + selectedOptions.reduce((s, o) => s + (o.price || 0), 0);
    const lineKey = makeLineKey(item.id, selectedOptions);
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.lineKey === lineKey);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [...prev, {
        lineKey, id: item.id, name: item.name, price: unitPrice, image_url: item.image_url,
        qty, notes: '', is_beverage: !!item.is_beverage, options: selectedOptions,
      }];
    });
    setDrawerOpen(true);
  }, []);

  const setQty = useCallback((lineKey, qty) => {
    setLines((prev) => {
      if (qty <= 0) return prev.filter((l) => l.lineKey !== lineKey);
      return prev.map((l) => (l.lineKey === lineKey ? { ...l, qty } : l));
    });
  }, []);

  const setNotes = useCallback((lineKey, notes) => {
    setLines((prev) => prev.map((l) => (l.lineKey === lineKey ? { ...l, notes } : l)));
  }, []);

  const removeItem = useCallback((lineKey) => setLines((prev) => prev.filter((l) => l.lineKey !== lineKey)), []);

  const clear = useCallback(() => {
    setLines([]);
    setTableNumber('');
    // el nombre del cliente se mantiene para la próxima vez, no hace falta pedirlo de nuevo
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const count = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);
  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.qty * l.price, 0), [lines]);

  return (
    <CartContext.Provider value={{
      lines, count, subtotal, addItem, setQty, setNotes, removeItem, clear,
      tableNumber, setTableNumber, customerName, setCustomerName,
      drawerOpen, openDrawer, closeDrawer,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>');
  return ctx;
}
