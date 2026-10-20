import forge from 'node-forge';

// Certificados de Apple Wallet, desde las variables de entorno de Vercel de cada restaurante:
//   APPLE_PASS_P12           el certificado del Pass Type ID exportado como .p12, en base64
//   APPLE_PASS_P12_PASSWORD  la contraseña con que se exportó el .p12 (puede ir vacía)
//   APPLE_WWDR_CERT          el certificado intermedio de Apple (AppleWWDRCAG4.cer), en base64
// El Pass Type ID y el Team ID salen del propio certificado (APPLE_PASS_TYPE_ID y APPLE_TEAM_ID los reemplazan).
let cached = null;

function readCert(b64) {
  const raw = String(b64 || '').trim();
  if (raw.includes('BEGIN CERTIFICATE')) return forge.pki.certificateFromPem(raw);
  const bytes = forge.util.decode64(raw.replace(/\s+/g, ''));
  if (bytes.includes('BEGIN CERTIFICATE')) return forge.pki.certificateFromPem(bytes);
  return forge.pki.certificateFromAsn1(forge.asn1.fromDer(bytes));
}

export function walletConfig() {
  if (cached) return cached;
  const missing = ['APPLE_PASS_P12', 'APPLE_WWDR_CERT'].filter((k) => !process.env[k]);
  if (missing.length) return { ok: false, missing };
  try {
    const p12Der = forge.util.decode64(process.env.APPLE_PASS_P12.replace(/\s+/g, ''));
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12Der), process.env.APPLE_PASS_P12_PASSWORD || '');
    const { oids } = forge.pki;
    const certBag = (p12.getBags({ bagType: oids.certBag })[oids.certBag] || [])[0];
    const keyBag = (p12.getBags({ bagType: oids.pkcs8ShroudedKeyBag })[oids.pkcs8ShroudedKeyBag] || [])[0]
      || (p12.getBags({ bagType: oids.keyBag })[oids.keyBag] || [])[0];
    if (!certBag || !keyBag) throw new Error('el .p12 no trae el certificado y su llave');
    const cert = certBag.cert;
    const field = (attr) => { const f = cert.subject.getField(attr); return f ? f.value : ''; };
    const passTypeId = process.env.APPLE_PASS_TYPE_ID || field({ type: '0.9.2342.19200300.100.1.1' }); // UID
    const teamId = process.env.APPLE_TEAM_ID || field('OU');
    if (!passTypeId || !teamId) throw new Error('no se encontró el Pass Type ID o el Team ID en el certificado');
    cached = {
      ok: true, cert, key: keyBag.key, wwdr: readCert(process.env.APPLE_WWDR_CERT), passTypeId, teamId,
      certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keyBag.key),
    };
    return cached;
  } catch (e) {
    return { ok: false, missing: [], error: `certificado inválido: ${e.message}` };
  }
}
