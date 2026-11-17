'use client';
import { useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

const ROLE_LABEL = { staff: 'Dueño', cajero: 'Cajero', camarero: 'Camarero', cocina: 'Cocina', comensal: 'Comensal' };
const ROLE_HELP = {
  staff: 'Dueño: acceso total (menú, configuración, equipo, estadísticas, caja y órdenes).',
  cajero: 'Cajero: caja, cuentas de las mesas, cobros, facturas y órdenes.',
  camarero: 'Camarero: sus mesas y la carta para tomar pedidos y enviarlos a la cocina.',
  cocina: 'Cocina: la pantalla de comandas para preparar los pedidos.',
  comensal: 'Comensal: ve y atiende las Órdenes.',
};
const ROLE_ORDER = ['cajero', 'camarero', 'cocina', 'comensal', 'staff'];

function Stars({ value }) {
  const full = Math.round(value);
  return <span className="team-stars" aria-label={`${value.toFixed(1)} de 5`}>{'★'.repeat(full)}<i>{'★'.repeat(5 - full)}</i></span>;
}

export default function TeamManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('camarero');
  const [ratings, setRatings] = useState({}); // waiter_id -> { avg, count, last }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok' | 'error', text }

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setRows([]); setLoading(false); return; }
    const { data, error } = await sb.rpc('team_list');
    if (error) setMsg({ type: 'error', text: error.message });
    else setRows(data || []);
    // estrellas que dan los clientes al cerrar su cuenta
    const { data: rs } = await sb.from('waiter_ratings').select('waiter_id, stars, comment, created_at').order('created_at', { ascending: false });
    const acc = {};
    (rs || []).forEach((r) => {
      const a = acc[r.waiter_id] || (acc[r.waiter_id] = { sum: 0, count: 0, last: r.comment ? r : null });
      a.sum += r.stars; a.count += 1;
      if (!a.last && r.comment) a.last = r;
    });
    setRatings(Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, { avg: a.sum / a.count, count: a.count, last: a.last }])));
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
    return data;
  }

  async function handleAdd(e) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) { setMsg({ type: 'error', text: 'Escribe el correo de la persona.' }); return; }
    if (!BARRO_CONFIGURED) { setMsg({ type: 'error', text: 'Conecta Supabase para guardar de verdad.' }); return; }
    const res = await run(
      () => sb.rpc('team_add', { p_email: clean, p_role: role }),
      (r) => r === 'updated'
        ? `${clean} ya tenía cuenta: ahora es ${ROLE_LABEL[role]}.`
        : `Invitación guardada. Cuando ${clean} se registre con ese correo será ${ROLE_LABEL[role]} automáticamente (la invitación dura 14 días).`,
    );
    if (res) setEmail('');
  }

  const changeRole = (r, next) => run(
    () => sb.rpc('team_set_role', { p_user: r.user_id, p_role: next }),
    `${r.name || r.email} ahora es ${ROLE_LABEL[next]}.`,
  );

  function removeMember(r) {
    const who = r.name || r.email;
    if (!window.confirm(`¿Quitar a ${who} del equipo? Su cuenta se mantiene, pero vuelve a ser un cliente normal.`)) return;
    run(() => sb.rpc('team_remove', { p_user: r.user_id }), 'Persona quitada del equipo.');
  }

  function cancelInvite(r) {
    if (!window.confirm(`¿Cancelar la invitación de ${r.email}?`)) return;
    run(() => sb.rpc('team_cancel_invite', { p_email: r.email }), 'Invitación cancelada.');
  }

  return (
    <div className="team-manager">
      {loading ? null : rows.length === 0 ? (
        <p className="empty-note">Todavía no hay personal.</p>
      ) : (
        <div className="branch-rows">
          {rows.map((r) => (
            <div key={r.user_id || `inv-${r.email}`} className="branch-row">
              <div>
                <b>{r.pending ? r.email : (r.name || r.email)}</b>
                <span className="role-tag" style={{ marginLeft: 8 }}>{ROLE_LABEL[r.role]}</span>
                {r.pending && <span className="role-tag" style={{ marginLeft: 6, background: 'var(--amber)', color: 'var(--on-amber)' }}>Invitación pendiente</span>}
                {r.is_me && <span className="role-tag" style={{ marginLeft: 6 }}>Tú</span>}
                <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                  {r.pending ? 'Aún no se ha registrado' : r.name ? r.email : ''}
                </span>
                {!r.pending && ratings[r.user_id] && (
                  <span className="team-rating">
                    <Stars value={ratings[r.user_id].avg} />
                    <b>{ratings[r.user_id].avg.toFixed(1)}</b>
                    <small>{ratings[r.user_id].count} {ratings[r.user_id].count === 1 ? 'calificación' : 'calificaciones'}</small>
                    {ratings[r.user_id].last && <q>{ratings[r.user_id].last.comment}</q>}
                  </span>
                )}
              </div>
              {!r.is_me && (
                <div className="branch-actions">
                  {r.pending ? (
                    <button type="button" disabled={busy} onClick={() => cancelInvite(r)}>Cancelar invitación</button>
                  ) : (
                    <>
                      <select className="team-role-select" value={r.role} disabled={busy} onChange={(e) => changeRole(r, e.target.value)} aria-label={`Rol de ${r.name || r.email}`}>
                        {ROLE_ORDER.map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
                      </select>
                      <button type="button" disabled={busy} onClick={() => removeMember(r)}>Quitar</button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="branch-form">
        <h4 style={{ marginBottom: 10 }}>Agregar persona</h4>
        <div className="field">
          <label htmlFor="teamEmail">Correo</label>
          <input id="teamEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@correo.com" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="teamRole">Rol</label>
          <select id="teamRole" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_ORDER.map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
          </select>
          <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 6 }}>{ROLE_HELP[role]}</span>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
          Si la persona ya tiene cuenta, el cambio es inmediato. Si no, pídele que se registre con <b>ese mismo correo</b> y recibirá el rol al crear su cuenta.
        </p>
        {msg && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button type="submit" className="btn btn-amber" disabled={busy}>{busy ? 'Guardando…' : 'Agregar al equipo'}</button>
        </div>
      </form>
    </div>
  );
}
