'use client';
import { motion } from 'framer-motion';
import { useCurrency } from '@/context/CurrencyContext';

// Selector de moneda tipo "slide". Solo aparece si el restaurante acepta otras monedas con tasa de hoy.
export default function CurrencySwitcher({ label = 'Ver precios en', idSuffix = 'main', className = '' }) {
  const { currencies, currency, setCurrencyCode } = useCurrency();
  if (currencies.length < 2) return null;

  return (
    <div className={`currency-switch ${className}`}>
      {label && <span className="currency-switch-label">{label}</span>}
      <div className="currency-switch-track" role="radiogroup" aria-label={label || 'Moneda'}>
        {currencies.map((c) => {
          const active = c.code === currency.code;
          return (
            <button
              key={c.code}
              type="button"
              role="radio"
              aria-checked={active}
              className={active ? 'active' : ''}
              onClick={() => setCurrencyCode(c.code)}
            >
              {active && <motion.span layoutId={`currency-pill-${idSuffix}`} className="currency-switch-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
              <span className="currency-switch-text">{c.symbol}{c.name && !c.base ? ` · ${c.name.split(' ')[0]}` : ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
