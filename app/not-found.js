import Link from 'next/link';

export const metadata = { title: 'Página no encontrada' };

export default function NotFound() {
  return (
    <section className="not-found">
      <span className="not-found-code">404</span>
      <h2>Esta página no existe</h2>
      <Link href="/" className="btn btn-amber">Ir al inicio</Link>
    </section>
  );
}
