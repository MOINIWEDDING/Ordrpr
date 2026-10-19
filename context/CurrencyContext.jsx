'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useExchangeRates } from '@/hooks/useExchangeRates';
import { paymentCurrencies, extraCurrencyCodes, convertFromBase, formatIn } from '@/lib/settingsDefaults';

// La moneda en la que el visitante quiere ver los precios (inicio, menú, carrito y pago).
// Se recuerda en el navegador. Los precios siguen guardados en la moneda principal; un producto
// puede tener un precio distinto para otra moneda (menu_items.currency_prices, en moneda principal):
// por ejemplo cuesta RD$300, pero si se paga en dólares se cobra el equivalente de RD$350.
const STORAGE_KEY = 'rp-currency';
const CurrencyContext = createContext(null);

// Precio en moneda principal de un producto (o línea del carrito) para la moneda elegida.
export function basePriceFor(item, currency) {
  if (!item) return 0;
  const special = currency && !currency.base && item.currency_prices ? Number(item.currency_prices[currency.code]) : NaN;
  return special > 0 ? special : Number(item.price) || 0;
}

// Una línea del carrito guarda el precio base del producto y lo que suman sus opciones aparte,
// para poder recalcular con el precio especial de otra moneda.
export function linePriceFor(line, currency) {
  if (line && line.base_price != null) {
    return basePriceFor({ price: line.base_price, currency_prices: line.currency_prices }, currency) + (Number(line.options_total) || 0);
  }
  return Number(line && line.price) || 0;
}

export function CurrencyProvider({ children }) {
  const { settings } = useSettings();
  const { rates } = useExchangeRates(settings.currency_code || 'DOP', extraCurrencyCodes(settings));
  const currencies = useMemo(() => paymentCurrencies(settings, rates), [settings, rates]);
  const [code, setCode] = useState(null);

  useEffect(() => {
    try { setCode(window.localStorage.getItem(STORAGE_KEY)); } catch (e) { /* ignore */ }
  }, []);

  // si la moneda guardada ya no se ofrece (o aún no hay tasa), se muestra la principal
  const currency = currencies.find((c) => c.code === code) || currencies[0];

  const setCurrencyCode = useCallback((next) => {
    setCode(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* ignore */ }
  }, []);

  const value = useMemo(() => ({
    currencies,
    currency,
    setCurrencyCode,
    // monto en moneda principal → texto en la moneda elegida
    format: (baseAmount, cur = currency) => formatIn(convertFromBase(baseAmount, cur), cur),
    // precio de un producto, ya con su precio especial si lo tiene, en la moneda elegida
    formatItem: (item, cur = currency) => formatIn(convertFromBase(basePriceFor(item, cur), cur), cur),
  }), [currencies, currency, setCurrencyCode]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
