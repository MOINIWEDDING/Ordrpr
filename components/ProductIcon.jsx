'use client';

const PATHS = {
  flame: <><path d="M24 6c6 8 11 15 11 22a11 11 0 0 1-22 0c0-3 1-6 3-9-.5 3.5 1 6 3.5 6s3.5-2.3 2.6-5.4c-1.2-4-.4-8.3 2.9-13.6z" /></>,
  meat: <><path d="M14 12a11 11 0 0 1 15.5 15.5L19 38c-3 3-8 3-10.6.4S5.9 31.4 9 28z" /><circle cx="33.5" cy="37.5" r="3" /></>,
  ribs: <><path d="M8 12c8-4 24-4 32 0" /><path d="M9 20c8-3 22-3 30 0" /><path d="M10 28c7-3 20-3 27 0" /><path d="M12 36c6-2 16-2 22 0" /></>,
  sausage: <><path d="M8 30c-3-7 1-16 11-18 11-2 21 3 25 12 3 7-2 13-10 14-10 2-21-1-24-6-1-1-2-1-2-2z" /><path d="M18 14c2 3 2 6 0 9M29 13c2 4 2 8-1 12" /></>,
  smoker: <><rect x="7" y="19" width="28" height="15" rx="7.5" /><path d="M35 22h3.5a3.5 3.5 0 0 1 0 7H35" /><path d="M13 34v5M29 34v5" /><path d="M24 12v6" /></>,
  drink: <><path d="M15 14h18l-2 22a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3z" /><path d="M18.5 14l1-6h9l1 6" /></>,
  side: <><ellipse cx="24" cy="19" rx="16" ry="5" /><path d="M8 19v4a16 6 0 0 0 32 0v-4" /></>,
  sauce: <><rect x="16" y="17" width="16" height="21" rx="4" /><path d="M20 17v-5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5" /></>,
  dessert: <><path d="M7 33 24 10l17 23z" /><path d="M11 29h26M14.5 25h19" opacity=".7" /></>,
  star: <><path d="M24 6l5.5 12L42 20l-9.5 8.5L35 41l-11-6.5L13 41l2.5-12.5L6 20l12.5-2z" /></>,
};

export default function ProductIcon({ name = 'smoker', ...rest }) {
  return (
    <svg viewBox="0 0 48 48" {...rest}>
      {PATHS[name] || PATHS.smoker}
    </svg>
  );
}

export const ICON_KEYS = Object.keys(PATHS);
