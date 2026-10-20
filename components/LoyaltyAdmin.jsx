'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useSettings } from '@/context/SettingsContext';
import { useUploader } from '@/hooks/useUploader';
import { LOYALTY_DEFAULTS, useLoyaltySettings, useWalletStatus, notifyWallet } from '@/lib/loyalty';
import { PROMO_KINDS } from '@/lib/promo';
import { STAMP_ICON_KEYS } from './StampIcon';
import StampIcon from './StampIcon';
import Uploader from './Uploader';
import LoyaltyPassCard from './LoyaltyPassCard';

// El pase de sellos para el dueño: el diseño con vista previa en vivo, el premio, las reglas
// para ganar sellos, los números y la lista de clientes (con "+1 sello" a mano).

const PALETTES = [
  { name: 'Carbón', bg_color: '#241C13', fg_color: '#FBF8F2', label_color: '#C9B79C', stamp_color: '#D5402C' },
  { name: 'Crema', bg_color: '#F4ECDC', fg_color: '#241C13', label_color: '#8A7A62', stamp_color: '#A62E1E' },
  { name: 'Bosque', bg_color: '#1F3A2E', fg_color: '#F3EFE4', label_color: '#A9C2A0', stamp_color: '#E3B04B' },
  { name: 'Noche', bg_color: '#14213D', fg_color: '#FFFFFF', label_color: '#9FB3D1', stamp_color: '#FCA311' },
  { name: 'Rosa', bg_color: '#F9D9DE', fg_color: '#3B1F2B', label_color: '#9B5D6E', stamp_color: '#C2185B' },
];

const COLOR_FIELDS = [
  { key: 'bg_color', label: 'Fondo' },
  { key: 'fg_color', label: 'Texto' },
  { key: 'label_color', label: 'Etiquetas' },
  { key: 'stamp_color', label: 'Sello' },
];

const EDITABLE = Object.keys(LOYALTY_DEFAULTS);

