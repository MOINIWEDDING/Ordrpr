'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGuestInfo } from '@/context/GuestInfoContext';
import GlowCard from './GlowCard';

const GENDERS = [
  { id: 'masculino', label: 'Masculino', hue: 210 },
  { id: 'femenino', label: 'Femenino', hue: 330 },
];

export default function GuestInfoGate({ onDone }) {
  const { setGender, setAge } = useGuestInfo();
  const [step, setStep] = useState('gender'); // 'gender' | 'age'
  const [ageInput, setAgeInput] = useState('');
  const [ageError, setAgeError] = useState('');

  function chooseGender(id) {
    setGender(id);
    setStep('age');
  }

  function submitAge(e) {
    e.preventDefault();
    const n = Number(ageInput);
    if (!ageInput || n < 1 || n > 120) { setAgeError('Escribe una edad válida.'); return; }
    setAge(n);
    if (onDone) onDone();
  }

  return (
    <motion.div className="branch-gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <AnimatePresence mode="wait">
        {step === 'gender' && (
          <motion.div
            key="gender"
            className="branch-gate-inner"
            initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <p className="eyebrow branch-gate-eyebrow">Un poco sobre ti</p>
            <h2 className="branch-gate-title">¿Cuál es tu sexo?</h2>
            <p className="branch-gate-sub">Nos ayuda a entender mejor a quién le servimos.</p>

            <div className="branch-gate-cards">
              {GENDERS.map((g) => (
                <GlowCard key={g.id} hue={g.hue} onClick={() => chooseGender(g.id)}>
                  <h3>{g.label}</h3>
                  <span className="branch-gate-cta">Elegir <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
                </GlowCard>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'age' && (
          <motion.div
            key="age"
            className="branch-gate-inner"
            initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <p className="eyebrow branch-gate-eyebrow">Ya casi</p>
            <h2 className="branch-gate-title">¿Cuántos años tienes?</h2>
            <p className="branch-gate-sub">Solo para completar tu información.</p>

            <form onSubmit={submitAge} className="branch-gate-cards" style={{ maxWidth: 320, margin: '0 auto' }}>
              <GlowCard as="div" hue={30} className="branch-gate-age-card">
                <input
                  type="number"
                  min="1"
                  max="120"
                  inputMode="numeric"
                  placeholder="Tu edad"
                  value={ageInput}
                  onChange={(e) => setAgeInput(e.target.value)}
                  autoFocus
                />
              </GlowCard>
              {ageError && <div className="form-msg show error" style={{ color: '#fff' }}>{ageError}</div>}
              <button type="submit" className="btn btn-amber btn-block">Continuar</button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
