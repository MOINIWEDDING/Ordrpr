'use client';
import { createContext, useContext, useState, useCallback } from 'react';

const GuestInfoContext = createContext(null);

export function GuestInfoProvider({ children }) {
  const [gender, setGenderState] = useState(null);
  const [age, setAgeState] = useState(null);

  const setGender = useCallback((g) => setGenderState(g), []);
  const setAge = useCallback((a) => setAgeState(a), []);

  return (
    <GuestInfoContext.Provider value={{ gender, age, setGender, setAge }}>
      {children}
    </GuestInfoContext.Provider>
  );
}

export function useGuestInfo() {
  const ctx = useContext(GuestInfoContext);
  if (!ctx) throw new Error('useGuestInfo debe usarse dentro de <GuestInfoProvider>');
  return ctx;
}
