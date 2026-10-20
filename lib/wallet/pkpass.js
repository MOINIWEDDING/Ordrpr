import crypto from 'node:crypto';
import forge from 'node-forge';
import { zipStore } from './zip';
import { stripImage, iconImage, logoImage } from './images';

// Arma el .pkpass (tipo storeCard) de un pase de sellos y lo firma con el certificado del local.
// `data` es lo que devuelve la función wallet_pass de Supabase.

const rgb = (hex, fallback) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  const h = m ? m[1] : fallback;
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};

function sign(manifest, config) {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString('binary'));
  p7.addCertificate(config.cert);
  p7.addCertificate(config.wwdr);
  p7.addSigner({
    key: config.key,
    certificate: config.cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
}

export function passJson(data, origin, config) {
  const s = data.settings;
  const left = Math.max(0, s.stamps_required - data.stamps);
  const rewards = data.rewards || [];
  const brand = data.brand_name || 'Restaurante';
  const back = [
    data.customer_name ? { key: 'customer', label: 'Cliente', value: data.customer_name } : null,
    s.description ? { key: 'how', label: 'Cómo funciona', value: s.description } : null,
    { key: 'reward', label: 'Premio', value: s.reward_label },
    rewards.length
      ? { key: 'codes', label: 'Tus códigos de premio', value: rewards.map((r) => r.code).join('\n'), changeMessage: 'Tienes un premio nuevo: %@' }
      : null,
    { key: 'total', label: 'Sellos en total', value: data.total_stamps },
    s.terms ? { key: 'terms', label: 'Términos', value: s.terms } : null,
    { key: 'link', label: 'Ver mi pase', value: `${origin}/pase`, attributedValue: `<a href="${origin}/pase">Abrir ${brand}</a>` },
  ].filter(Boolean);

  return {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeId,
    teamIdentifier: config.teamId,
    serialNumber: data.serial,
    authenticationToken: data.auth_token,
    webServiceURL: `${origin}/api/wallet`,
    organizationName: brand,
    description: `${s.title} · ${brand}`,
    logoText: (s.logo_url || data.brand_logo_url) ? s.title : brand,
    backgroundColor: rgb(s.bg_color, '241C13'),
    foregroundColor: rgb(s.fg_color, 'FBF8F2'),
    labelColor: rgb(s.label_color, 'C9B79C'),
    sharingProhibited: true,
    storeCard: {
      headerFields: [{ key: 'stamps', label: 'SELLOS', value: `${data.stamps}/${s.stamps_required}`, changeMessage: 'Ahora tienes %@ sellos' }],
      secondaryFields: [
        rewards.length
          ? { key: 'ready', label: rewards.length === 1 ? 'PREMIO LISTO' : 'PREMIOS LISTOS', value: rewards.length === 1 ? rewards[0].code : `${rewards.length}` }
          : { key: 'left', label: 'TE FALTAN', value: `${left} ${left === 1 ? 'sello' : 'sellos'}` },
        { key: 'prize', label: 'PREMIO', value: s.reward_label },
      ],
      backFields: back,
    },
  };
}

export async function buildPkpass(data, origin, config) {
  try {
    return await assemble(data, origin, config, true);
  } catch (e) {
    // si una imagen del local no se pudo descargar, el pase sale igual sin ella
    console.warn('wallet: imágenes sin fotos del local', e.message);
    return assemble(data, origin, config, false);
  }
}

async function assemble(data, origin, config, withPhotos) {
  const s = withPhotos ? data.settings : { ...data.settings, strip_image_url: '', stamp_image_url: '', logo_url: '' };
  const logo = withPhotos ? (s.logo_url || data.brand_logo_url || '') : '';
  const ctx = { s, stamps: data.stamps, logo, brand: data.brand_name };
  const files = [
    { name: 'pass.json', data: Buffer.from(JSON.stringify(passJson({ ...data, settings: s, brand_logo_url: logo }, origin, config)), 'utf8') },
    { name: 'icon.png', data: await iconImage(ctx, 1) },
    { name: 'icon@2x.png', data: await iconImage(ctx, 2) },
    { name: 'icon@3x.png', data: await iconImage(ctx, 3) },
    { name: 'strip.png', data: await stripImage(ctx, 1) },
    { name: 'strip@2x.png', data: await stripImage(ctx, 2) },
    { name: 'strip@3x.png', data: await stripImage(ctx, 3) },
  ];
  if (/^https:\/\//.test(logo)) {
    files.push({ name: 'logo.png', data: await logoImage(ctx, 1) }, { name: 'logo@2x.png', data: await logoImage(ctx, 2) });
  }
  const manifest = Buffer.from(JSON.stringify(Object.fromEntries(
    files.map((f) => [f.name, crypto.createHash('sha1').update(f.data).digest('hex')]),
  )), 'utf8');
  files.push({ name: 'manifest.json', data: manifest }, { name: 'signature', data: sign(manifest, config) });
  return zipStore(files);
}
