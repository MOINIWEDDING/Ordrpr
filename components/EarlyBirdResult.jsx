'use client';
import { motion } from 'framer-motion';

const CONFETTI_COLORS = ['#C2632A', '#9C4E20', '#4B5A3A', '#8C4A34', '#F5E3C8'];

export default function EarlyBirdResult({ type, prize, discountApplied, onClose }) {
  if (type === 'winner') {
    return (
      <div className="order-success eb-winner">
        <div className="eb-confetti-wrap" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, i) => (
            <motion.span
              key={i}
              className="eb-confetti-piece"
              style={{
                left: `${(i * 53) % 100}%`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              }}
              initial={{ y: -20, opacity: 0, rotate: 0 }}
              animate={{ y: 260, opacity: [0, 1, 1, 0], rotate: 360 }}
              transition={{ duration: 1.8 + (i % 5) * 0.15, delay: i * 0.05, ease: 'easeIn' }}
            />
          ))}
        </div>

        <motion.div
          className="eb-cup"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
        >
          🥤
        </motion.div>

        <motion.h3 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          ¡Eres el Early Bird de hoy!
        </motion.h3>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          {discountApplied
            ? <>Ganaste: <b>{prize}</b> — ya se lo descontamos a tu pedido.</>
            : <>Ganaste: <b>{prize}</b>. No lo tenías en tu pedido, así que pregunta en la barra cómo canjearlo.</>}
        </motion.p>

        <button type="button" className="btn btn-amber btn-block" style={{ marginTop: 22 }} onClick={onClose}>Genial</button>
      </div>
    );
  }

  return (
    <div className="order-success eb-nearmiss">
      <motion.div
        className="eb-cup eb-cup-small"
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        🥤
      </motion.div>
      <motion.h3 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        ¡Llegaste a tiempo para el Early Bird!
      </motion.h3>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
        Justo hoy alguien más se adelantó. Vuelve mañana en el mismo horario para intentarlo otra vez.
      </motion.p>
      <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 20 }} onClick={onClose}>Entendido</button>
    </div>
  );
}
