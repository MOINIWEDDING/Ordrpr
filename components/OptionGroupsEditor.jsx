'use client';

// Editor de acompañantes y extras de un producto (ver lib/productOptions.js).
// value: [{ name, type, required, max, choices: [{ label, price }] }] con los precios como texto
// mientras se escriben; el editor de productos los limpia al guardar.

const PRESETS = [
  { name: 'Guarnición', type: 'single', required: true, choices: ['Arroz blanco', 'Tostones', 'Ensalada'] },
  { name: 'Salsas', type: 'multiple', required: false, choices: ['Ajo', 'Picante', 'Rosada'] },
  { name: 'Término', type: 'single', required: true, choices: ['Medio', 'Tres cuartos', 'Bien cocido'] },
  { name: 'Tamaño', type: 'single', required: true, choices: ['Regular', 'Grande'] },
  { name: 'Extras', type: 'multiple', required: false, choices: ['Queso', 'Aguacate'] },
];

export default function OptionGroupsEditor({ value, onChange, symbol }) {
  const groups = value;
  const setGroup = (i, patch) => onChange(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const setChoice = (i, k, patch) => setGroup(i, { choices: groups[i].choices.map((c, j) => (j === k ? { ...c, ...patch } : c)) });
  const usedNames = new Set(groups.map((g) => g.name.trim().toLowerCase()));

  function addGroup(preset) {
    const base = preset
      ? { name: preset.name, type: preset.type, required: preset.required, max: 0, choices: preset.choices.map((label) => ({ label, price: '' })) }
      : { name: '', type: 'single', required: true, max: 0, choices: [{ label: '', price: '' }] };
    onChange([...groups, base]);
  }

  return (
    <div className="og">
      {groups.map((g, i) => (
        <div className="og-group" key={i}>
          <div className="og-group-top">
            <input
              className="og-name"
              type="text"
              value={g.name}
              onChange={(e) => setGroup(i, { name: e.target.value })}
              placeholder="Nombre del grupo (ej. Guarnición)"
              aria-label="Nombre del grupo"
            />
            <button type="button" className="hours-remove" onClick={() => onChange(groups.filter((_, j) => j !== i))} aria-label="Quitar grupo">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>

          <div className="og-rules">
            <div className="seg-buttons seg-buttons-sm" role="group" aria-label="Cuántas puede elegir">
              <button type="button" className={g.type === 'single' ? 'active' : ''} aria-pressed={g.type === 'single'} onClick={() => setGroup(i, { type: 'single' })}>Elige uno</button>
              <button type="button" className={g.type === 'multiple' ? 'active' : ''} aria-pressed={g.type === 'multiple'} onClick={() => setGroup(i, { type: 'multiple' })}>Varios</button>
            </div>
            <label className="og-check">
              <input type="checkbox" checked={!!g.required} onChange={(e) => setGroup(i, { required: e.target.checked })} />
              Obligatorio
            </label>
            {g.type === 'multiple' && (
              <label className="og-max">
                Máximo
                <select value={g.max || 0} onChange={(e) => setGroup(i, { max: Number(e.target.value) })}>
                  <option value={0}>Sin límite</option>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="og-choices">
            {g.choices.map((c, k) => (
              <div className="og-choice" key={k}>
                <input
                  type="text"
                  value={c.label}
                  onChange={(e) => setChoice(i, k, { label: e.target.value })}
                  placeholder="Opción"
                  aria-label="Nombre de la opción"
                />
                <div className="pe-money og-price">
                  <span>+{symbol}</span>
                  <input
                    type="number" min="0" step="1" inputMode="numeric"
                    value={c.price}
                    onChange={(e) => setChoice(i, k, { price: e.target.value })}
                    placeholder="0"
                    aria-label={`Precio extra de ${c.label || 'la opción'}`}
                  />
                </div>
                <button type="button" className="og-choice-remove" onClick={() => setGroup(i, { choices: g.choices.filter((_, j) => j !== k) })} disabled={g.choices.length === 1} aria-label="Quitar opción">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            ))}
            <button type="button" className="og-add-choice" onClick={() => setGroup(i, { choices: [...g.choices, { label: '', price: '' }] })}>+ Agregar opción</button>
          </div>
        </div>
      ))}

      <div className="og-presets">
        {PRESETS.filter((p) => !usedNames.has(p.name.toLowerCase())).map((p) => (
          <button key={p.name} type="button" className="pe-link-chip" onClick={() => addGroup(p)}>+ {p.name}</button>
        ))}
        <button type="button" className="hours-add" onClick={() => addGroup(null)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Grupo nuevo
        </button>
      </div>
    </div>
  );
}
