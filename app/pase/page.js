'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { sb, BARRO_CONFIGURED } from '@/lib/supabaseClient';
import { useLoyaltySettings, useWalletStatus } from '@/lib/loyalty';
import LoyaltyPassCard from '@/components/LoyaltyPassCard';

const shortDate = (d) => new Date(d).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');

export default function PasePage() {
  const { profile, authReady, openAuth } = useAuth();
  const { settings } = useSettings();
  const { loyalty: s, loaded } = useLoyaltySettings();
  const wallet = useWalletStatus();
  const [card, setCard] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    if (!BARRO_CONFIGURED || !profile) return;
    const { data, error: err } = await sb.rpc('my_loyalty');
    if (err) { setError('No se pudo cargar tu pase.'); return; }
    setCard(data);
  }, [profile]);
  useEffect(() => { if (s.enabled) load(); }, [s.enabled, load]);

  function copy(code) {
    try { navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(''), 1400); } catch (e) { /* sin portapapeles */ }
  }

  if (!loaded || !authReady) return <section className="pase-page"><div className="wrap"><p className="empty-note">Cargando…</p></div></section>;

  if (!s.enabled) {
    return (
      <section className="pase-page">
        <div className="wrap pase-off">
          <h2>Este local todavía no tiene pase de sellos</h2>
          <Link href="/menu" className="btn btn-amber">Ver el menú</Link>
        </div>
      </section>
    );
  }

  const ready = card ? card.rewards.filter((r) => !r.used && (!r.ends_at || new Date(r.ends_at) > new Date())) : [];
  const past = card ? card.rewards.filter((r) => !ready.includes(r)) : [];
  const left = card ? s.stamps_required - card.stamps : s.stamps_required;

  return (
    <section className="pase-page">
      <div className="wrap pase-wrap">
        <div className="pase-card-col">
          <LoyaltyPassCard
            s={s} brand={settings.brand_name} brandLogo={settings.logo_url}
            stamps={card ? card.stamps : 0} rewardsReady={ready.length}
            customer={profile ? profile.name : ''}
          />
          {profile && card && wallet && wallet.enabled && (
            <a className="wallet-btn" href={`/api/wallet/pass?serial=${card.serial}&token=${card.auth_token}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 9h18M3 13h18" /></svg>
              <span><small>Agregar a</small>Apple Wallet</span>
            </a>
          )}
        </div>

        <div className="pase-info">
          <p className="eyebrow">{settings.brand_name}</p>
          <h2>{s.title}</h2>
          {!profile ? (
            <div className="pase-login">
              <p>Inicia sesión para juntar sellos con cada pedido.</p>
              <button type="button" className="btn btn-amber" onClick={() => openAuth('signup', 'cliente')}>Crear cuenta</button>
              <button type="button" className="btn btn-ghost" onClick={() => openAuth('login', 'cliente')}>Ya tengo cuenta</button>
            </div>
          ) : error ? (
            <div className="form-msg show error">{error}</div>
          ) : !card ? (
            <p className="empty-note">Cargando tu pase…</p>
          ) : (
            <>
              <p className="pase-progress">
                {left === s.stamps_required && !card.total_stamps
                  ? `Haz tu primer pedido y empieza a juntar sellos. Con ${s.stamps_required}: ${s.reward_label.toLowerCase()}.`
                  : `Te ${left === 1 ? 'falta 1 sello' : `faltan ${left} sellos`} para ${s.reward_label.toLowerCase()}.`}
              </p>

              {ready.length > 0 && (
                <div className="pase-rewards">
                  {ready.map((r) => (
                    <div key={r.code} className="pase-reward">
                      <span className="pase-reward-title">{r.title}</span>
                      <button type="button" className="pase-reward-code" onClick={() => copy(r.code)}>
                        {r.code}
                        <small>{copied === r.code ? 'Copiado' : 'Copiar'}</small>
                      </button>
                      <span className="pase-reward-foot">Úsalo en el carrito{r.ends_at ? ` · vence el ${shortDate(r.ends_at)}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}

              {s.description && <p className="pase-desc">{s.description}</p>}

              <dl className="pase-stats">
                <div><dt>Sellos en total</dt><dd>{card.total_stamps}</dd></div>
                <div><dt>Premios ganados</dt><dd>{card.rewards_earned}</dd></div>
              </dl>

              {card.events.length > 0 && (
                <ul className="pase-history">
                  {card.events.map((e, i) => (
                    <li key={i}>
                      <span className={`pase-history-dot is-${e.kind}`} />
                      <span>{e.kind === 'reward' ? 'Completaste el pase' : e.kind === 'manual' ? 'Sello del local' : 'Sello por tu pedido'}</span>
                      <small>{shortDate(e.created_at)}</small>
                    </li>
                  ))}
                </ul>
              )}

              {past.length > 0 && (
                <p className="pase-past">Premios usados o vencidos: {past.map((r) => r.code).join(', ')}</p>
              )}
            </>
          )}
          {s.terms && <p className="pase-terms">{s.terms}</p>}
        </div>
      </div>
    </section>
  );
}
