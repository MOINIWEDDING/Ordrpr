'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

const ROLE_LABEL = { staff: 'Dueño', cajero: 'Cajero', camarero: 'Camarero', cocina: 'Cocina', comensal: 'Comensal', contador: 'Contador' };
const ROLE_HELP = {
  staff: 'Acceso total: menú, configuración, equipo, estadísticas, caja y órdenes.',
  cajero: 'Caja, cuentas de las mesas, cobros, facturas y órdenes.',
  camarero: 'Sus mesas y la carta para tomar pedidos y enviarlos a la cocina.',
  cocina: 'La pantalla de comandas para preparar los pedidos.',
  comensal: 'Ve y atiende las órdenes.',
  contador: 'Solo la contabilidad: reportes y exportar en PDF o CSV.',
};
const ROLE_ORDER = ['cajero', 'camarero', 'cocina', 'contador', 'comensal', 'staff'];
const PIN_ROLES = ['cajero', 'camarero', 'cocina', 'contador', 'comensal'];
const KIND_LABEL = { call: 'Llamado', bill: 'Cuenta' };

function Stars({ value }) {
  const full = Math.round(value);
  return <span className="team-stars" aria-label={`${value.toFixed(1)} de 5`}>{'★'.repeat(full)}<i>{'★'.repeat(5 - full)}</i></span>;
}

