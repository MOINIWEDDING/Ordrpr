'use client';
import { useMemo, useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useSettings } from '@/context/SettingsContext';
import { PROMO_KINDS, CODE_RE, cleanCode, randomCode } from '@/lib/promo';
import Modal from './Modal';
import PromoTicket from './PromoTicket';

// Crear o editar un código promocional: el código, qué hace, cuánto tiempo dura, sus límites
// y el mensaje que ve el cliente al canjearlo. Arriba, la vista previa del cupón.

const KIND_ICONS = {
  percent: <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
  amount: <><rect x="3" y="6" width="18" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v5M17.5 9.5v5" /></>,
  free_item: <><path d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M3 7h18v4H3zM12 7v14" /><path d="M12 7c-1.5-3-5-3.5-5-1.2S10 7 12 7zm0 0c1.5-3 5-3.5 5-1.2S14 7 12 7z" /></>,
  message: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></>,
};

const DURATIONS = [
  { id: 'none', label: 'Sin límite' },
  { id: '1d', label: '24 h', days: 1 },
  { id: '7d', label: '7 días', days: 7 },
  { id: '30d', label: '30 días', days: 30 },
  { id: 'custom', label: 'Fechas' },
];

// 'AAAA-MM-DDTHH:mm' en la hora del aparato, para los <input type="datetime-local">.
function toLocalInput(d) {
  if (!d) return '';
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
}

