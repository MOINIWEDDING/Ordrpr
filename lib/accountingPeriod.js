import { addDays, addMonths, capitalize, dayKey, periodRange, startOfDay } from '@/lib/stats';

// Periodos de contabilidad: día, semana (lunes a domingo), mes, año o un rango libre.
export const ACC_PERIODS = [
  { id: 'dia', label: 'Día' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'ano', label: 'Año' },
  { id: 'rango', label: 'Rango' },
];

export function accRange(period, anchor, from, to) {
  if (period === 'ano') {
    const y = startOfDay(anchor).getFullYear();
    return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
  }
  if (period === 'rango') {
    const a = from <= to ? from : to;
    const b = from <= to ? to : from;
    return { start: startOfDay(a), end: addDays(startOfDay(b), 1) };
  }
  const r = periodRange(period, anchor);
  return { start: r.start, end: r.end };
}

export function shiftAnchor(period, anchor, dir) {
  const d = startOfDay(anchor);
  if (period === 'dia') return dayKey(addDays(d, dir));
  if (period === 'semana') return dayKey(addDays(d, 7 * dir));
  if (period === 'mes') return dayKey(addMonths(d, dir));
  if (period === 'ano') return dayKey(new Date(d.getFullYear() + dir, 0, 1));
  return anchor;
}

const sd = (d) => d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
export function accTitle(period, range) {
  const last = addDays(range.end, -1);
  if (period === 'dia') return capitalize(range.start.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  if (period === 'mes') return capitalize(range.start.toLocaleDateString('es', { month: 'long', year: 'numeric' }));
  if (period === 'ano') return `Año ${range.start.getFullYear()}`;
  if (dayKey(range.start) === dayKey(last)) return capitalize(range.start.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }));
  return `${sd(range.start)} – ${sd(last)} ${last.getFullYear()}`;
}
