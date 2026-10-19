import MenuCarta from '@/components/MenuCarta';
import BrandName from '@/components/BrandName';
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

      <footer>
        <div className="wrap footer-bottom" style={{ border: 'none', paddingTop: 0 }}>
          <span>© {new Date().getFullYear()} <BrandName />. Todos los derechos reservados.</span>
          <span><a href="/">Volver al inicio</a></span>
        </div>
      </footer>
    </>
  );
}
