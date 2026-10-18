// Pedidos de invitado: sin cuenta no hay "mis pedidos", así que el navegador recuerda los
// identificadores (UUID al azar, imposibles de adivinar) de los pedidos que hizo y los consulta
// con la función guest_orders mientras no estén entregados.
const KEY = 'rp-guest-orders';
const MAX_IDS = 20;

export function newOrderId() {
  try {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  } catch (e) { /* ignore */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getGuestOrderIds() {
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, MAX_IDS) : [];
  } catch (e) { return []; }
}

function save(list) {
  try { window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_IDS))); } catch (e) { /* ignore */ }
}

export function rememberGuestOrder(id) {
  save([id, ...getGuestOrderIds().filter((x) => x !== id)]);
}

// Deja solo los identificadores que siguen activos (los entregados o vencidos se olvidan).
export function keepGuestOrders(activeIds) {
  const keep = new Set(activeIds);
  save(getGuestOrderIds().filter((x) => keep.has(x)));
}

// Identificador del aparato para las notificaciones de un invitado (OneSignal lo usa como "external id").
// Se guarda en el pedido (push_ref) para saber a qué aparato avisar.
const REF_KEY = 'rp-push-ref';
export function getGuestPushRef() {
  try {
    let ref = window.localStorage.getItem(REF_KEY);
    if (!ref || !/^guest_[0-9a-f-]{36}$/.test(ref)) {
      ref = `guest_${newOrderId()}`;
      window.localStorage.setItem(REF_KEY, ref);
    }
    return ref;
  } catch (e) { return null; }
}
