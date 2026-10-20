'use client';
import StampIcon from './StampIcon';

// El pase tal como se ve en Apple Wallet: logo y sellos arriba, la franja con los sellos y,
// debajo, cuánto falta y el premio. Lo usan /pase y la vista previa del dueño.
export default function LoyaltyPassCard({ s, brand, brandLogo, stamps = 0, rewardsReady = 0, customer, animateLast = false }) {
  const total = Math.max(1, Number(s.stamps_required) || 8);
  const filled = Math.min(stamps, total);
  const left = total - filled;
  const logo = s.logo_url || brandLogo;
  const rows = total > 10 ? 2 : 1;
  const perRow = Math.ceil(total / rows);
  return (
    <div className="lp" style={{ '--lp-bg': s.bg_color, '--lp-fg': s.fg_color, '--lp-label': s.label_color, '--lp-stamp': s.stamp_color }}>
      <div className="lp-head">
        <div className="lp-brand">
          {logo
            ? <img src={logo} alt="" className="lp-logo" />
            : <span className="lp-initial">{(brand || '•').trim().charAt(0).toUpperCase()}</span>}
          <span className="lp-logotext">{logo ? s.title : brand}</span>
        </div>
        <div className="lp-field lp-field-right">
          <span className="lp-label">Sellos</span>
          <span className="lp-value">{filled}/{total}</span>
        </div>
      </div>

      <div className="lp-strip">
        {s.strip_image_url && <img src={s.strip_image_url} alt="" className="lp-strip-photo" />}
        <div className="lp-stamps" style={{ '--per-row': perRow }}>
          {Array.from({ length: total }, (_, i) => {
            const on = i < filled;
            return (
              <span key={i} className={`lp-stamp${on ? ' on' : ''}${on && animateLast && i === filled - 1 ? ' pop' : ''}`}>
                {on && (s.stamp_image_url
                  ? <img src={s.stamp_image_url} alt="" />
                  : <StampIcon name={s.stamp_icon} color="#fff" strokeWidth={3.4} />)}
              </span>
            );
          })}
        </div>
      </div>

      <div className="lp-fields">
        <div className="lp-field">
          <span className="lp-label">{rewardsReady ? (rewardsReady === 1 ? 'Premio listo' : 'Premios listos') : 'Te faltan'}</span>
          <span className="lp-value">{rewardsReady ? (rewardsReady === 1 ? '¡Ya puedes usarlo!' : rewardsReady) : `${left} ${left === 1 ? 'sello' : 'sellos'}`}</span>
        </div>
        <div className="lp-field">
          <span className="lp-label">Premio</span>
          <span className="lp-value">{s.reward_label}</span>
        </div>
      </div>
      {customer && <div className="lp-customer">{customer}</div>}
    </div>
  );
}
