'use client';
import { useState, useEffect } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { playNotificationSound } from '@/lib/notificationSound';
import { PUSH_CONFIGURED } from '@/lib/push';
import {
  ORDER_MESSAGE_STEPS, DEFAULT_ORDER_MESSAGES, ORDER_MESSAGE_MAX, ORDER_PLACEHOLDERS,
  mergeOrderMessages, fillOrderMessage,
} from '@/lib/orderMessages';

// Editor de los avisos que ve el cliente cuando cambia el estado de su pedido.
export default function OrderMessagesManager() {
  const { settings, saveSettings } = useSettings();
  const { showToast } = useToast();
  const [draft, setDraft] = useState(() => mergeOrderMessages(settings.order_messages));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => { setDraft(mergeOrderMessages(settings.order_messages)); }, [settings.order_messages]);

  const sample = { name: 'María Pérez', table: 'Mesa 4', brand: settings.brand_name };
  const setStep = (status, patch) => setDraft((d) => ({ ...d, [status]: { ...d[status], ...patch } }));

  function insertTag(status, tag) {
    setStep(status, { text: `${draft[status].text}${draft[status].text && !draft[status].text.endsWith(' ') ? ' ' : ''}${tag}` });
  }

  function test(status) {
    const step = draft[status];
    if (draft.sound) playNotificationSound();
    showToast(fillOrderMessage(step.text, sample) || '(mensaje vacío)');
  }

  async function handleSave() {
    setBusy(true);
    setMsg({ text: '', type: '' });
    const clean = { sound: draft.sound, push: draft.push };
    ORDER_MESSAGE_STEPS.forEach(({ status }) => {
      clean[status] = { on: draft[status].on, text: draft[status].text.trim().slice(0, ORDER_MESSAGE_MAX) || DEFAULT_ORDER_MESSAGES[status].text };
    });
    const { error } = await saveSettings({ order_messages: clean });
    setBusy(false);
    if (error) {
      const missing = /order_messages/i.test(error.message || '');
      setMsg({ text: missing ? 'Falta ejecutar la actualización de avisos en Supabase (actualizacion-avisos-pedido.sql).' : error.message, type: 'error' });
      return;
    }
    setMsg({ text: 'Guardado. Los clientes verán estos mensajes desde ahora.', type: 'ok' });
  }

  return (
    <div className="order-msgs">
      {ORDER_MESSAGE_STEPS.map(({ status, label, hint }) => {
        const step = draft[status];
        return (
          <div className="field" key={status} style={{ borderTop: '1px solid var(--line, rgba(0,0,0,.08))', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input id={`om-on-${status}`} type="checkbox" style={{ width: 'auto' }} checked={step.on} onChange={(e) => setStep(status, { on: e.target.checked })} />
              <label htmlFor={`om-on-${status}`} style={{ margin: 0 }}>{label}</label>
            </div>
            <span className="muted" style={{ display: 'block', fontSize: 12.5, margin: '4px 0 8px' }}>{hint}{!step.on && ' · Apagado: no se avisa en este paso.'}</span>
            <input
              type="text"
              aria-label={`Mensaje para ${label}`}
              value={step.text}
              maxLength={ORDER_MESSAGE_MAX}
              disabled={!step.on}
              onChange={(e) => setStep(status, { text: e.target.value })}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
              {ORDER_PLACEHOLDERS.map((p) => (
                <button key={p.tag} type="button" disabled={!step.on} title={`Inserta ${p.help}`} onClick={() => insertTag(status, p.tag)} style={{ border: '1px solid var(--line, rgba(0,0,0,.18))', background: 'var(--cream-2)', color: 'var(--ink)', borderRadius: 100, padding: '5px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: step.on ? 1 : 0.5 }}>{p.tag}</button>
              ))}
              <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{step.text.length}/{ORDER_MESSAGE_MAX}</span>
            </div>
            {step.on && (
              <p style={{ fontSize: 13, margin: '10px 0 0' }}>
                <span className="muted">Así lo verá: </span><b>{fillOrderMessage(step.text, sample) || '—'}</b>
              </p>
            )}
            <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
              <button type="button" className="carta-add-link" disabled={!step.on} onClick={() => test(status)}>Probar aviso</button>
              <button type="button" className="carta-add-link" onClick={() => setStep(status, { text: DEFAULT_ORDER_MESSAGES[status].text })}>Restablecer texto</button>
            </div>
          </div>
        );
      })}

      <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--line, rgba(0,0,0,.08))', paddingTop: 14 }}>
        <input id="om-sound" type="checkbox" style={{ width: 'auto' }} checked={draft.sound} onChange={(e) => setDraft((d) => ({ ...d, sound: e.target.checked }))} />
        <label htmlFor="om-sound" style={{ margin: 0, textTransform: 'none', fontSize: 13, letterSpacing: 0, fontWeight: 500, color: 'var(--ink)' }}>Sonido al llegar el aviso</label>
      </div>

      <div className="field" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <input id="om-push" type="checkbox" style={{ width: 'auto', marginTop: 3 }} checked={draft.push} onChange={(e) => setDraft((d) => ({ ...d, push: e.target.checked }))} />
        <label htmlFor="om-push" style={{ margin: 0, textTransform: 'none', fontSize: 13, letterSpacing: 0, fontWeight: 500, color: 'var(--ink)' }}>
          Enviar también como notificación al teléfono
          <span className="muted" style={{ display: 'block', fontSize: 12.5, fontWeight: 400, marginTop: 3 }}>
            Le llega aunque tenga la página cerrada, si el cliente activó las notificaciones en Pedidos. {PUSH_CONFIGURED ? 'Es el mismo texto de arriba.' : 'Aún no está conectado: faltan las llaves VAPID en Vercel (mira la guía).'}
          </span>
        </label>
      </div>

      <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
        Los avisos le salen al cliente (con o sin cuenta) dentro de la página. Los invitados los reciben en el mismo navegador donde hicieron el pedido.
      </p>
      {msg.text && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
      <button type="button" className="btn btn-amber" disabled={busy} style={{ marginTop: 14 }} onClick={handleSave}>{busy ? 'Guardando…' : 'Guardar avisos'}</button>
    </div>
  );
}
