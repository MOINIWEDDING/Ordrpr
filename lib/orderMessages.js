// Avisos que ve el cliente cuando el local cambia el estado de su pedido.
// El dueño los personaliza desde Cuenta → "Avisos de pedidos" (se guardan en site_settings.order_messages).

export const ORDER_MESSAGE_STEPS = [
  { status: 'en_preparacion', label: 'En preparación', hint: 'Cuando empiezan a prepararlo.' },
  { status: 'lista', label: 'Lista', hint: 'Cuando está listo para llevarse a la mesa o recogerse.' },
  { status: 'entregada', label: 'Entregada', hint: 'Cuando ya se entregó.' },
];

export const DEFAULT_ORDER_MESSAGES = {
  sound: true,
  en_preparacion: { on: true, text: 'Tu pedido de {mesa} está en preparación.' },
  lista: { on: true, text: 'Tu pedido de {mesa} ya está listo.' },
  entregada: { on: true, text: 'Tu pedido de {mesa} fue entregado. ¡Buen provecho!' },
};

export const ORDER_MESSAGE_MAX = 140;
export const ORDER_PLACEHOLDERS = [
  { tag: '{nombre}', help: 'el nombre del cliente' },
  { tag: '{mesa}', help: 'la mesa o "Pick up"' },
  { tag: '{marca}', help: 'el nombre de tu restaurante' },
];

// Mezcla lo guardado por el dueño con los valores de fábrica.
export function mergeOrderMessages(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const out = { sound: s.sound === false ? false : true };
  ORDER_MESSAGE_STEPS.forEach(({ status }) => {
    const d = DEFAULT_ORDER_MESSAGES[status];
    const v = s[status] && typeof s[status] === 'object' ? s[status] : {};
    out[status] = {
      on: v.on === false ? false : true,
      text: typeof v.text === 'string' && v.text.trim() ? v.text : d.text,
    };
  });
  return out;
}

// Sustituye {nombre}, {mesa} y {marca} y limpia espacios/comas sobrantes si falta el nombre.
export function fillOrderMessage(text, { name = '', table = '', brand = '' } = {}) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  let out = String(text || '')
    .replace(/\{nombre\}/gi, first)
    .replace(/\{mesa\}/gi, table || 'tu mesa')
    .replace(/\{marca\}/gi, brand || '');
  out = out.replace(/\s+([,.;:!?])/g, '$1').replace(/^[\s,;:.]+/, '').replace(/\s{2,}/g, ' ').trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// Devuelve { text, sound } o null si el dueño apagó el aviso de ese estado.
export function orderNotice(saved, status, order, brand) {
  const m = mergeOrderMessages(saved);
  const step = m[status];
  if (!step || !step.on) return null;
  return {
    text: fillOrderMessage(step.text, { name: order.customer_name, table: order.table_number, brand }),
    sound: m.sound,
  };
}
