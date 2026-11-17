'use client';
import { useMemo, useState } from 'react';
import { money } from '@/hooks/useMenuItems';
import { normalizeGroups, initialSelection, toggleChoice, missingRequired, groupHint, describeOptions } from '@/lib/productOptions';

// Carta para el personal: fotos grandes, precio e ingredientes, sin descripciones. Al tocar un
// producto con acompañantes se eligen en una hoja. Devuelve las líneas a quien la usa (onAdd).
export default function ProductPicker({ items, categories, onAdd, showIngredients = true, big = false }) {
  const [cat, setCat] = useState('');
  const [query, setQuery] = useState('');
  const [choosing, setChoosing] = useState(null); // producto con acompañantes

  const cats = useMemo(() => categories.filter((c) => items.some((i) => i.category === c.name)), [categories, items]);
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => (!cat || i.category === cat) && (!q || `${i.name} ${i.ingredients || ''}`.toLowerCase().includes(q)));

  function pick(item) {
    if (item.available === false) return;
    if (normalizeGroups(item.options).length) { setChoosing(item); return; }
    onAdd({ item, options: [] });
  }

  return (
    <div className="picker">
      <div className="picker-tools">
        <input type="search" placeholder="Buscar producto o ingrediente…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="picker-cats">
          <button type="button" className={!cat ? 'active' : ''} onClick={() => setCat('')}>Todo</button>
          {cats.map((c) => <button key={c.id} type="button" className={cat === c.name ? 'active' : ''} onClick={() => setCat(c.name)}>{c.name}</button>)}
        </div>
      </div>
      <div className={`picker-grid${big ? ' is-big' : ''}`}>
        {shown.map((i) => (
          <button key={i.id} type="button" className={`picker-item${i.available === false ? ' is-out' : ''}`} onClick={() => pick(i)} disabled={i.available === false}>
            <span className="picker-photo">
              {i.image_url ? <img src={i.image_url} alt="" loading="lazy" /> : <span className="picker-initial">{i.name.charAt(0)}</span>}
              {i.available === false && <span className="picker-out">Agotado</span>}
            </span>
            <span className="picker-name">{i.name}</span>
            <span className="picker-price">{money(i.price)}</span>
            {showIngredients && i.ingredients && <span className="picker-ingredients">{i.ingredients}</span>}
          </button>
        ))}
        {shown.length === 0 && <p className="empty-note">No hay productos.</p>}
      </div>
      {choosing && <OptionsSheet item={choosing} onClose={() => setChoosing(null)} onDone={(options) => { onAdd({ item: choosing, options }); setChoosing(null); }} />}
    </div>
  );
}

