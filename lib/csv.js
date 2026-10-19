// Lector de CSV sencillo: comillas, comas o punto y coma (Excel en español usa ";") y saltos de
// línea dentro de comillas. Devuelve filas como objetos con los encabezados normalizados.

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  return (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
}

export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, ''); // quita el BOM que agrega Excel
  const delim = detectDelimiter(src);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  if (!rows.length) return { headers: [], records: [] };

  // "Categoría", "categoria", "CATEGORIA " → "categoria"; "precio USD" → "precio_usd"
  const headers = rows[0].map((h) => h.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, '_'));
  const records = rows.slice(1).map((r, idx) => {
    const obj = { _line: idx + 2 };
    headers.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
    return obj;
  });
  return { headers, records };
}

export function toCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}
