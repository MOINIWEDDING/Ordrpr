'use client';
import { useState, useEffect, useCallback } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';

const ROLE_LABEL = { staff: 'Dueño', comensal: 'Comensal' };
const ROLE_HELP = {
  staff: 'Dueño: acceso total (menú, configuración, equipo, estadísticas y órdenes).',
  comensal: 'Comensal: solo ve y atiende las Órdenes.',
};

export default function TeamManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('comensal');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok' | 'error', text }

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) { setRows([]); setLoading(false); return; }
    const { data, error } = await sb.rpc('team_list');
    if (error) setMsg({ type: 'error', text: error.message });
    else setRows(data || []);
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

  const changeRole = (r) => run(
    () => sb.rpc('team_set_role', { p_user: r.user_id, p_role: r.role === 'staff' ? 'comensal' : 'staff' }),
    'Rol actualizado.',
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
              </div>
              {!r.is_me && (
                <div className="branch-actions">
                  {r.pending ? (
                    <button type="button" disabled={busy} onClick={() => cancelInvite(r)}>Cancelar invitación</button>
                  ) : (
                    <>
                      <button type="button" disabled={busy} onClick={() => changeRole(r)}>
                        {r.role === 'staff' ? 'Pasar a comensal' : 'Hacer dueño'}
                      </button>
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
            <option value="comensal">Comensal (solo Órdenes)</option>
            <option value="staff">Dueño (acceso total)</option>
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