export default function PromoCodeForm({ promo, items, onClose, onSaved }) {
  const { settings } = useSettings();
  const symbol = settings.currency_symbol || '$';
  const editing = Boolean(promo);
  const [code, setCode] = useState(promo ? promo.code : randomCode());
  const [title, setTitle] = useState(promo ? promo.title || '' : '');
  const [kind, setKind] = useState(promo ? promo.kind : 'percent');
  const [value, setValue] = useState(promo && promo.value ? String(promo.value) : '');
  const [itemId, setItemId] = useState(promo ? promo.item_id || '' : '');
  const [minSubtotal, setMinSubtotal] = useState(promo && Number(promo.min_subtotal) ? String(promo.min_subtotal) : '');
  const [duration, setDuration] = useState(promo && (promo.starts_at || promo.ends_at) ? 'custom' : 'none');
  const [startsAt, setStartsAt] = useState(toLocalInput(promo && promo.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(promo && promo.ends_at));
  const [maxUses, setMaxUses] = useState(promo && promo.max_uses ? String(promo.max_uses) : '');
  const [oncePerCustomer, setOncePerCustomer] = useState(promo ? promo.once_per_customer : false);
  const [message, setMessage] = useState(promo ? promo.redeem_message || '' : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Las duraciones rápidas empiezan ahora; "Fechas" usa lo que el dueño elija.
  const timing = useMemo(() => {
    const d = DURATIONS.find((x) => x.id === duration);
    if (d && d.days) return { starts_at: null, ends_at: new Date(Date.now() + d.days * 86400000).toISOString() };
    if (duration === 'custom') {
      return { starts_at: startsAt ? new Date(startsAt).toISOString() : null, ends_at: endsAt ? new Date(endsAt).toISOString() : null };
    }
    return { starts_at: null, ends_at: null };
  }, [duration, startsAt, endsAt]);

  const draft = {
    code, title: title.trim(), kind, value: Number(value) || 0, item_id: itemId || null,
    max_uses: Number(maxUses) || null, ...timing,
  };
  const itemName = (items.find((i) => i.id === itemId) || {}).name;

  function pickDuration(id) {
    setDuration(id);
    if (id === 'custom' && !endsAt) {
      setStartsAt(toLocalInput(new Date()));
      setEndsAt(toLocalInput(new Date(Date.now() + 7 * 86400000)));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!CODE_RE.test(code)) { setError('El código debe tener de 3 a 24 letras, números, guiones o guiones bajos.'); return; }
    const num = Number(value);
    if (kind === 'percent' && !(num > 0 && num <= 100)) { setError('Pon un porcentaje entre 1 y 100.'); return; }
    if (kind === 'amount' && !(num > 0)) { setError('Pon el monto del descuento.'); return; }
    if (kind === 'free_item' && !itemId) { setError('Elige el producto que se regala.'); return; }
    if (kind === 'message' && !message.trim()) { setError('Escribe el mensaje que verá el cliente.'); return; }
    if (timing.starts_at && timing.ends_at && timing.starts_at >= timing.ends_at) { setError('La fecha de fin debe ser después del inicio.'); return; }
    if (maxUses && !(Number(maxUses) >= 1)) { setError('El límite de usos debe ser 1 o más.'); return; }
    if (!BARRO_CONFIGURED) { setError('Conecta Supabase para guardar códigos.'); return; }

    const payload = {
      code,
      title: title.trim(),
      kind,
      value: kind === 'percent' || kind === 'amount' ? num : 0,
      item_id: kind === 'free_item' ? itemId : null,
      min_subtotal: Number(minSubtotal) > 0 ? Number(minSubtotal) : 0,
      redeem_message: message.trim(),
      starts_at: timing.starts_at,
      ends_at: timing.ends_at,
      max_uses: Number(maxUses) || null,
      once_per_customer: oncePerCustomer,
    };
    setSaving(true);
    const { error: err } = editing
      ? await sb.from('promo_codes').update(payload).eq('id', promo.id)
      : await sb.from('promo_codes').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.code === '23505' ? `Ya existe un código ${code}.` : err.message);
      return;
    }
    await onSaved();
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={handleSubmit} className="pe promo-form">
        <div className="pe-head">
          <p className="eyebrow">Códigos promocionales</p>
          <h3>{editing ? 'Editar código' : 'Nuevo código'}</h3>
        </div>

        <div className="promo-form-preview">
          <PromoTicket promo={draft} itemName={itemName} preview />
          {message.trim() && <div className="promo-bubble">{message.trim()}</div>}
        </div>

        <section className="pe-section">
          <h4>Código</h4>
          <div className="field">
            <label htmlFor="promoCode">Lo que escribe el cliente</label>
            <div className="promo-code-input">
              <input
                id="promoCode" type="text" value={code} maxLength={24} required
                onChange={(e) => setCode(cleanCode(e.target.value))}
                autoCapitalize="characters" autoComplete="off" spellCheck={false}
              />
              <button type="button" className="pe-link-chip" onClick={() => setCode(randomCode())}>Generar</button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="promoTitle">Nombre de la campaña <span className="muted">(opcional)</span></label>
            <input id="promoTitle" type="text" placeholder="Verano 2026" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </section>

        <section className="pe-section">
          <h4>¿Qué hace?</h4>
          <div className="promo-kinds" role="radiogroup" aria-label="Qué hace el código">
            {PROMO_KINDS.map((k) => (
              <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={`promo-kind${kind === k.id ? ' active' : ''}`} onClick={() => setKind(k.id)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">{KIND_ICONS[k.id]}</svg>
                {k.label}
              </button>
            ))}
          </div>

          {kind === 'percent' && (
            <div className="field">
              <label htmlFor="promoValue">Descuento</label>
              <div className="pe-money promo-suffix">
                <input id="promoValue" type="number" min="1" max="100" step="1" inputMode="numeric" placeholder="20" value={value} onChange={(e) => setValue(e.target.value)} />
                <span>%</span>
              </div>
              <div className="pe-link-chips promo-quick">
                {[10, 15, 20, 25, 50].map((n) => (
                  <button key={n} type="button" className={`pe-link-chip${Number(value) === n ? ' active' : ''}`} onClick={() => setValue(String(n))}>{n}%</button>
                ))}
              </div>
            </div>
          )}
          {kind === 'amount' && (
            <div className="field">
              <label htmlFor="promoValue">Descuento</label>
              <div className="pe-money">
                <span>{symbol}</span>
                <input id="promoValue" type="number" min="1" step="1" inputMode="numeric" placeholder="200" value={value} onChange={(e) => setValue(e.target.value)} />
              </div>
            </div>
          )}
          {kind === 'free_item' && (
            <div className="field">
              <label htmlFor="promoItem">Producto gratis</label>
              <select id="promoItem" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">Elige un producto…</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
          )}
          {kind !== 'message' && (
            <div className="field">
              <label htmlFor="promoMin">Compra mínima <span className="muted">(opcional)</span></label>
              <div className="pe-money">
                <span>{symbol}</span>
                <input id="promoMin" type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} />
              </div>
            </div>
          )}
        </section>

        <section className="pe-section">
          <h4>Tiempo</h4>
          <div className="seg-buttons seg-buttons-sm promo-durations" role="group" aria-label="Cuánto dura">
            {DURATIONS.map((d) => (
              <button key={d.id} type="button" className={duration === d.id ? 'active' : ''} aria-pressed={duration === d.id} onClick={() => pickDuration(d.id)}>{d.label}</button>
            ))}
          </div>
          {duration === 'custom' && (
            <div className="pe-money-row">
              <div className="field">
                <label htmlFor="promoStart">Empieza</label>
                <input id="promoStart" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="promoEnd">Termina</label>
                <input id="promoEnd" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
          )}
          <p className="promo-when">
            {timing.ends_at
              ? `Vence el ${new Date(timing.ends_at).toLocaleString('es', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}`
              : 'No vence'}
          </p>
        </section>

        <section className="pe-section">
          <h4>Usos</h4>
          <div className="field">
            <label htmlFor="promoMax">Límite de canjes</label>
            <input id="promoMax" type="number" min="1" step="1" inputMode="numeric" placeholder="Sin límite" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
          </div>
          <div className="pe-toggles">
            <label className={`pe-toggle${oncePerCustomer ? ' on' : ''}`} htmlFor="promoOnce">
              <span className="pe-toggle-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg></span>
              <span className="pe-toggle-text"><b>Una vez por cliente</b><small>Solo con cuenta iniciada</small></span>
              <input id="promoOnce" type="checkbox" role="switch" checked={oncePerCustomer} onChange={(e) => setOncePerCustomer(e.target.checked)} />
              <span className="pe-switch" aria-hidden="true" />
            </label>
          </div>
        </section>

        <section className="pe-section">
          <h4>Mensaje al canjear</h4>
          <div className="field">
            <textarea id="promoMessage" aria-label="Mensaje al canjear" maxLength={280} rows={3} placeholder="¡Gracias por venir! Tu postre va por la casa." value={message} onChange={(e) => setMessage(e.target.value)} />
            <span className="promo-count">{message.length}/280</span>
          </div>
        </section>

        {error && <div className="form-msg show error">{error}</div>}

        <div className="pe-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-amber" disabled={saving}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear código'}</button>
        </div>
      </form>
    </Modal>
  );
}
