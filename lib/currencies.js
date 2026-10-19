// Monedas que el dueño puede elegir: código ISO, nombre y símbolo con que se muestran.
export const CURRENCIES = [
  { code: 'DOP', name: 'Peso dominicano', symbol: 'RD$' },
  { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'CAD', name: 'Dólar canadiense', symbol: 'CA$' },
  { code: 'GBP', name: 'Libra esterlina', symbol: '£' },
  { code: 'CHF', name: 'Franco suizo', symbol: 'CHF' },
  { code: 'MXN', name: 'Peso mexicano', symbol: 'MX$' },
  { code: 'COP', name: 'Peso colombiano', symbol: 'COL$' },
  { code: 'PEN', name: 'Sol peruano', symbol: 'S/' },
  { code: 'CLP', name: 'Peso chileno', symbol: 'CLP$' },
  { code: 'ARS', name: 'Peso argentino', symbol: 'AR$' },
  { code: 'BRL', name: 'Real brasileño', symbol: 'R$' },
  { code: 'HTG', name: 'Gourde haitiano', symbol: 'G' },
  { code: 'JPY', name: 'Yen japonés', symbol: '¥' },
  { code: 'CNY', name: 'Yuan chino', symbol: 'CN¥' },
];

export function currencyInfo(code) {
  return CURRENCIES.find((c) => c.code === code) || null;
}
