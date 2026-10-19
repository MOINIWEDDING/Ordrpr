// Acompañantes y extras de un producto (menu_items.options):
// [{ name: 'Guarnición', type: 'single' | 'multiple', required: true, max: 0, choices: [{ label: 'Arroz', price: 0 }] }]
// - single: el cliente elige una opción (si es obligatorio, la primera viene marcada).
// - multiple: puede elegir varias, hasta "max" (0 = sin límite); si es obligatorio, al menos una.
// Los grupos guardados antes de existir type/required se leen como "elige uno, obligatorio".

export function normalizeGroups(options) {
  return (Array.isArray(options) ? options : [])
    .filter((g) => g && g.name && Array.isArray(g.choices) && g.choices.length)
    .map((g) => ({
      name: String(g.name),
      type: g.type === 'multiple' ? 'multiple' : 'single',
      required: g.required === undefined ? true : !!g.required,
      max: Math.max(0, Number(g.max) || 0),
      choices: g.choices.filter((c) => c && c.label).map((c) => ({ label: String(c.label), price: Math.max(0, Number(c.price) || 0) })),
    }))
    .filter((g) => g.choices.length);
}

// Selección inicial: la primera opción de cada grupo "elige uno" obligatorio.
export function initialSelection(groups) {
  return groups.filter((g) => g.type === 'single' && g.required).map((g) => ({ group: g.name, ...g.choices[0] }));
}

// Marca o desmarca una opción respetando las reglas del grupo.
export function toggleChoice(groups, selected, groupName, choice) {
  const group = groups.find((g) => g.name === groupName);
  if (!group) return selected;
  const inGroup = selected.filter((o) => o.group === groupName);
  const others = selected.filter((o) => o.group !== groupName);
  const isOn = inGroup.some((o) => o.label === choice.label);
  if (group.type === 'single') {
    if (isOn) return group.required ? selected : others; // en un grupo opcional se puede quitar
    return [...others, { group: groupName, ...choice }];
  }
  if (isOn) return [...others, ...inGroup.filter((o) => o.label !== choice.label)];
  if (group.max && inGroup.length >= group.max) return selected;
  return [...others, ...inGroup, { group: groupName, ...choice }];
}

// Devuelve el nombre del primer grupo obligatorio sin elegir (o '' si está todo bien).
export function missingRequired(groups, selected) {
  const g = groups.find((x) => x.required && !selected.some((o) => o.group === x.name));
  return g ? g.name : '';
}

export function groupHint(group) {
  if (group.type === 'single') return group.required ? 'Elige uno' : 'Opcional';
  const limit = group.max ? `hasta ${group.max}` : 'los que quieras';
  return group.required ? `Elige ${limit}` : `Opcional · ${limit}`;
}

// Para mostrar lo elegido en el carrito y en las órdenes: "Guarnición: Arroz · Salsas: Ajo, Picante".
export function describeOptions(options) {
  const byGroup = new Map();
  (options || []).forEach((o) => {
    const key = o.group || '';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(o.label);
  });
  return [...byGroup.entries()].map(([g, labels]) => (g ? `${g}: ${labels.join(', ')}` : labels.join(', '))).join(' · ');
}
