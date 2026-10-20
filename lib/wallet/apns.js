import http2 from 'node:http2';

// Avisa a cada aparato que su pase cambió; Wallet lo vuelve a descargar solo.
export async function pushPassUpdates(tokens, config) {
  const list = [...new Set((tokens || []).filter(Boolean))];
  if (!list.length || !config.ok) return { sent: 0, failed: 0 };
  const client = http2.connect('https://api.push.apple.com:443', { cert: config.certPem, key: config.keyPem });
  client.on('error', () => {});
  const one = (token) => new Promise((resolve) => {
    let status = 0;
    const timer = setTimeout(() => resolve(0), 8000);
    try {
      const req = client.request({ ':method': 'POST', ':path': `/3/device/${token}`, 'apns-topic': config.passTypeId, 'content-type': 'application/json' });
      req.on('response', (h) => { status = Number(h[':status']) || 0; });
      req.on('data', () => {});
      req.on('end', () => { clearTimeout(timer); resolve(status); });
      req.on('error', () => { clearTimeout(timer); resolve(0); });
      req.end('{}');
    } catch (e) { clearTimeout(timer); resolve(0); }
  });
  const results = await Promise.all(list.map(one));
  client.close();
  const sent = results.filter((s) => s === 200).length;
  return { sent, failed: results.length - sent };
}
