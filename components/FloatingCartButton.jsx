'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';

export default function FloatingCartButton() {
  const { count, openDrawer } = useCart();
  const { profile } = useAuth();
  const pathname = usePathname();
  const hide = pathname === '/cuenta' && !profile;

  return (
    <AnimatePresence>
      {count > 0 && !hide && (
        <motion.button
          type="button"
          className="fab-cart"
          aria-label="Ver carrito"
          onClick={openDrawer}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        >
          <svg viewBox="0 0 24 24"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" /></svg>
          <span className="fab-cart-badge">{count}</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
