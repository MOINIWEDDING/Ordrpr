'use client';

// Imprime solo el ticket (el elemento con la clase print-target) con el diálogo del navegador.
export function printReceipt() {
  document.body.classList.add('printing-receipt');
  const done = () => { document.body.classList.remove('printing-receipt'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}
