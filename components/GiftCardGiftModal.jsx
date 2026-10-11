'use client';
import { useState, useEffect } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { money } from '@/hooks/useMenuItems';
import { useGiftCardDesigns } from '@/hooks/useGiftCardDesigns';
import Modal from './Modal';
import { useSettings } from '@/context/SettingsContext';

const STEP = 300;
const MIN_AMOUNT = 300;
const MAX_AMOUNT = 3000;

function generateCode(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part = '';
  for (let i = 0; i < 8; i++) part += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${part.slice(0, 4)}-${part.slice(4)}`;
}

export default function GiftCardGiftModal({ onClose, onDone }) {
  const { settings } = useSettings();
  const { designs } = useGiftCardDesigns();
  const globalDesigns = designs.filter((d) => d.scope === 'global');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState(MIN_AMOUNT);
  const [designId, setDesignId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [result, setResult] = useState(null); // {code, amount, email}

  useEffect(() => {
    if (!designId && globalDesigns[0]) setDesignId(globalDesigns[0].id);
  }, [globalDesigns, designId]);

  async function handleSubmit(e) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setMsg({ text: 'Escribe un correo válido.', type: 'error' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ text: 'Conecta Supabase para guardar de verdad.', type: 'error' }); return; }
    setBusy(true);
    setMsg({ text: '', type: '' });
    const code = generateCode(settings.gift_card_prefix || 'GC');
    const { error } = await sb.from('gift_cards').insert({
      code,
      amount,
      status: 'activa',
      is_gift: true,
      recipient_email: cleanEmail,
      buyer_name: settings.brand_name,
      design_id: designId || null,
    });
    setBusy(false);
    if (error) { setMsg({ text: error.message, type: 'error' }); return; }
    setResult({ code, amount, email: cleanEmail });
    if (onDone) onDone();
  }

  return (
    <Modal onClose={onClose}>
      {result ? (
        <div className="order-success" style={{ padding: '50px 26px' }}>
          <div className="order-check">
            <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
          </div>
          <h3>¡Listo, la regalaste!</h3>
          <p>Se le regaló una gift card de {money(result.amount)} a <b>{result.email}</b>.</p>
          <button type="button" className="btn btn-amber btn-block" style={{ marginTop: 20 }} onClick={onClose}>Listo</button>
        </div>
      ) : (
        <>
          <div className="modal-top">
            <p className="eyebrow">Gift cards</p>
            <h3>Regalar una gift card</h3>
            <p className="modal-sub">Se genera un código y se le asigna a ese correo — no hace falta que sea cliente todavía.</p>
          </div>
          <div className="modal-body">
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="giftEmail">Correo del destinatario</label>
                <input id="giftEmail" type="email" placeholder="cliente@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              {globalDesigns.length > 0 && (
                <div className="field">
                  <label>Diseño</label>
                  <div className="offers-wrap" style={{ margin: 0 }}>
                    <div className="offers-track">
                      {globalDesigns.map((d) => (
                        <button
                          type="button"
                          key={d.id}
                          className={`offer-card design-pick${designId === d.id ? ' selected' : ''}`}
                          onClick={() => setDesignId(d.id)}
                        >
                          <div className="ph"><img className="real" src={d.image_url} alt={d.name} /></div>
                          <div className="offer-content"><h3 style={{ fontSize: 15 }}>{d.name}</h3></div>
                          {designId === d.id && (
                            <span className="design-pick-check">
                              <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="field">
                <label>Monto</label>
                <div className="pd-price-row" style={{ justifyContent: 'flex-start' }}>
                  <div className="qty-stepper amount-stepper">
                    <button type="button" onClick={() => setAmount((a) => Math.max(MIN_AMOUNT, a - STEP))} aria-label="Menos">–</button>
                    <span>{money(amount)}</span>
                    <button type="button" onClick={() => setAmount((a) => Math.min(MAX_AMOUNT, a + STEP))} aria-label="Más">+</button>
                  </div>
                </div>
              </div>
              {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn btn-amber" disabled={busy}>{busy ? 'Regalando…' : `Regalar ${money(amount)}`}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </Modal>
  );
}
