'use client';
import { createContext, useContext, useState, useCallback } from 'react';

const OrdersNotifyContext = createContext(null);

export function OrdersNotifyProvider({ children }) {
  const [unseenCount, setUnseenCount] = useState(0);

  const notifyNewOrder = useCallback(() => setUnseenCount((c) => c + 1), []);
  const markSeen = useCallback(() => setUnseenCount(0), []);

  return (
    <OrdersNotifyContext.Provider value={{ unseenCount, notifyNewOrder, markSeen }}>
      {children}
    </OrdersNotifyContext.Provider>
  );
}

export function useOrdersNotify() {
  const ctx = useContext(OrdersNotifyContext);
  if (!ctx) throw new Error('useOrdersNotify debe usarse dentro de <OrdersNotifyProvider>');
  return ctx;
}
