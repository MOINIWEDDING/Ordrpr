import { Outfit, Urbanist } from 'next/font/google';
import './globals.css';
import { SettingsProvider } from '@/context/SettingsContext';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { CartProvider } from '@/context/CartContext';
import { FavoritesProvider } from '@/context/FavoritesContext';
import { OrdersNotifyProvider } from '@/context/OrdersNotifyContext';
import { BranchProvider } from '@/context/BranchContext';
import { GuestInfoProvider } from '@/context/GuestInfoContext';
import { CurrencyProvider } from '@/context/CurrencyContext';
import BodyAdminSync from '@/components/BodyAdminSync';
import StaffBanner from '@/components/StaffBanner';
import SetupBanner from '@/components/SetupBanner';
import Header from '@/components/Header';
import Tabbar from '@/components/Tabbar';
import AuthModal from '@/components/AuthModal';
import CartDrawer from '@/components/CartDrawer';
import FloatingCartButton from '@/components/FloatingCartButton';
import OrderNotifier from '@/components/OrderNotifier';
import GiftCardNotifier from '@/components/GiftCardNotifier';
import GiftReceivedNotifier from '@/components/GiftReceivedNotifier';
import OrderStatusNotifier from '@/components/OrderStatusNotifier';
import BranchGateWrapper from '@/components/BranchGateWrapper';
import { getServerSettings } from '@/lib/serverSettings';
import { themeCss } from '@/lib/theme';

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-outfit', display: 'swap' });
const urbanist = Urbanist({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-urbanist', display: 'swap' });

export async function generateMetadata() {
  const s = await getServerSettings();
  const desc = s.description || (s.tagline ? `${s.brand_name} — ${s.tagline}` : `Haz tu pedido en línea en ${s.brand_name}.`);
  return {
    title: { default: s.tagline ? `${s.brand_name} — ${s.tagline}` : s.brand_name, template: `%s — ${s.brand_name}` },
    description: desc,
    icons: { icon: s.logo_url || '/favicon.svg' },
  };
}

export const viewport = {
  themeColor: '#FBF8F2',
  viewportFit: 'cover',
};

export default async function RootLayout({ children }) {
  const settings = await getServerSettings();
  return (
    <html lang="es" className={`${outfit.variable} ${urbanist.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss(settings.primary_color, settings.background_color) }} />
      </head>
      <body>
        <SettingsProvider initial={settings}>
        <CurrencyProvider>
        <AuthProvider>
          <FavoritesProvider>
            <CartProvider>
              <ToastProvider>
                <OrdersNotifyProvider>
                  <BranchProvider>
                    <GuestInfoProvider>
                      <BodyAdminSync />
                      <StaffBanner />
                      <SetupBanner />
                      <Header />
                      {children}
                      <Tabbar />
                      <FloatingCartButton />
                      <AuthModal />
                      <CartDrawer />
                      <OrderNotifier />
                      <GiftCardNotifier />
                      <GiftReceivedNotifier />
                      <OrderStatusNotifier />
                      <BranchGateWrapper />
                    </GuestInfoProvider>
                  </BranchProvider>
                </OrdersNotifyProvider>
              </ToastProvider>
            </CartProvider>
          </FavoritesProvider>
        </AuthProvider>
        </CurrencyProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