const fmtDate = (d) => new Date(d).toLocaleString('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function TeamManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('pin'); // pin | email
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState('camarero');
  const [ratings, setRatings] = useState({});
  const [strikes, setStrikes] = useState({}); // waiter_id -> [strikes]
  const [openStrikes, setOpenStrikes] = useState(null);
  const [pinFor, setPinFor] = useState(null); // user_id cuyo PIN se está cambiando
  const [newPin, setNewPin] = useState('');
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setRows([]); setLoading(false); return; }
    await sb.rpc('tab_eta_sweep', { branch_input: null }); // los tiempos vencidos se vuelven strikes
    const { data, error } = await sb.rpc('team_list');
    if (error) setMsg({ type: 'error', text: error.message });
    else setRows(data || []);
    const { data: rs } = await sb.from('waiter_ratings').select('waiter_id, stars, comment, created_at').order('created_at', { ascending: false });
    const acc = {};
    (rs || []).forEach((r) => {
      const a = acc[r.waiter_id] || (acc[r.waiter_id] = { sum: 0, count: 0, last: r.comment ? r : null });
      a.sum += r.stars; a.count += 1;
      if (!a.last && r.comment) a.last = r;
    });
    setRatings(Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, { avg: a.sum / a.count, count: a.count, last: a.last }])));
    const { data: ss } = await sb.from('waiter_strikes').select('*').is('voided_at', null).order('created_at', { ascending: false });
    const byW = {};
    (ss || []).forEach((s) => { (byW[s.waiter_id] = byW[s.waiter_id] || []).push(s); });
    setStrikes(byW);
    const { data: ds } = await sb.rpc('staff_device_list');
    setDevices(ds || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run(fn, okText) {
    setMsg(null);
    setBusy(true);
    const { data, error } = await fn();
    setBusy(false);
    if (error) { setMsg({ type: 'error', text: error.message }); return null; }
    if (okText) setMsg({ type: 'ok', text: typeof okText === 'function' ? okText(data) : okText });
    await load();
    return data ?? true;
  }

  async function addWithPin(e) {
    e.preventDefault();
    if (!name.trim()) { setMsg({ type: 'error', text: 'Escribe el nombre.' }); return; }
    if (!/^[0-9]{4}$/.test(pin)) { setMsg({ type: 'error', text: 'El PIN son 4 números.' }); return; }
    setMsg(null);
    setBusy(true);
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch('/api/equipo/miembro', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session ? session.access_token : ''}` },
      body: JSON.stringify({ name: name.trim(), role, pin }),
    }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : { error: 'Sin conexión.' };
    setBusy(false);
    if (!res || !res.ok) { setMsg({ type: 'error', text: out.error || 'No se pudo agregar.' }); return; }
    setMsg({ type: 'ok', text: `${name.trim()} ya puede entrar con su PIN en los aparatos del local.` });
    setName(''); setPin('');
    load();
  }

  async function addWithEmail(e) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) { setMsg({ type: 'error', text: 'Escribe el correo de la persona.' }); return; }
    const res = await run(
      () => sb.rpc('team_add', { p_email: clean, p_role: role }),
      (r) => r === 'updated' ? `${clean} ya tenía cuenta: ahora es ${ROLE_LABEL[role]}.` : `Invitación guardada: cuando ${clean} se registre será ${ROLE_LABEL[role]} (dura 14 días).`,
    );
    if (res) setEmail('');
  }

  const changeRole = (r, next) => run(() => sb.rpc('team_set_role', { p_user: r.user_id, p_role: next }), `${r.name || r.email} ahora es ${ROLE_LABEL[next]}.`);

  function removeMember(r) {
    const who = r.name || r.email;
    if (!window.confirm(r.pin_only ? `¿Quitar a ${who} del equipo? Ya no podrá entrar.` : `¿Quitar a ${who} del equipo? Su cuenta se mantiene como cliente.`)) return;
    run(() => sb.rpc('team_remove', { p_user: r.user_id }), 'Persona quitada del equipo.');
  }

  async function savePin(r) {
    if (!/^[0-9]{4}$/.test(newPin)) { setMsg({ type: 'error', text: 'El PIN son 4 números.' }); return; }
    const ok = await run(() => sb.rpc('staff_pin_set', { user_input: r.user_id, pin_input: newPin }), `PIN de ${r.name || r.email} guardado.`);
    if (ok) { setPinFor(null); setNewPin(''); }
  }

  const voidStrike = (s) => run(() => sb.rpc('waiter_strike_void', { strike_input: s.id }), 'Strike quitado.');
  const revokeDevice = (d) => { if (window.confirm(`¿Quitar «${d.name || 'Aparato'}»? El equipo ya no podrá entrar con PIN ahí.`)) run(() => sb.rpc('staff_device_revoke', { device_input: d.id }), 'Aparato quitado.'); };

  return (
    <div className="team-manager">
      {msg && <div className={`form-msg show ${msg.type}`} style={{ marginBottom: 12 }}>{msg.text}</div>}
      {loading ? null : rows.length === 0 ? (
        <p className="empty-note">Todavía no hay personal.</p>
      ) : (
        <div className="team-list">
          {rows.map((r) => {
            const st = strikes[r.user_id] || [];
            return (
              <div key={r.user_id || `inv-${r.email}`} className="team-person">
                <div className="team-person-main">
                  <div className="team-person-name">
                    <b>{r.pending ? r.email : (r.name || r.email)}</b>
                    <span className="role-tag">{ROLE_LABEL[r.role]}</span>
                    {r.is_me && <span className="role-tag">Tú</span>}
                    {r.pending && <span className="role-tag is-warn">Invitación pendiente</span>}
                    {r.has_pin && <span className="role-tag is-pin">PIN</span>}
                    {r.locked && <span className="role-tag is-warn">Bloqueado</span>}
                  </div>
                  <span className="team-person-sub">{r.pending ? 'Aún no se ha registrado' : r.pin_only ? 'Entra con PIN en los aparatos del local' : r.email}</span>
                  {!r.pending && ratings[r.user_id] && (
                    <span className="team-rating">
                      <Stars value={ratings[r.user_id].avg} />
                      <b>{ratings[r.user_id].avg.toFixed(1)}</b>
                      <small>{ratings[r.user_id].count} {ratings[r.user_id].count === 1 ? 'calificación' : 'calificaciones'}</small>
                      {ratings[r.user_id].last && <q>{ratings[r.user_id].last.comment}</q>}
                    </span>
                  )}
                  {st.length > 0 && (
                    <button type="button" className="team-strikes" onClick={() => setOpenStrikes(openStrikes === r.user_id ? null : r.user_id)} aria-expanded={openStrikes === r.user_id}>
                      <span className="team-strike-dots" aria-hidden="true">{st.slice(0, 5).map((s) => <i key={s.id} />)}</span>
                      {st.length} {st.length === 1 ? 'strike' : 'strikes'}
                    </button>
                  )}
                  {openStrikes === r.user_id && (
                    <ul className="team-strike-list">
                      {st.map((s) => (
                        <li key={s.id}>
                          <span><b>{s.table_label || 'Mesa'}</b> · {KIND_LABEL[s.kind]}{s.promised_minutes ? ` · dijo ${s.promised_minutes} min` : ''}<small>{fmtDate(s.due_at)}</small></span>
                          <button type="button" onClick={() => voidStrike(s)} disabled={busy}>Quitar</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {pinFor === r.user_id && (
                    <div className="team-pin-edit">
                      <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoFocus placeholder="••••" aria-label="PIN nuevo" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                      <button type="button" className="is-primary" onClick={() => savePin(r)} disabled={busy || newPin.length !== 4}>Guardar PIN</button>
                      <button type="button" onClick={() => { setPinFor(null); setNewPin(''); }}>Cancelar</button>
                    </div>
                  )}
                </div>
                {!r.is_me && !r.pending && (
                  <div className="team-person-actions">
                    <select className="team-role-select" value={r.role} disabled={busy} onChange={(e) => changeRole(r, e.target.value)} aria-label={`Rol de ${r.name || r.email}`}>
                      {ROLE_ORDER.filter((k) => !(r.pin_only && k === 'staff')).map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
                    </select>
                    {r.role !== 'staff' && <button type="button" disabled={busy} onClick={() => { setPinFor(r.user_id); setNewPin(''); }}>{r.has_pin ? 'Cambiar PIN' : 'Poner PIN'}</button>}
                    <button type="button" disabled={busy} onClick={() => removeMember(r)}>Quitar</button>
                  </div>
                )}
                {r.pending && (
                  <div className="team-person-actions">
                    <button type="button" disabled={busy} onClick={() => { if (window.confirm(`¿Cancelar la invitación de ${r.email}?`)) run(() => sb.rpc('team_cancel_invite', { p_email: r.email }), 'Invitación cancelada.'); }}>Cancelar invitación</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="team-add">
        <div className="team-add-head">
          <h4>Agregar persona</h4>
          <div className="team-seg" role="tablist" aria-label="Cómo entra">
            <button type="button" role="tab" aria-selected={mode === 'pin'} className={mode === 'pin' ? 'on' : ''} onClick={() => { setMode('pin'); if (role === 'staff') setRole('camarero'); }}>Con PIN</button>
            <button type="button" role="tab" aria-selected={mode === 'email'} className={mode === 'email' ? 'on' : ''} onClick={() => setMode('email')}>Con correo</button>
          </div>
        </div>
        <div className="team-roles" role="radiogroup" aria-label="Rol">
          {(mode === 'pin' ? PIN_ROLES : ROLE_ORDER).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={role === k} className={role === k ? 'on' : ''} onClick={() => setRole(k)}>{ROLE_LABEL[k]}</button>
          ))}
        </div>
        <p className="team-role-help">{ROLE_HELP[role]}</p>
        {mode === 'pin' ? (
          <form onSubmit={addWithPin} className="team-add-form">
            <div className="tfield">
              <input id="teamName" placeholder=" " maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              <label htmlFor="teamName">Nombre</label>
            </div>
            <div className="tfield team-pin-field">
              <input id="teamPin" placeholder=" " inputMode="numeric" pattern="[0-9]*" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} autoComplete="off" />
              <label htmlFor="teamPin">PIN de 4 números</label>
            </div>
            <button type="submit" className="btn btn-amber" disabled={busy}>{busy ? 'Guardando…' : 'Agregar al equipo'}</button>
          </form>
        ) : (
          <form onSubmit={addWithEmail} className="team-add-form">
            <div className="tfield">
              <input id="teamEmail" type="email" placeholder=" " value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
              <label htmlFor="teamEmail">Correo</label>
            </div>
            <button type="submit" className="btn btn-amber" disabled={busy}>{busy ? 'Guardando…' : 'Agregar al equipo'}</button>
          </form>
        )}
      </div>

      <div className="team-devices">
        <div className="team-add-head">
          <h4>Aparatos del local</h4>
          <Link href="/equipo" className="team-link">Activar este aparato</Link>
        </div>
        {devices.length === 0 ? (
          <p className="team-role-help">Ninguno todavía. Abre la pantalla del equipo en la tablet o el teléfono del local y actívalo con tu cuenta.</p>
        ) : (
          <ul className="team-device-list">
            {devices.map((d) => (
              <li key={d.id}>
                <span><b>{d.name || 'Aparato'}</b><small>{d.last_used_at ? `Último uso ${fmtDate(d.last_used_at)}` : `Activado ${fmtDate(d.created_at)}`}</small></span>
                <button type="button" onClick={() => revokeDevice(d)} disabled={busy}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
