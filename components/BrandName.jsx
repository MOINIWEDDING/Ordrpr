'use client';
import { useSettings } from '@/context/SettingsContext';

export default function BrandName() {
  const { settings } = useSettings();
  return <>{settings.brand_name}</>;
}
