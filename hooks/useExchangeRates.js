'use client';
import { useEffect, useState } from 'react';

// Tasas de hoy para las otras monedas del restaurante, desde /api/tasas.
// Se pide una vez por combinación de monedas y se comparte entre los componentes que la usen.
const cache = new Map();

export function useExchangeRates(base, codes) {
  const key = `${base}|${[...codes].sort().join(',')}`;
  const [state, setState] = useState(() => cache.get(key)?.value || { rates: {}, loading: codes.length > 0 });

  useEffect(() => {
    if (!codes.length) { setState({ rates: {}, loading: false }); return undefined; }
    let active = true;
    let entry = cache.get(key);
    if (!entry) {
      const promise = fetch(`/api/tasas?base=${encodeURIComponent(base)}&codes=${encodeURIComponent(codes.join(','))}`)
        .then((r) => (r.ok ? r.json() : { rates: {} }))
        .catch(() => ({ rates: {} }))
        .then((data) => { const value = { rates: data.rates || {}, loading: false }; cache.set(key, { promise, value }); return value; });
      entry = { promise };
      cache.set(key, entry);
    }
    entry.promise.then((value) => { if (active) setState(value); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
