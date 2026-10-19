'use client';
import { promoSummary, promoWindow } from '@/lib/promo';

// Un código promocional dibujado como un cupón: el código a la izquierda y, detrás de la línea
// perforada, el estado y los canjes. Se usa en la lista de /promociones y como vista previa del formulario.
export default function PromoTicket({ promo, itemName, status, uses = 0, onClick, preview = false }) {
  const Tag = onClick ? 'button' : 'div';
  const limit = Number(promo.max_uses) || 0;
  const pct = limit ? Math.min(100, (uses / limit) * 100) : 0;
  return (
    <Tag
      {...(onClick ? { type: 'button', onClick } : {})}
      className={`promo-ticket is-${status ? status.id : 'active'}${preview ? ' is-preview' : ''}`}
    >
      <span className="promo-ticket-main">
        <span className="promo-ticket-code">{promo.code || 'CODIGO'}</span>
        <span className="promo-ticket-what">{promoSummary(promo, itemName)}</span>
        {promo.title ? <span className="promo-ticket-title">{promo.title}</span> : null}
        <span className="promo-ticket-when">{promoWindow(promo)}</span>
      </span>
      <span className="promo-ticket-stub">
        {status && <span className={`promo-pill is-${status.id}`}>{status.label}</span>}
        <span className="promo-ticket-uses">
          <b>{uses}</b>
          <small>{limit ? `de ${limit}` : uses === 1 ? 'canje' : 'canjes'}</small>
        </span>
        {limit > 0 && <span className="promo-ticket-meter"><i style={{ width: `${pct}%` }} /></span>}
      </span>
    </Tag>
  );
}
