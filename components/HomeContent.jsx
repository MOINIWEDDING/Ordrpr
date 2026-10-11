'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCategories } from '@/hooks/useCategories';
import OffersCarousel from './OffersCarousel';
import CategoryCarousels from './CategoryCarousels';
import ProductIcon from './ProductIcon';
import Reveal from './Reveal';
import { useSettings } from '@/context/SettingsContext';

const SEEN_KEY = 'rp-welcome-seen';

export default function HomeContent() {
  const { categories } = useCategories();
  const { profile } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();

  useEffect(() => {
    let seen = false;
    try { seen = window.sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) { /* ignore */ }
    if (!profile && !seen) {
      try { window.sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* ignore */ }
      router.push('/cuenta');
    }
  }, [profile, router]);

  return (
    <>
      <section className="home-top">
        <div className="wrap">
          <div className="home-greet">Bienvenido a<strong>{settings.brand_name}</strong></div>

          <OffersCarousel />

          <Reveal as="div" className="cat-row">
            {categories.map((c) => (
              <Link key={c.id} className="cat-item" href={`/menu?cat=${encodeURIComponent(c.name)}`}>
                <div className="cat-icon" style={{ background: `var(--tint-${c.tint})` }}>
                  <ProductIcon name={c.icon} />
                </div>
                <span>{c.name}</span>
              </Link>
            ))}
          </Reveal>
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="wrap">
          <CategoryCarousels limit={null} showAddCategory />
        </div>
      </section>
    </>
  );
}
