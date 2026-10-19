'use client';
import { useRef, useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useCategories } from '@/hooks/useCategories';
import { useMenuItems, money } from '@/hooks/useMenuItems';
import { parseCsv } from '@/lib/csv';
import { CURRENCIES } from '@/lib/currencies';

// Importa productos (y crea sus categorías) desde un CSV con el formato de /plantilla-productos.csv.
// Un producto con el mismo nombre en la misma categoría se actualiza; si no existe, se crea.
// Las columnas que no vienen en el archivo no se tocan (por ejemplo, la foto).

const ICONS = { fuego: 'flame', carne: 'meat', costillas: 'ribs', salchicha: 'sausage', ahumado: 'smoker', bebida: 'drink', acompanante: 'side', salsa: 'sauce', postre: 'dessert', estrella: 'star' };
const COLORS = { crema: 'manana', beige: 'manana', verde: 'salado', terracota: 'tarde', naranja: 'tarde', lila: 'experiencia', morado: 'experiencia' };
const TRUE = new Set(['si', 'sí', 'yes', 'true', '1', 'x']);
const CURRENCY_CODES = new Set(CURRENCIES.map((c) => c.code));

const bool = (v, fallback) => (v === undefined || v === '' ? fallback : TRUE.has(String(v).trim().toLowerCase()));
const num = (v) => {
  if (v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
const plain = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function analyze(text) {
  const { headers, records } = parseCsv(text);
  const has = (h) => headers.includes(h);
  const errors = [];
  if (!has('categoria') || !has('nombre') || !has('precio')) {
    return { errors: ['El archivo necesita al menos las columnas categoria, nombre y precio. Usa la plantilla como guía.'], products: [], headers };
  }
  const currencyCols = headers.filter((h) => /^precio_[a-z]{3}$/.test(h) && CURRENCY_CODES.has(h.slice(7).toUpperCase()));
  const products = [];
  const seen = new Set();
  records.forEach((r) => {
    const name = r.nombre;
    const category = r.categoria;
    const price = num(r.precio);
    if (!name || !category) { errors.push(`Línea ${r._line}: falta el nombre o la categoría.`); return; }
    if (price === null || Number.isNaN(price) || price < 0) { errors.push(`Línea ${r._line}: el precio de "${name}" no es un número.`); return; }
    const key = `${plain(category)}|${plain(name)}`;
    if (seen.has(key)) { errors.push(`Línea ${r._line}: "${name}" está repetido en ${category}; se usa la primera.`); return; }
    seen.add(key);
    const row = { name, category, price };
    if (has('costo')) { const c = num(r.costo); row.cost = c > 0 ? c : 0; }
    if (has('descripcion')) row.description = r.descripcion;
    if (has('etiquetas')) row.tags = r.etiquetas.split(/[,;]/).map((t) => t.trim()).filter(Boolean).join(', ');
    if (has('bebida')) row.is_beverage = bool(r.bebida, false);
    if (has('destacado')) row.featured = bool(r.destacado, false);
    if (has('mostrar_en_inicio')) row.home_hidden = !bool(r.mostrar_en_inicio, true);
    if (currencyCols.length) {
      row.currency_prices = {};
      currencyCols.forEach((h) => { const n = num(r[h]); if (n > 0) row.currency_prices[h.slice(7).toUpperCase()] = n; });
    }
    products.push({ row, categoryIcon: ICONS[plain(r.categoria_icono)] || null, categoryTint: COLORS[plain(r.categoria_color)] || null, line: r._line });
  });
  return { errors, products, headers };
}

export default function CsvImporter() {
  const { categories, reload: reloadCategories } = useCategories();
  const { items, reload: reloadItems } = useMenuItems();
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null); // { errors, products }
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');

  function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setDone('');
    setError('');
    const reader = new FileReader();
    reader.onload = () => setResult(analyze(String(reader.result || '')));
    reader.onerror = () => setError('No se pudo leer el archivo.');
    reader.readAsText(file, 'utf-8');
  }

  const existingKey = new Set(items.map((i) => `${plain(i.category)}|${plain(i.name)}`));
  const catByPlain = new Map(categories.map((c) => [plain(c.name), c]));
  const products = result ? result.products : [];
  const updates = products.filter((p) => existingKey.has(`${plain(p.row.category)}|${plain(p.row.name)}`)).length;
  const newCategories = [...new Map(products.filter((p) => !catByPlain.has(plain(p.row.category))).map((p) => [plain(p.row.category), p])).values()];

  async function runImport() {
    if (!BARRO_CONFIGURED || !products.length) return;
    setBusy(true);
    setError('');
    // 1) categorías nuevas, al final del orden actual
    let order = categories.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
    if (newCategories.length) {
      const { error: catErr } = await sb.from('categories').insert(newCategories.map((p) => ({
        name: p.row.category, icon: p.categoryIcon || 'smoker', tint: p.categoryTint || 'manana', sort_order: (order += 1),
      })));
      if (catErr) { setError(`No se pudieron crear las categorías: ${catErr.message}`); setBusy(false); return; }
    }
    // 2) productos: se usa el nombre de categoría tal como ya existe (para no duplicar por mayúsculas o acentos)
    let rows = products.map((p) => {
      const existing = catByPlain.get(plain(p.row.category));
      const existingItem = items.find((i) => plain(i.category) === plain(p.row.category) && plain(i.name) === plain(p.row.name));
      return { ...p.row, category: existing ? existing.name : p.row.category, name: existingItem ? existingItem.name : p.row.name };
    });
    let { error: upErr } = await sb.from('menu_items').upsert(rows, { onConflict: 'name,category' });
    // si la base de datos aún no tiene alguna columna nueva (falta su migración), se importa lo demás
    for (const col of ['currency_prices', 'home_hidden']) {
      if (upErr && new RegExp(col, 'i').test(upErr.message || '')) {
        rows = rows.map((r) => { const copy = { ...r }; delete copy[col]; return copy; });
        ({ error: upErr } = await sb.from('menu_items').upsert(rows, { onConflict: 'name,category' }));
      }
    }
    setBusy(false);
    if (upErr) { setError(`No se pudieron importar los productos: ${upErr.message}`); return; }
    await Promise.all([reloadCategories(), reloadItems()]);
    setDone(`Listo: ${rows.length - updates} producto${rows.length - updates === 1 ? '' : 's'} nuevo${rows.length - updates === 1 ? '' : 's'}, ${updates} actualizado${updates === 1 ? '' : 's'}${newCategories.length ? ` y ${newCategories.length} categoría${newCategories.length === 1 ? '' : 's'} nueva${newCategories.length === 1 ? '' : 's'}` : ''}.`);
    setResult(null);
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="csv-import">
      <div className="csv-actions">
        <a className="pill-btn-dark csv-template" href="/plantilla-productos.csv" download>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
          Descargar plantilla
        </a>
        <button type="button" className="hours-add" onClick={() => inputRef.current && inputRef.current.click()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V9M7 14l5-5 5 5M5 4h14" /></svg>
          {fileName ? 'Elegir otro archivo' : 'Subir CSV'}
        </button>
        <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
      </div>

      {error && <div className="form-msg show error">{error}</div>}
      {done && <div className="form-msg show ok">{done}</div>}

      {result && (
        <div className="csv-preview">
          <p className="csv-file">{fileName}</p>
          <div className="csv-stats">
            <div><b>{products.length - updates}</b><span>nuevos</span></div>
            <div><b>{updates}</b><span>se actualizan</span></div>
            <div><b>{newCategories.length}</b><span>categorías nuevas</span></div>
          </div>
          {result.errors.length > 0 && (
            <ul className="csv-errors">
              {result.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
              {result.errors.length > 8 && <li>Y {result.errors.length - 8} más.</li>}
            </ul>
          )}
          {products.length > 0 && (
            <ul className="csv-rows">
              {products.slice(0, 6).map((p) => (
                <li key={p.line}>
                  <span><b>{p.row.name}</b><small>{p.row.category}</small></span>
                  <span>{money(p.row.price)}</span>
                </li>
              ))}
              {products.length > 6 && <li className="csv-more">Y {products.length - 6} más</li>}
            </ul>
          )}
          <button type="button" className="btn btn-amber btn-block" onClick={runImport} disabled={busy || !products.length}>
            {busy ? 'Importando…' : `Importar ${products.length} producto${products.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  );
}
