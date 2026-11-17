'use client';
import { useEffect, useRef } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

// Lo que comparten la caja, los camareros, la cocina y la cuenta del cliente.

export const PAY_METHODS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'gift_card', label: 'Gift card' },
];
export const PAY_LABEL = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', gift_card: 'Gift card',
  cuenta: 'Cuenta abierta', mixto: 'Mixto', en_linea: 'En línea',
};

// Estado de cada pedido como lo ve el cliente y el camarero.
export const ORDER_STATUS = {
  nueva: { label: 'Recibido', tone: 'new' },
  en_preparacion: { label: 'Preparando', tone: 'cooking' },
  lista: { label: 'Listo', tone: 'ready' },
  entregada: { label: 'Servido', tone: 'done' },
};

// Dónde se prepara un producto: el que dijo el dueño en el producto o, si no, el de su categoría.
export function stationOf(line, menuById, catByName) {
  const m = menuById[line.id];
  if (m && m.station) return m.station;
  const c = m && catByName[m.category];
  return (c && c.station) || 'cocina';
}

export const lineTotal = (l) => (Number(l.price) || 0) * (Number(l.qty) || 0);

// Totales de una cuenta abierta: consumo, descuento, impuestos de la sucursal, propina.
export function tabTotals(orders, charges, { discount = 0, tip = 0 } = {}) {
  const gross = (orders || []).reduce((s, o) => s + Number(o.subtotal || 0), 0);
  const net = Math.max(0, gross - Math.max(0, Number(discount) || 0));
  const taxLines = (charges || []).map((c) => ({ label: c.label, percent: Number(c.percent) || 0, amount: Math.round((net * (Number(c.percent) || 0)) / 100) }));
  const tax = taxLines.reduce((s, l) => s + l.amount, 0);
  const tipNum = Math.max(0, Number(tip) || 0);
  return { gross, discount: gross - net, net, taxLines, tax, tip: tipNum, total: net + tax + tipNum };
}

// Las líneas de varios pedidos juntas (mismo producto, mismas opciones y misma persona se suman).
export function groupLines(orders, { byPerson = false } = {}) {
  const map = new Map();
  (orders || []).forEach((o) => (o.items || []).forEach((it) => {
    const opts = (it.options || []).map((x) => `${x.group}:${x.label}`).join('|');
    const key = `${byPerson ? o.customer_name : ''}#${it.id || it.name}#${opts}#${it.price}`;
    const prev = map.get(key);
    if (prev) prev.qty += Number(it.qty) || 0;
    else map.set(key, { ...it, qty: Number(it.qty) || 0, person: o.customer_name });
  }));
  return [...map.values()];
}

export const minutesSince = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000));

// Vuelve a cargar cuando cambian esas tablas (tiempo real de Supabase) y, por si se cae, cada `every` ms.
export function useLiveReload(tables, reload, every = 15000) {
  const ref = useRef(reload);
  ref.current = reload;
  const key = tables.join(',');
  useEffect(() => {
    if (!BARRO_CONFIGURED) return undefined;
    let channel = sb.channel(`live-${key}-${Math.random().toString(36).slice(2, 8)}`);
    key.split(',').forEach((t) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => ref.current());
    });
    channel.subscribe();
    const timer = setInterval(() => ref.current(), every);
    return () => { clearInterval(timer); sb.removeChannel(channel); };
  }, [key, every]);
}

// Un sonido corto (aviso de pedido nuevo o plato listo) sin archivos.
export function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.18].forEach((at) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.17);
    });
  } catch (e) { /* sin audio */ }
}
