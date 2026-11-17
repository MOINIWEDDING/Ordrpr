'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useSettings } from '@/context/SettingsContext';
import { printReceipt } from '@/lib/printReceipt';
import Modal from './Modal';

// Los QR de las mesas, listos para imprimir. Cada QR lleva el enlace corto permanente de la mesa
// (/q/<código>), no el enlace de la mesa: así el QR impreso nunca cambia.
export const shortLink = (code) => `${window.location.origin}/q/${code}`;

export default function TableQrSheet({ tables, links, onClose }) {
  const { settings } = useSettings();
  const [codes, setCodes] = useState({});
  const withCode = tables.filter((t) => links[t.id]);

  useEffect(() => {
    Promise.all(withCode.map(async (t) => [t.id, await QRCode.toDataURL(shortLink(links[t.id]), { margin: 1, width: 360, errorCorrectionLevel: 'M' })]))
      .then((pairs) => setCodes(Object.fromEntries(pairs)));
  }, [tables, links]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal onClose={onClose} wide>
      <div className="pe qr-sheet-wrap">
        <div className="pe-head">
          <p className="eyebrow">Mesas</p>
          <h3>Códigos QR</h3>
        </div>
        <button type="button" className="btn btn-amber" onClick={printReceipt} disabled={!Object.keys(codes).length}>Imprimir</button>
        <div className="qr-sheet print-target">
          {withCode.map((t) => (
            <div key={t.id} className="qr-card">
              <span className="qr-brand">{settings.brand_name}</span>
              {codes[t.id] ? <img src={codes[t.id]} alt={`QR de ${t.label}`} /> : <span className="qr-loading" />}
              <b>{t.label}</b>
              <small>Escanea para pedir y pagar al final</small>
              <code className="qr-code">/q/{links[t.id]}</code>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