function OptionsSheet({ item, onClose, onDone }) {
  const groups = normalizeGroups(item.options);
  const [selected, setSelected] = useState(() => initialSelection(groups));
  const [missing, setMissing] = useState('');
  const extra = selected.reduce((s, o) => s + (Number(o.price) || 0), 0);

  function done() {
    const need = missingRequired(groups, selected);
    if (need) { setMissing(need); return; }
    const ordered = groups.flatMap((g) => g.choices.filter((c) => selected.some((o) => o.group === g.name && o.label === c.label)).map((c) => ({ group: g.name, ...c })));
    onDone(ordered);
  }

  return (
    <div className="picker-sheet-backdrop" onClick={onClose}>
      <div className="picker-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="picker-sheet-head">
          <b>{item.name}</b>
          <span>{money(Number(item.price) + extra)}</span>
        </div>
        {item.ingredients && <p className="picker-sheet-ing">{item.ingredients}</p>}
        {groups.map((g) => (
          <div key={g.name} className="picker-group">
            <div className="picker-group-head"><b>{g.name}</b><small>{groupHint(g)}</small></div>
            <div className="picker-choices">
              {g.choices.map((c) => {
                const on = selected.some((o) => o.group === g.name && o.label === c.label);
                return (
                  <button key={c.label} type="button" className={on ? 'on' : ''} onClick={() => { setSelected((s) => toggleChoice(groups, s, g.name, c)); setMissing(''); }}>
                    {c.label}{Number(c.price) > 0 && <small>+{money(c.price)}</small>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {missing && <p className="pd-missing">Elige {missing.toLowerCase()}</p>}
        <div className="picker-sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-amber" onClick={done}>Agregar</button>
        </div>
      </div>
    </div>
  );
}

// El pedido que se está armando: líneas por persona, cantidades y notas. `lines` es estado del padre.
export function TicketDraft({ lines, setLines, people, person, setPerson, onSend, sending, sendLabel = 'Enviar a la cocina' }) {
  const [newPerson, setNewPerson] = useState('');
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const setQty = (key, qty) => setLines((ls) => (qty <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, qty } : l))));
  const setNotes = (key, notes) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, notes } : l)));
  const allPeople = [...new Set([...people, ...lines.map((l) => l.person)].filter(Boolean))];

  return (
    <div className="ticket">
      {setPerson && (
        <div className="ticket-people">
          <span>Para:</span>
          {allPeople.map((p) => <button key={p} type="button" className={person === p ? 'on' : ''} onClick={() => setPerson(p)}>{p}</button>)}
          <form onSubmit={(e) => { e.preventDefault(); if (newPerson.trim()) { setPerson(newPerson.trim()); setNewPerson(''); } }}>
            <input type="text" placeholder="+ Persona" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} maxLength={30} />
          </form>
        </div>
      )}
      {lines.length === 0 ? <p className="ticket-empty">Toca productos para agregarlos.</p> : (
        <ul className="ticket-lines">
          {lines.map((l) => (
            <li key={l.key}>
              <div className="ticket-line-top">
                <div className="qty-stepper">
                  <button type="button" onClick={() => setQty(l.key, l.qty - 1)} aria-label="Menos">–</button>
                  <span>{l.qty}</span>
                  <button type="button" onClick={() => setQty(l.key, l.qty + 1)} aria-label="Más">+</button>
                </div>
                <span className="ticket-line-name">
                  {l.name}
                  {l.options.length > 0 && <small>{describeOptions(l.options)}</small>}
                  {setPerson && l.person && <small className="ticket-line-person">{l.person}</small>}
                </span>
                <span className="ticket-line-amt">{money(l.price * l.qty)}</span>
              </div>
              <input type="text" className="ticket-note" placeholder="Nota (ej. sin cebolla)" value={l.notes} onChange={(e) => setNotes(l.key, e.target.value)} />
            </li>
          ))}
        </ul>
      )}
      <div className="ticket-foot">
        <span>Total</span>
        <b>{money(total)}</b>
      </div>
      {onSend && <button type="button" className="btn btn-amber btn-block" onClick={onSend} disabled={!lines.length || sending}>{sending ? 'Enviando…' : sendLabel}</button>}
    </div>
  );
}

// Agrega un producto (con sus acompañantes) a las líneas del pedido en preparación.
export function addLine(lines, { item, options }, person) {
  const extra = options.reduce((s, o) => s + (Number(o.price) || 0), 0);
  const key = `${person || ''}#${item.id}#${options.map((o) => `${o.group}:${o.label}`).join('|')}`;
  const found = lines.find((l) => l.key === key);
  if (found) return lines.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
  return [...lines, { key, id: item.id, name: item.name, price: Number(item.price) + extra, qty: 1, notes: '', options, person: person || '' }];
}

// Las líneas en pedidos, uno por persona, listos para tab_add_order.
export function ordersFromLines(lines, taxPercent, fallbackName) {
  const byPerson = new Map();
  lines.forEach((l) => {
    const who = l.person || fallbackName || '';
    if (!byPerson.has(who)) byPerson.set(who, []);
    byPerson.get(who).push({ id: l.id, name: l.name, price: l.price, qty: l.qty, notes: l.notes || '', options: l.options });
  });
  return [...byPerson.entries()].map(([who, items]) => {
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    return { customer_name: who, items, subtotal, tax_amount: Math.round((subtotal * taxPercent) / 100) };
  });
}
