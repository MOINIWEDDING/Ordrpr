'use client';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function BodyAdminSync() {
  const { isStaff } = useAuth();
  useEffect(() => {
    document.body.classList.toggle('admin-on', isStaff);
  }, [isStaff]);
  return null;
}