export default function LoyaltyAdmin({ items }) {
  const { settings } = useSettings();
  const { loyalty, loaded, reload } = useLoyaltySettings();
  const wallet = useWalletStatus();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [cards, setCards] = useState([]);
  const [names, setNames] = useState({});
  const [counts, setCounts] = useState({ stamps: 0, rewards: 0, used: 0 });
  const [givingTo, setGivingTo] = useState('');
  const [query, setQuery] = useState('');
  const logoUp = useUploader({ kind: 'logo' });
  const stampUp = useUploader({ kind: 'logo' });
  const stripUp = useUploader({ kind: 'logo' });

  useEffect(() => {
    if (!loaded || form) return;
    setForm(Object.fromEntries(EDITABLE.map((k) => [k, loyalty[k] ?? LOYALTY_DEFAULTS[k]])));
    logoUp.setUrl(loyalty.logo_url || '');
    stampUp.setUrl(loyalty.stamp_image_url || '');
    stripUp.setUrl(loyalty.strip_image_url || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const loadCustomers = useCallback(async () => {
    if (!BARRO_CONFIGURED) return;
    const [c, ev, codes, red] = await Promise.all([
      sb.from('loyalty_cards').select('id, user_id, stamps, total_stamps, rewards_earned, updated_at').order('updated_at', { ascending: false }),
      sb.from('loyalty_events').select('kind'),
      sb.from('promo_codes').select('id').eq('source', 'loyalty'),
      sb.from('promo_redemptions').select('code_id'),
    ]);
    const list = c.data || [];
    setCards(list);
    const ids = list.map((x) => x.user_id);
    if (ids.length) {
      const { data: profs } = await sb.from('profiles').select('id, name').in('id', ids);
      setNames(Object.fromEntries((profs || []).map((p) => [p.id, p.name])));
    }
    const rewardIds = new Set((codes.data || []).map((x) => x.id));
    setCounts({
      stamps: (ev.data || []).filter((e) => e.kind !== 'reward').length,
      rewards: (ev.data || []).filter((e) => e.kind === 'reward').length,
      used: (red.data || []).filter((r) => rewardIds.has(r.code_id)).length,
    });
  }, []);
  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  // Los clientes con cuenta que todavía no tienen pase también se pueden buscar para darles un sello.
  const [found, setFound] = useState([]);
  useEffect(() => {
    const q = query.trim();
    if (!BARRO_CONFIGURED || q.length < 2) { setFound([]); return undefined; }
    const t = setTimeout(async () => {
      const { data } = await sb.from('profiles').select('id, name').eq('role', 'cliente').ilike('name', `%${q}%`).limit(8);
      setFound(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const preview = useMemo(() => form && ({
    ...form,
    logo_url: logoUp.previewUrl || '',
    stamp_image_url: stampUp.previewUrl || '',
    strip_image_url: stripUp.previewUrl || '',
  }), [form, logoUp.previewUrl, stampUp.previewUrl, stripUp.previewUrl]);

  if (!loaded || !form) return <p className="empty-note">Cargando el pase…</p>;
  if (loyalty.missing) return <div className="form-msg show error">Falta actualizar la base de datos de este restaurante para usar el pase de sellos.</div>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v) => (v === '' || v === null ? '' : Number(v));

  async function save(patchOverride) {
    setMsg({ type: '', text: '' });
    if (logoUp.uploading || stampUp.uploading || stripUp.uploading) { setMsg({ type: 'error', text: 'Espera a que terminen de subir las imágenes.' }); return; }
    const f = { ...form, ...(patchOverride || {}) };
    if (!f.title.trim()) { setMsg({ type: 'error', text: 'Ponle un nombre al pase.' }); return; }
    if (!f.reward_label.trim()) { setMsg({ type: 'error', text: 'Escribe cuál es el premio.' }); return; }
    if (f.reward_kind === 'percent' && !(Number(f.reward_value) > 0 && Number(f.reward_value) <= 100)) { setMsg({ type: 'error', text: 'El porcentaje del premio va de 1 a 100.' }); return; }
    if (f.reward_kind === 'amount' && !(Number(f.reward_value) > 0)) { setMsg({ type: 'error', text: 'Pon el monto del premio.' }); return; }
    if (f.reward_kind === 'free_item' && !f.reward_item_id) { setMsg({ type: 'error', text: 'Elige el producto del premio.' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ type: 'error', text: 'Conecta Supabase para guardar.' }); return; }
    const patch = {
      ...f,
      title: f.title.trim(), description: f.description.trim(), reward_label: f.reward_label.trim(), reward_message: f.reward_message.trim(), terms: f.terms.trim(),
      stamps_required: Math.min(20, Math.max(3, Number(f.stamps_required) || 8)),
      reward_value: f.reward_kind === 'percent' || f.reward_kind === 'amount' ? Number(f.reward_value) || 0 : 0,
      reward_item_id: f.reward_kind === 'free_item' ? f.reward_item_id : null,
      reward_days: Number(f.reward_days) || null,
      min_subtotal: Number(f.min_subtotal) || 0,
      max_per_day: Number(f.max_per_day) || 0,
      logo_url: logoUp.url || '', stamp_image_url: stampUp.url || '', strip_image_url: stripUp.url || '',
    };
    setSaving(true);
    const { error } = await sb.from('loyalty_settings').update(patch).eq('id', 1);
    setSaving(false);
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setForm(f);
    await reload();
    setMsg({ type: 'ok', text: patchOverride && 'enabled' in patchOverride ? (patchOverride.enabled ? 'El pase está activo.' : 'El pase está apagado.') : 'Guardado.' });
    notifyWallet({ all: true });
  }

  async function giveStamp(userId) {
    setGivingTo(userId);
    const { error } = await sb.rpc('loyalty_manual_stamp', { user_id_input: userId });
    setGivingTo('');
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    notifyWallet({ userId });
    setQuery('');
    loadCustomers();
  }

  const shown = query.trim().length >= 2
    ? [...cards.filter((c) => (names[c.user_id] || '').toLowerCase().includes(query.trim().toLowerCase())),
      ...found.filter((p) => !cards.some((c) => c.user_id === p.id)).map((p) => ({ id: p.id, user_id: p.id, stamps: 0, total_stamps: 0, rewards_earned: 0, fresh: true }))]
    : cards;

  return (
    <div className="loyalty-admin">
      <div className={`loyalty-switch${form.enabled ? ' on' : ''}`}>
        <span>
          <b>{form.enabled ? 'El pase está activo' : 'El pase está apagado'}</b>
          <small className={`wallet-chip${wallet && wallet.enabled ? ' ok' : ''}`}>
            {wallet ? (wallet.enabled ? 'Apple Wallet conectado' : 'Apple Wallet sin configurar') : '…'}
          </small>
        </span>
        <label className="pe-toggle" htmlFor="loyaltyOn">
          <input id="loyaltyOn" type="checkbox" role="switch" checked={form.enabled} onChange={(e) => save({ enabled: e.target.checked })} disabled={saving} />
          <span className="pe-switch" aria-hidden="true" />
        </label>
      </div>

      <div className="promo-summary">
        <div><span className="kpi-label">Clientes con pase</span><b>{cards.filter((c) => c.total_stamps > 0).length}</b></div>
        <div><span className="kpi-label">Sellos dados</span><b>{counts.stamps}</b></div>
        <div><span className="kpi-label">Premios ganados</span><b>{counts.rewards}</b></div>
        <div><span className="kpi-label">Premios usados</span><b>{counts.used}</b></div>
      </div>

      <div className="loyalty-grid">
        <div className="loyalty-preview">
          <LoyaltyPassCard s={preview} brand={settings.brand_name} brandLogo={settings.logo_url} stamps={Math.min(3, form.stamps_required - 1)} customer="Nombre del cliente" />
        </div>

        <div className="loyalty-form">
          <section className="pe-section">
            <h4>Pase</h4>
            <div className="field">
              <label htmlFor="lyTitle">Nombre</label>
              <input id="lyTitle" type="text" maxLength={40} value={form.title} onChange={(e) => set('title', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="lyDesc">Cómo funciona <span className="muted">(opcional)</span></label>
              <textarea id="lyDesc" rows={2} maxLength={300} placeholder="Gana un sello con cada pedido. Con 8, el próximo brisket va por la casa." value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
          </section>

          <section className="pe-section">
            <h4>Sellos</h4>
            <div className="field">
              <label>Sellos para el premio</label>
              <div className="loyalty-count">
                <div className="qty-stepper">
                  <button type="button" onClick={() => set('stamps_required', Math.max(3, form.stamps_required - 1))} aria-label="Menos">–</button>
                  <span>{form.stamps_required}</span>
                  <button type="button" onClick={() => set('stamps_required', Math.min(20, form.stamps_required + 1))} aria-label="Más">+</button>
                </div>
                <div className="pe-link-chips">
                  {[5, 6, 8, 10, 12].map((n) => (
                    <button key={n} type="button" className={`pe-link-chip${form.stamps_required === n ? ' active' : ''}`} onClick={() => set('stamps_required', n)}>{n}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field">
              <label>Sello</label>
              <div className="stamp-picks">
                {STAMP_ICON_KEYS.map((k) => (
                  <button key={k} type="button" className={`stamp-pick${form.stamp_icon === k && !stampUp.previewUrl ? ' active' : ''}`} aria-label={k} aria-pressed={form.stamp_icon === k} onClick={() => { set('stamp_icon', k); stampUp.reset(); }} style={{ '--stamp': form.stamp_color }}>
                    <StampIcon name={k} color="#fff" strokeWidth={3.4} />
                  </button>
                ))}
              </div>
              <details className="loyalty-more" open={Boolean(stampUp.previewUrl)}>
                <summary>Usar mi propia imagen</summary>
                <Uploader uploader={stampUp} kind="logo" hint="PNG cuadrado con fondo transparente." />
              </details>
            </div>
            <div className="pe-money-row">
              <div className="field">
                <label htmlFor="lyMin">Compra mínima</label>
                <div className="pe-money">
                  <span>{settings.currency_symbol || '$'}</span>
                  <input id="lyMin" type="number" min="0" inputMode="numeric" placeholder="0" value={num(form.min_subtotal) || ''} onChange={(e) => set('min_subtotal', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="lyMax">Sellos por día</label>
                <select id="lyMax" value={form.max_per_day} onChange={(e) => set('max_per_day', Number(e.target.value))}>
                  <option value={0}>Sin límite</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>
            </div>
          </section>

          <section className="pe-section">
            <h4>Premio</h4>
            <div className="field">
              <label htmlFor="lyReward">Lo que gana</label>
              <input id="lyReward" type="text" maxLength={60} placeholder="Un brisket gratis" value={form.reward_label} onChange={(e) => set('reward_label', e.target.value)} />
            </div>
            <div className="promo-kinds" role="radiogroup" aria-label="Qué hace el premio">
              {PROMO_KINDS.map((k) => (
                <button key={k.id} type="button" role="radio" aria-checked={form.reward_kind === k.id} className={`promo-kind${form.reward_kind === k.id ? ' active' : ''}`} onClick={() => set('reward_kind', k.id)}>{k.label}</button>
              ))}
            </div>
            {form.reward_kind === 'percent' && (
              <div className="field">
                <label htmlFor="lyVal">Descuento</label>
                <div className="pe-money promo-suffix">
                  <input id="lyVal" type="number" min="1" max="100" inputMode="numeric" value={num(form.reward_value) || ''} onChange={(e) => set('reward_value', e.target.value)} />
                  <span>%</span>
                </div>
              </div>
            )}
            {form.reward_kind === 'amount' && (
              <div className="field">
                <label htmlFor="lyVal">Descuento</label>
                <div className="pe-money">
                  <span>{settings.currency_symbol || '$'}</span>
                  <input id="lyVal" type="number" min="1" inputMode="numeric" value={num(form.reward_value) || ''} onChange={(e) => set('reward_value', e.target.value)} />
                </div>
              </div>
            )}
            {form.reward_kind === 'free_item' && (
              <div className="field">
                <label htmlFor="lyItem">Producto</label>
                <select id="lyItem" value={form.reward_item_id || ''} onChange={(e) => set('reward_item_id', e.target.value || null)}>
                  <option value="">Elige un producto…</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="lyDays">Vence</label>
              <select id="lyDays" value={form.reward_days || ''} onChange={(e) => set('reward_days', e.target.value ? Number(e.target.value) : null)}>
                <option value="">Nunca</option>
                <option value={7}>A los 7 días</option>
                <option value={30}>A los 30 días</option>
                <option value={90}>A los 90 días</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="lyMsg">Mensaje al canjearlo</label>
              <textarea id="lyMsg" rows={2} maxLength={280} placeholder="¡Gracias por ser cliente fiel!" value={form.reward_message} onChange={(e) => set('reward_message', e.target.value)} />
            </div>
          </section>

          <section className="pe-section">
            <h4>Diseño</h4>
            <div className="loyalty-palettes">
              {PALETTES.map((p) => (
                <button key={p.name} type="button" className="loyalty-palette" onClick={() => setForm((f) => ({ ...f, ...p, name: undefined }))} aria-label={p.name}>
                  <span style={{ background: p.bg_color }}><i style={{ background: p.stamp_color }} /></span>
                  {p.name}
                </button>
              ))}
              <button type="button" className="loyalty-palette" onClick={() => setForm((f) => ({ ...f, stamp_color: settings.primary_color || f.stamp_color }))}>
                <span style={{ background: form.bg_color }}><i style={{ background: settings.primary_color }} /></span>
                Mi marca
              </button>
            </div>
            <div className="loyalty-colors">
              {COLOR_FIELDS.map((c) => (
                <label key={c.key} className="loyalty-color">
                  <input type="color" value={form[c.key]} onChange={(e) => set(c.key, e.target.value)} />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
            <div className="field">
              <label>Logo <span className="muted">(si no subes uno, se usa el de tu negocio)</span></label>
              <Uploader uploader={logoUp} kind="logo" hint="PNG con fondo transparente." />
            </div>
            <div className="field">
              <label>Imagen de fondo de los sellos <span className="muted">(opcional)</span></label>
              <Uploader uploader={stripUp} kind="logo" hint="Horizontal, 1125 × 369 px." />
            </div>
          </section>

          <section className="pe-section">
            <h4>Términos</h4>
            <div className="field">
              <textarea aria-label="Términos" rows={3} maxLength={600} placeholder="Un sello por pedido confirmado. No acumulable con otras promociones." value={form.terms} onChange={(e) => set('terms', e.target.value)} />
            </div>
          </section>

          {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
          <div className="loyalty-save">
            <button type="button" className="btn btn-amber btn-block" onClick={() => save()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar pase'}</button>
          </div>
        </div>
      </div>

      <div className="loyalty-customers">
        <div className="loyalty-customers-head">
          <h3>Clientes</h3>
          <input type="search" placeholder="Buscar cliente…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {shown.length === 0 ? (
          <p className="empty-note">{query.trim().length >= 2 ? 'Nadie con ese nombre.' : 'Todavía nadie tiene sellos.'}</p>
        ) : (
          <ul className="loyalty-list">
            {shown.map((c) => (
              <li key={c.id}>
                <span className="loyalty-list-name">
                  <b>{names[c.user_id] || (c.fresh && (found.find((p) => p.id === c.user_id) || {}).name) || 'Cliente'}</b>
                  <small>{c.total_stamps} sello{c.total_stamps === 1 ? '' : 's'} en total · {c.rewards_earned} premio{c.rewards_earned === 1 ? '' : 's'}</small>
                </span>
                <span className="loyalty-dots" aria-label={`${c.stamps} de ${form.stamps_required}`}>
                  {Array.from({ length: form.stamps_required }, (_, i) => <i key={i} className={i < c.stamps ? 'on' : ''} />)}
                </span>
                <button type="button" className="hours-add" onClick={() => giveStamp(c.user_id)} disabled={givingTo === c.user_id || !form.enabled}>+1 sello</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
