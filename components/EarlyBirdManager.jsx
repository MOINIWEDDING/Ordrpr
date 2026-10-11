'use client';
import { useState, useEffect } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useBranch } from '@/context/BranchContext';
import { useEarlyBirdSettings } from '@/hooks/useEarlyBirdSettings';
import { useMenuItems } from '@/hooks/useMenuItems';

export default function EarlyBirdManager() {
  const { branch, branchInfo } = useBranch();
  const { settings, loading, reload } = useEarlyBirdSettings(branch);
  const { items } = useMenuItems();
  const [enabled, setEnabled] = useState(false);
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('09:00');
  const [prize, setPrize] = useState('Una bebida gratis');
  const [discountMode, setDiscountMode] = useState('ninguno'); // 'ninguno' | 'cualquier_bebida' | 'especifico'
  const [prizeItemId, setPrizeItemId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [todayWinner, setTodayWinner] = useState(undefined); // undefined = cargando, null = nadie aún

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setStartTime(settings.start_time?.slice(0, 5) || '07:00');
      setEndTime(settings.end_time?.slice(0, 5) || '09:00');
      setPrize(settings.prize_description || 'Una bebida gratis');
      setPrizeItemId(settings.prize_item_id || '');
      if (settings.discount_any_beverage) setDiscountMode('cualquier_bebida');
      else if (settings.prize_item_id) setDiscountMode('especifico');
      else setDiscountMode('ninguno');
    }
  }, [settings]);

  useEffect(() => {
    async function loadWinner() {
      if (!BARRO_CONFIGURED || !branch) { setTodayWinner(null); return; }
      const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
      const { data } = await sb.from('early_bird_wins').select('*').eq('branch', branch).eq('win_date', today).maybeSingle();
      setTodayWinner(data || null);
    }
    loadWinner();
  }, [branch]);

  async function handleSave(e) {
    e.preventDefault();
    if (!branch) { setMsg({ text: 'Elige una sucursal primero.', type: 'error' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ text: 'Conecta Supabase para guardar de verdad.', type: 'error' }); return; }
    setBusy(true);
    setMsg({ text: '', type: '' });
    const { error } = await sb.from('early_bird_settings').upsert({
      branch, enabled, start_time: startTime, end_time: endTime,
      prize_description: prize.trim() || 'Una bebida gratis',
      prize_item_id: discountMode === 'especifico' ? (prizeItemId || null) : null,
      discount_any_beverage: discountMode === 'cualquier_bebida',
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    setMsg({ text: 'Guardado.', type: 'ok' });
    await reload();
  }

  if (!branch) return <p className="empty-note">Elige una sucursal (arriba, en &quot;Cambiar&quot;) para configurar su Early Bird.</p>;
  if (loading) return null;

  return (
    <form onSubmit={handleSave}>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Configurando: <b>{branchInfo?.full}</b></p>

      <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input id="ebEnabled" type="checkbox" style={{ width: 'auto' }} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <label htmlFor="ebEnabled" style={{ margin: 0, textTransform: 'none', fontSize: 13, letterSpacing: 0, fontWeight: 500, color: 'var(--ink)' }}>
          Activar Early Bird en esta sucursal
        </label>
      </div>

      <div className="field-row" style={{ marginTop: 14 }}>
        <div className="field">
          <label htmlFor="ebStart">Desde</label>
          <input id="ebStart" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ebEnd">Hasta</label>
          <input id="ebEnd" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="ebDiscountMode">Descuento automático</label>
        <select id="ebDiscountMode" value={discountMode} onChange={(e) => setDiscountMode(e.target.value)}>
          <option value="ninguno">Ninguno (solo aviso, sin descuento)</option>
          <option value="cualquier_bebida">Cualquier bebida en el pedido</option>
          <option value="especifico">Un producto específico</option>
        </select>
      </div>

      {discountMode === 'especifico' && (
        <div className="field">
          <label htmlFor="ebPrizeItem">Producto</label>
          <select id="ebPrizeItem" value={prizeItemId} onChange={(e) => setPrizeItemId(e.target.value)}>
            <option value="">Elige un producto…</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
          </select>
        </div>
      )}

      <span className="up-hint" style={{ display: 'block', marginBottom: 14 }}>
        {discountMode === 'cualquier_bebida'
          ? 'Se descuenta la bebida más barata marcada como "bebida" que el ganador tenga en su pedido. Marca esa opción al editar cada producto en el Menú.'
          : discountMode === 'especifico'
            ? 'Si el ganador tiene este producto en su pedido, se le descuenta solo.'
            : 'El ganador se registra igual, pero no se descuenta nada automáticamente.'}
      </span>

      <div className="field">
        <label htmlFor="ebPrize">Texto del premio (para el aviso)</label>
        <input id="ebPrize" type="text" value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="Una bebida gratis" />
      </div>

      <p className="muted" style={{ fontSize: 12 }}>
        {todayWinner === undefined ? 'Revisando si ya hay ganador hoy…'
          : todayWinner ? `Hoy ya ganó: ${todayWinner.customer_name || 'un cliente'} 🎉`
          : 'Todavía no hay ganador hoy en esta sucursal.'}
      </p>

      {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
      <button type="submit" className="btn btn-amber" disabled={busy} style={{ marginTop: 14 }}>{busy ? 'Guardando…' : 'Guardar'}</button>
    </form>
  );
}
