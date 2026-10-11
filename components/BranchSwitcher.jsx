'use client';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useBranch } from '@/context/BranchContext';
import BranchGate from './BranchGate';

export default function BranchSwitcher({ light = false }) {
  const { branchInfo } = useBranch();
  const [switching, setSwitching] = useState(false);
  return (
    <>
      <div className={`branch-indicator${light ? ' light' : ''}`}>
        <span>📍 {branchInfo ? branchInfo.full : 'Sin sucursal elegida'}</span>
        <button type="button" onClick={() => setSwitching(true)}>Cambiar</button>
      </div>
      <AnimatePresence>
        {switching && <BranchGate allowClose onClose={() => setSwitching(false)} />}
      </AnimatePresence>
    </>
  );
}
