'use client';
import { useCallback, useEffect, useState } from 'react';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useSettings } from '@/context/SettingsContext';

const ORDER = ['nuevo', 'conectado', 'postulado', 'certificando', 'certificado', 'activo', 'pausado'];
const reached = (status, step) => ORDER.indexOf(status === 'pausado' ? 'activo' : status) >= ORDER.indexOf(step);
const TYPE_LABEL = { 32: 'E32 · Consumo', 31: 'E31 · Crédito fiscal', 34: 'E34 · Nota de crédito', 33: 'E33 · Nota de débito' };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const pad10 = (n) => String(n).padStart(10, '0');

async function api(path, opts = {}) {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), authorization: `Bearer ${session ? session.access_token : ''}` } });
  return res;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Facturación electrónica paso a paso: cada restaurante conecta su propio RNC y certificado con Alanube,
// hace lo que pide la DGII y activa la emisión. Sin token de Alanube, todo funciona en modo de prueba.
export default function EcfSetup() {
  const { settings } = useSettings();
  const [ecf, setEcf] = useState(null);
  const [seqs, setSeqs] = useState([]);
  const [env, setEnv] = useState(null);
  const [counts, setCounts] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [cert, setCert] = useState(null);
  const [certPass, setCertPass] = useState('');
  const [seqForm, setSeqForm] = useState({ type: '32', from: '1', to: '', expires: '' });
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED) return;
    const [{ data: e, error }, { data: s }, { data: inv }] = await Promise.all([
      sb.from('ecf_settings').select('*').eq('id', 1).maybeSingle(),
      sb.from('ecf_sequences').select('*').order('created_at'),
      sb.from('invoices').select('ecf_status').not('ecf_status', 'is', null).gte('issued_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    ]);
    if (error) { setMsg({ type: 'error', text: /ecf_settings|schema cache/i.test(error.message) ? 'Falta actualizar la base de datos de este restaurante.' : error.message }); return; }
    setEcf(e || { status: 'nuevo', steps: {} });
    setSeqs(s || []);
    const c = {};
    (inv || []).forEach((x) => { c[x.ecf_status] = (c[x.ecf_status] || 0) + 1; });
    setCounts(c);
  }, []);

  useEffect(() => {
    load();
    fetch('/api/ecf/estado').then((r) => r.json()).then(setEnv).catch(() => setEnv({ env: 'simulado' }));
  }, [load]);

  async function run(label, fn) {
    setMsg(null);
    setBusy(label);
    try { await fn(); } catch (e) { setMsg({ type: 'error', text: e.message || 'No se pudo.' }); }
    setBusy('');
    load();
  }

  const connect = () => run('connect', async () => {
    if (!cert) throw new Error('Elige el archivo del certificado (.p12 o .pfx).');
    if (!certPass) throw new Error('Escribe la contraseña del certificado.');
    const content = await fileToBase64(cert);
    const res = await api('/api/ecf/conectar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ certificate: { name: cert.name, content, password: certPass } }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'No se pudo conectar.');
    setCertPass(''); setCert(null);
    setMsg({ type: 'ok', text: 'Listo: tu negocio quedó registrado en Alanube.' });
  });

  const markStep = (key, status) => run(key, async () => {
    const steps = { ...(ecf.steps || {}), [key]: new Date().toISOString() };
    const { error } = await sb.from('ecf_settings').update({ steps, ...(status ? { status } : {}), updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) throw error;
  });

  const setTest = (method) => run(`set-${method}`, async () => {
    const res = await api('/api/ecf/set-pruebas', { method });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'No se pudo.');
  });

  const sign = (file) => run('sign', async () => {
    const fd = new FormData();
    fd.append('xml', file);
    const res = await api('/api/ecf/firmar', { method: 'POST', body: fd });
    if (!res.ok) { const out = await res.json().catch(() => ({})); throw new Error(out.error || 'No se pudo firmar.'); }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${file.name.replace(/\.xml$/i, '')}-firmado.xml`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    setMsg({ type: 'ok', text: 'Documento firmado: súbelo a la Oficina Virtual de la DGII.' });
  });

  const addSeq = () => run('seq', async () => {
    const from = Number(seqForm.from); const to = Number(seqForm.to);
    if (!from || !to || to < from) throw new Error('Escribe el número desde y hasta que te autorizó la DGII.');
    const { error } = await sb.from('ecf_sequences').insert({ doc_type: seqForm.type, from_number: from, to_number: to, next_number: from, expires_on: seqForm.expires || null });
    if (error) throw error;
    setSeqForm({ type: seqForm.type, from: String(to + 1), to: '', expires: '' });
  });

  const removeSeq = (s) => run('seq', async () => {
    const { error } = await sb.from('ecf_sequences').delete().eq('id', s.id);
    if (error) throw error;
  });

  const setActive = (on) => run('active', async () => {
    const { error } = await sb.rpc('ecf_set_active', { active_input: on });
    if (error) throw error;
    setMsg({ type: 'ok', text: on ? 'Activado: cada factura nueva se envía sola a la DGII.' : 'Pausado: las facturas nuevas no se envían a la DGII.' });
  });

  const resend = () => run('resend', async () => {
    const res = await fetch('/api/ecf/emitir', { method: 'POST' });
    const out = await res.json().catch(() => ({}));
    setMsg({ type: 'ok', text: out.processed ? `Se procesaron ${out.processed} ${out.processed === 1 ? 'factura' : 'facturas'}.` : 'No había nada pendiente.' });
  });

  async function copy(text, key) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1600); } catch (e) { /* nada */ }
  }

  if (!ecf) return msg ? <div className={`form-msg show ${msg.type}`}>{msg.text}</div> : <p className="empty-note">Cargando…</p>;

  const status = ecf.status || 'nuevo';
  const dataOk = Boolean(settings.business_legal_name && /^([0-9]{9}|[0-9]{11})$/.test(String(settings.business_rnc || '').replace(/\D/g, '')) && settings.address);
  const urls = ecf.company_urls || {};
  const st = ecf.set_test || {};
  const has32 = seqs.some((s) => s.doc_type === '32' && s.next_number <= s.to_number);
  const steps = [
    { key: 'datos', done: dataOk },
    { key: 'conectado', done: reached(status, 'conectado') },
    { key: 'postulado', done: reached(status, 'postulado') },
    { key: 'certificado', done: reached(status, 'certificado') },
    { key: 'secuencias', done: has32 },
    { key: 'activo', done: status === 'activo' },
  ];
  const current = steps.findIndex((x) => !x.done);
  const stateOf = (i) => (steps[i].done ? 'done' : i === current ? 'now' : 'next');

  return (
    <div className="ecf">
      <div className={`ecf-mode is-${env ? env.env : 'simulado'}`}>
        <b>{!env ? '…' : env.env === 'simulado' ? 'Modo de prueba' : env.env === 'sandbox' ? 'Sandbox de Alanube' : 'Producción'}</b>
        <span>{!env ? '' : env.env === 'simulado' ? 'Todavía no hay token de Alanube: cada paso se simula para que veas el proceso. Nada llega a la DGII.' : env.env === 'sandbox' ? 'Conectado al ambiente de pruebas de Alanube y la DGII.' : 'Los comprobantes son reales ante la DGII.'}</span>
      </div>
      {msg && <div className={`form-msg show ${msg.type}`}>{msg.text}</div>}

      <ol className="ecf-steps">
        <li className={`ecf-step is-${stateOf(0)}`}>
          <StepHead n={1} title="Datos del negocio" done={steps[0].done} />
          <div className="ecf-body">
            <dl className="ecf-facts">
              <div><dt>Razón social</dt><dd>{settings.business_legal_name || <em>Falta</em>}</dd></div>
              <div><dt>RNC</dt><dd>{settings.business_rnc || <em>Falta</em>}</dd></div>
              <div><dt>Dirección</dt><dd>{settings.address || <em>Falta</em>}</dd></div>
            </dl>
            {!dataOk && <p className="ecf-note">Complétalos en <b>Facturación</b> (razón social y RNC) y en <b>Contacto y horario</b> (dirección). Deben ser los mismos que tiene la DGII.</p>}
          </div>
        </li>

        <li className={`ecf-step is-${stateOf(1)}`}>
          <StepHead n={2} title="Certificado digital" done={steps[1].done} />
          <div className="ecf-body">
            {ecf.company_id ? (
              <dl className="ecf-facts">
                <div><dt>Certificado</dt><dd>{ecf.certificate && ecf.certificate.name}</dd></div>
                {ecf.certificate && ecf.certificate.issuer && <div><dt>Emitido por</dt><dd>{ecf.certificate.issuer}</dd></div>}
                {ecf.certificate && ecf.certificate.end && <div><dt>Vence</dt><dd>{fmt(ecf.certificate.end)}</dd></div>}
                <div><dt>Empresa en Alanube</dt><dd className="ecf-mono">{ecf.company_id}</dd></div>
              </dl>
            ) : (
              <>
                <p className="ecf-note">El certificado de firma digital para procedimientos tributarios (lo venden entidades autorizadas como la Cámara de Comercio o Avansi). Va directo a Alanube; la contraseña no se guarda aquí.</p>
                <label className={`ecf-file${cert ? ' has-file' : ''}`}>
                  <input type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={(e) => setCert(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M9.5 15l2 2 3.5-4" /></svg>
                  <span>{cert ? cert.name : 'Elegir certificado (.p12 o .pfx)'}</span>
                </label>
                <div className="tfield">
                  <input id="ecfPass" type="password" placeholder=" " autoComplete="off" value={certPass} onChange={(e) => setCertPass(e.target.value)} />
                  <label htmlFor="ecfPass">Contraseña del certificado</label>
                </div>
                <button type="button" className="btn btn-amber" onClick={connect} disabled={!dataOk || busy === 'connect'}>{busy === 'connect' ? 'Conectando…' : 'Conectar con Alanube'}</button>
              </>
            )}
          </div>
        </li>

        <li className={`ecf-step is-${stateOf(2)}`}>
          <StepHead n={3} title="Postulación en la DGII" done={steps[2].done} />
          {reached(status, 'conectado') && (
            <div className="ecf-body">
              <ol className="ecf-howto">
                <li>Entra a la <b>Oficina Virtual de la DGII</b> con el usuario del negocio.</li>
                <li>Ve a <b>Facturación electrónica → Postulación</b> y elige <b>proveedor de servicios: Alanube</b>.</li>
                <li>Cuando te pida las direcciones del sistema, pega estas tres:</li>
              </ol>
              <div className="ecf-urls">
                {[['reception', 'Recepción'], ['approval', 'Aprobación comercial'], ['authentication', 'Autenticación']].map(([k, label]) => urls[k] && (
                  <button key={k} type="button" className="ecf-url" onClick={() => copy(urls[k], k)}>
                    <small>{label}</small>
                    <span>{urls[k]}</span>
                    <b>{copied === k ? 'Copiada' : 'Copiar'}</b>
                  </button>
                ))}
              </div>
              {!reached(status, 'postulado') && <button type="button" className="btn btn-ghost" onClick={() => markStep('postulado', 'postulado')} disabled={!!busy}>Ya me postulé y registré las direcciones</button>}
            </div>
          )}
        </li>

        <li className={`ecf-step is-${stateOf(3)}`}>
          <StepHead n={4} title="Certificación como emisor" done={steps[3].done} />
          {reached(status, 'postulado') && (
            <div className="ecf-body">
              <div className="ecf-card">
                <div>
                  <b>Set de pruebas</b>
                  <span>{st.id ? `${st.status === 'FINISHED' ? 'Terminado' : 'En proceso'}${st.last && st.last.documents ? ` · ${st.last.documents.accepted} de ${st.last.documents.total} aceptados` : ''}` : 'Alanube envía a la DGII los comprobantes de prueba que pide la certificación.'}</span>
                </div>
                <div className="ecf-card-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTest('POST')} disabled={!!busy}>{busy === 'set-POST' ? 'Generando…' : st.id ? 'Generar otra vez' : 'Generar set de pruebas'}</button>
                  {st.id && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTest('GET')} disabled={!!busy}>{busy === 'set-GET' ? 'Revisando…' : 'Revisar estado'}</button>}
                </div>
              </div>
              <div className="ecf-card">
                <div>
                  <b>Firmar documentos de la DGII</b>
                  <span>Sube el XML que te pide la DGII (por ejemplo la declaración jurada) y descárgalo firmado para subirlo de vuelta.</span>
                </div>
                <label className="btn btn-ghost btn-sm ecf-sign">
                  <input type="file" accept=".xml,text/xml,application/xml" onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) sign(f); }} />
                  {busy === 'sign' ? 'Firmando…' : 'Subir XML para firmar'}
                </label>
              </div>
              {!reached(status, 'certificado') && <button type="button" className="btn btn-ghost" onClick={() => markStep('certificado', 'certificado')} disabled={!!busy}>La DGII ya me aprobó como emisor electrónico</button>}
            </div>
          )}
        </li>

        <li className={`ecf-step is-${stateOf(4)}`}>
          <StepHead n={5} title="Secuencias e-NCF" done={steps[4].done} />
          {reached(status, 'conectado') && (
            <div className="ecf-body">
              <p className="ecf-note">Los rangos que te autorizó la DGII en la Oficina Virtual (Solicitud de secuencias). La app usa los números en orden.</p>
              {seqs.length > 0 && (
                <ul className="ecf-seqs">
                  {seqs.map((s) => {
                    const used = s.next_number - s.from_number;
                    const total = s.to_number - s.from_number + 1;
                    const left = total - used;
                    return (
                      <li key={s.id} className={left <= Math.max(10, total * 0.1) ? 'is-low' : ''}>
                        <div className="ecf-seq-top">
                          <b>{TYPE_LABEL[s.doc_type]}</b>
                          <span className="ecf-mono">E{s.doc_type}{pad10(s.from_number)} – E{s.doc_type}{pad10(s.to_number)}</span>
                        </div>
                        <span className="ecf-seq-bar"><i style={{ width: `${(used / total) * 100}%` }} /></span>
                        <div className="ecf-seq-foot">
                          <span>{left.toLocaleString('es-DO')} disponibles{s.expires_on ? ` · vence ${fmt(s.expires_on)}` : ''}</span>
                          {used === 0 && <button type="button" onClick={() => removeSeq(s)} disabled={!!busy}>Quitar</button>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="ecf-seq-form">
                <div className="ecf-seq-types" role="radiogroup" aria-label="Tipo">
                  {['32', '31', '34'].map((t) => <button key={t} type="button" role="radio" aria-checked={seqForm.type === t} className={seqForm.type === t ? 'on' : ''} onClick={() => setSeqForm({ ...seqForm, type: t })}>E{t}</button>)}
                </div>
                <div className="ecf-seq-row">
                  <div className="tfield is-small"><input id="seqFrom" inputMode="numeric" placeholder=" " value={seqForm.from} onChange={(e) => setSeqForm({ ...seqForm, from: e.target.value.replace(/\D/g, '') })} /><label htmlFor="seqFrom">Desde</label></div>
                  <div className="tfield is-small"><input id="seqTo" inputMode="numeric" placeholder=" " value={seqForm.to} onChange={(e) => setSeqForm({ ...seqForm, to: e.target.value.replace(/\D/g, '') })} /><label htmlFor="seqTo">Hasta</label></div>
                  <div className="tfield is-small"><input id="seqExp" type="date" placeholder=" " value={seqForm.expires} onChange={(e) => setSeqForm({ ...seqForm, expires: e.target.value })} /><label htmlFor="seqExp">Vence</label></div>
                </div>
                <button type="button" className="btn btn-ghost" onClick={addSeq} disabled={!!busy}>Agregar secuencia E{seqForm.type}</button>
              </div>
            </div>
          )}
        </li>

        <li className={`ecf-step is-${stateOf(5)}`}>
          <StepHead n={6} title="Emitir comprobantes electrónicos" done={steps[5].done} />
          {reached(status, 'conectado') && (
            <div className="ecf-body">
              {status === 'activo' ? (
                <>
                  <p className="ecf-note">Cada factura nueva se envía sola a la DGII: <b>E31</b> si lleva RNC y <b>E32</b> si es de consumo.</p>
                  {counts && (
                    <div className="ecf-counts">
                      <span><b>{(counts.aceptado || 0) + (counts.aceptado_obs || 0)}</b> aceptados</span>
                      <span><b>{(counts.pendiente || 0) + (counts.enviando || 0) + (counts.enviado || 0)}</b> en proceso</span>
                      <span className={counts.rechazado || counts.error ? 'is-bad' : ''}><b>{(counts.rechazado || 0) + (counts.error || 0)}</b> con problema</span>
                      <small>últimos 30 días</small>
                    </div>
                  )}
                  <div className="ecf-card-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={resend} disabled={!!busy}>{busy === 'resend' ? 'Enviando…' : 'Enviar pendientes ahora'}</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setActive(false)} disabled={!!busy}>Pausar</button>
                  </div>
                </>
              ) : (
                <>
                  {!reached(status, 'certificado') && <p className="ecf-note">Actívalo cuando la DGII te haya aprobado. {ecf.simulated ? 'En modo de prueba puedes activarlo ya para ver cómo quedan las facturas.' : ''}</p>}
                  <button type="button" className="btn btn-amber" onClick={() => setActive(true)} disabled={!!busy || !has32 || (!reached(status, 'certificado') && !ecf.simulated)}>{busy === 'active' ? 'Activando…' : 'Activar facturación electrónica'}</button>
                  {!has32 && <p className="ecf-note">Agrega primero la secuencia E32.</p>}
                </>
              )}
            </div>
          )}
        </li>
      </ol>
    </div>
  );
}

function StepHead({ n, title, done }) {
  return (
    <div className="ecf-step-head">
      <span className="ecf-dot" aria-hidden="true">{done ? <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg> : n}</span>
      <b>{title}</b>
    </div>
  );
}
