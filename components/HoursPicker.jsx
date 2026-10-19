'use client';

// Selector de horario: filas de "de [día] a [día] · abre [hora] · cierra [hora]".
// Guarda el mismo texto que antes se escribía a mano ("Lun – Vie · 8:00 am – 9:00 pm", una línea
// por fila), así la página Visítanos lo sigue mostrando igual y no cambia nada en la base de datos.

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAY_KEYS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];

// Cada media hora, de 12:00 am a 11:30 pm ("HH:MM" en 24 h).
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

const NEW_ROW = { from: 0, to: 4, open: '08:00', close: '21:00', closed: false };

function timeLabel(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

function dayIndex(word) {
  const key = word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().slice(0, 3);
  return DAY_KEYS.indexOf(key);
}

function parseTime(h, m, ampm) {
  let hour = Number(h);
  if (hour < 1 || hour > 12) return null;
  const min = m ? Number(m) : 0;
  if (min > 59) return null;
  const pm = ampm.toLowerCase().startsWith('p');
  if (hour === 12) hour = pm ? 12 : 0;
  else if (pm) hour += 12;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// Convierte el texto guardado en filas. Devuelve null si alguna línea no tiene el formato del selector
// (un horario escrito a mano antes): en ese caso se muestra el texto tal cual para no perderlo.
export function parseHours(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const m = line.match(/^(\S+?)(?:\s*[–-]\s*(\S+?))?\s*·\s*(.+)$/);
    if (!m) return null;
    const from = dayIndex(m[1]);
    const to = m[2] ? dayIndex(m[2]) : from;
    if (from < 0 || to < 0) return null;
    const rest = m[3].trim();
    if (/^cerrado$/i.test(rest)) { rows.push({ from, to, open: NEW_ROW.open, close: NEW_ROW.close, closed: true }); continue; }
    const t = rest.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?\s*[–-]\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i);
    if (!t) return null;
    const open = parseTime(t[1], t[2], t[3]);
    const close = parseTime(t[4], t[5], t[6]);
    if (!open || !close) return null;
    rows.push({ from, to, open, close, closed: false });
  }
  return rows;
}

export function formatHours(rows) {
  return rows.map((r) => {
    const days = r.from === r.to ? DAYS[r.from] : `${DAYS[r.from]} – ${DAYS[r.to]}`;
    return `${days} · ${r.closed ? 'Cerrado' : `${timeLabel(r.open)} – ${timeLabel(r.close)}`}`;
  }).join('\n');
}

// La fila nueva propone los primeros días que todavía no tienen horario (con Lun–Vie puesto, propone
// Sáb–Dom); si la semana ya está completa, propone el domingo.
function nextRow(rows) {
  if (!rows.length) return { ...NEW_ROW };
  const covered = new Set();
  rows.forEach((r) => { for (let d = r.from; d <= r.to; d += 1) covered.add(d); });
  const last = rows[rows.length - 1];
  const from = DAYS.findIndex((_, d) => !covered.has(d));
  if (from < 0) return { ...NEW_ROW, from: 6, to: 6, open: last.open, close: last.close };
  let to = from;
  while (to < 6 && !covered.has(to + 1)) to += 1;
  return { ...NEW_ROW, from, to, open: last.open, close: last.close };
}

export default function HoursPicker({ id, value, onChange }) {
  const rows = parseHours(value);

  if (rows === null) {
    return (
      <div className="hours-picker">
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} />
        <div className="hours-legacy">
          <span>Este horario está escrito a mano. Puedes dejarlo así o pasarlo al selector.</span>
          <button type="button" className="pill-btn-dark" onClick={() => onChange(formatHours([{ ...NEW_ROW }]))}>Usar el selector</button>
        </div>
      </div>
    );
  }

  const update = (i, patch) => onChange(formatHours(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))));
  const remove = (i) => onChange(formatHours(rows.filter((_, j) => j !== i)));
  const add = () => onChange(formatHours([...rows, nextRow(rows)]));

  return (
    <div className="hours-picker" id={id}>
      {rows.map((r, i) => (
        <div className="hours-row" key={i}>
          <div className="hours-days">
            <label>
              <span>De</span>
              <select value={r.from} onChange={(e) => { const from = Number(e.target.value); update(i, { from, to: Math.max(from, r.to) }); }}>
                {DAYS.map((d, k) => <option key={d} value={k}>{d}</option>)}
              </select>
            </label>
            <label>
              <span>a</span>
              <select value={r.to} onChange={(e) => { const to = Number(e.target.value); update(i, { to, from: Math.min(r.from, to) }); }}>
                {DAYS.map((d, k) => <option key={d} value={k}>{d}</option>)}
              </select>
            </label>
            <button type="button" className="hours-remove" onClick={() => remove(i)} aria-label="Quitar este horario">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          {r.closed ? (
            <p className="hours-closed-note">Cerrado esos días.</p>
          ) : (
            <div className="hours-times">
              <label>
                <span>Abre</span>
                <TimeSelect value={r.open} onChange={(open) => update(i, { open })} />
              </label>
              <label>
                <span>Cierra</span>
                <TimeSelect value={r.close} onChange={(close) => update(i, { close })} />
              </label>
            </div>
          )}
          <label className="hours-closed-toggle">
            <input type="checkbox" checked={r.closed} onChange={(e) => update(i, { closed: e.target.checked })} />
            <span>Cerrado</span>
          </label>
        </div>
      ))}
      <button type="button" className="hours-add" onClick={add}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        {rows.length ? 'Agregar otros días' : 'Agregar horario'}
      </button>
      {rows.length > 0 && (
        <div className="hours-preview">
          <span>Así se verá en tu página</span>
          {formatHours(rows).split('\n').map((l, i) => <b key={i}>{l}</b>)}
        </div>
      )}
    </div>
  );
}

function TimeSelect({ value, onChange }) {
  // un horario viejo puede tener minutos fuera de la lista (p. ej. 8:15): se agrega para no cambiarlo sin querer
  const options = TIMES.includes(value) ? TIMES : [...TIMES, value].sort();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}
    </select>
  );
}
