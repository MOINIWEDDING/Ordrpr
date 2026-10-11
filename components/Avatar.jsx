'use client';
import ProductIcon from './ProductIcon';

export const AVATAR_OPTIONS = [
  { icon: 'smoker', tint: 'manana' },
  { icon: 'flame', tint: 'tarde' },
  { icon: 'meat', tint: 'salado' },
  { icon: 'ribs', tint: 'experiencia' },
  { icon: 'star', tint: 'manana' },
  { icon: 'side', tint: 'experiencia' },
  { icon: 'sausage', tint: 'salado' },
  { icon: 'drink', tint: 'tarde' },
  { icon: 'dessert', tint: 'manana' },
  { icon: 'sauce', tint: 'experiencia' },
];

function initials(name) {
  const clean = (name || '').trim();
  if (!clean) return null;
  const letters = clean.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return letters || null;
}

export default function Avatar({ profile, size = 56 }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };

  if (profile && profile.avatar_url) {
    return (
      <div className="profile-av" style={{ ...style, background: 'var(--cream-2)', overflow: 'hidden', padding: 0 }}>
        <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  const hasIconAvatar = profile && profile.avatar_icon && profile.avatar_icon !== 'user';
  if (hasIconAvatar) {
    return (
      <div className="profile-av" style={{ ...style, background: `var(--tint-${profile.avatar_tint || 'manana'})` }}>
        <ProductIcon name={profile.avatar_icon} style={{ width: '46%', height: '46%', stroke: 'var(--ink)', fill: 'none', strokeWidth: 1.8 }} />
      </div>
    );
  }

  const letters = initials(profile && profile.name);
  return (
    <div className="profile-av" style={style}>
      {letters || (
        <svg viewBox="0 0 24 24" style={{ width: '46%', height: '46%', stroke: '#fff', fill: 'none', strokeWidth: 1.8 }}>
          <circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </svg>
      )}
    </div>
  );
}
