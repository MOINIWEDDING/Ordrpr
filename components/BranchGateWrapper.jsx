'use client';
import { AnimatePresence } from 'framer-motion';
import { useBranch } from '@/context/BranchContext';
import BranchGate from './BranchGate';

export default function BranchGateWrapper() {
  const { branch, branches, ready } = useBranch();

  if (!ready) return null;
  const show = !branch && branches.length > 1;

  return (
    <AnimatePresence>
      {show && <BranchGate />}
    </AnimatePresence>
  );
}
