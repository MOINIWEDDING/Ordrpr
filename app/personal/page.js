'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import TeamManager from '@/components/TeamManager';
import TeamPerformance from '@/components/TeamPerformance';

const TABS = [
  { id: 'personas', label: 'Personas' },
  { id: 'rendimiento', label: 'Rendimiento' },
  { id: 'aparatos', label: 'Aparatos del local' },
];

// Todo lo del equipo en un solo lugar (solo el dueño): las personas con su rol, PIN, estrellas y strikes;
// cómo le fue a cada una en el mes; y las tablets o teléfonos del local donde entran con su PIN.
export default function EquipoPage() {
  const router = useRouter();
  const { profile, authReady, isStaff } = useAuth();
  const { settings } = useSettings();
  const [tab, setTab] = useState('personas');

  useEffect(() => { if (authReady && profile && !isStaff) router.push('/'); }, [authReady, profile, isStaff, router]);
  if (!profile || !isStaff) return null;

  return (
    <section className="acc-page team-page">
      <div className="acc-wrap">
        <div className="acc-head">
          <div>
            <p className="eyebrow">{settings.brand_name}</p>
            <h2>Equipo</h2>
          </div>
          <Link href="/equipo" className="acc-btn">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M10 17h4" /></svg>
            Pantalla del equipo
          </Link>
        </div>
        <div className="acc-views" role="tablist" aria-label="Equipo">
          {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>
        <div className="team-page-body">
          {tab === 'personas' && <TeamManager section="people" />}
          {tab === 'rendimiento' && <TeamPerformance />}
          {tab === 'aparatos' && <TeamManager section="devices" />}
        </div>
      </div>
    </section>
  );
}
