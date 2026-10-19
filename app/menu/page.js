import MenuCarta from '@/components/MenuCarta';
import CurrencySwitcher from '@/components/CurrencySwitcher';

export const metadata = { title: 'Menú' };

export default function MenuPage() {
  return (
    <>
      <section className="menu-page-body" style={{ paddingTop: 28 }}>
        <div className="wrap">
          <CurrencySwitcher idSuffix="menu" className="page-currency" />
          <MenuCarta />
        </div>
      </section>
    </>
  );
}
