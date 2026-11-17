'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useSettings } from '@/context/SettingsContext';
import { printReceipt } from '@/lib/printReceipt';
import Modal from './Modal';

// Los códigos QR de las mesas, listos para imprimir: cada uno abre /mesa/<id> para abrir la cuenta.
export default function TableQrSheet({ tables, onClose }) {
  const { settings } = useSettings();
  const [codes, setCodes] = useState({});

  useEffect(() => {
    const origin = window.location.origin;
    Promise.all(tables.map(async (t) => [t.id, await QRCode.toDataURL(`${origin}/mesa/${t.id}`, { margin: 1, width: 360, errorCorrectionLevel: 'M' })]))
      .then((pairs) => setCodes(Object.fromEntries(pairs)));
  }, [tables]);

  return (
    <Modal onClose={onClose} wide>
      <div className="pe qr-sheet-wrap">
        <div className="pe-head">
          <p className="eyebrow">Mesas</p>
          <h3>Códigos QR</h3>
        </div>
        <button type="button" className="btn btn-amber" onClick={printReceipt} disabled={!Object.keys(codes).length}>Imprimir</button>
        <div className="qr-sheet print-target">
          {tables.map((t) => (
            <div key={t.id} className="qr-card">
              <span className="qr-brand">{settings.brand_name}</span>
              {codes[t.id] ? <img src={codes[t.id]} alt={`QR de ${t.label}`} /> : <span className="qr-loading" />}
              <b>{t.label}</b>
              <small>Escanea para pedir y pagar al final</small>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
