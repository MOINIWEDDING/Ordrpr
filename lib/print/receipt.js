// Convierte un trabajo de impresión (comanda, prefactura, factura o prueba) en líneas de texto
// de ancho fijo para una impresora térmica: 48 columnas en papel de 80 mm, 32 en 58 mm.
// Lo usan las rutas /api/print (impresoras reales) y la impresora virtual.

export const colsFor = (paper) => (Number(paper) === 58 ? 32 : 48);

const strip = (s) => String(s ?? '').replace(/[\r\n\t]+/g, ' ');

function fmtMoney(n, b = {}) {
  const num = Math.round((Number(n) || 0) * 100) / 100;
  const txt = num.toLocaleString('es-DO', { minimumFractionDigits: Number.isInteger(num) ? 0 : 2, maximumFractionDigits: 2 });
  const sym = b.currency_symbol || '$';
  return b.currency_position === 'after' ? `${txt}${sym}` : `${sym}${txt}`;
}

function wrap(text, width) {
  const words = strip(text).split(' ');
  const out = [];
  let line = '';
  words.forEach((w) => {
    while (w.length > width) { if (line) { out.push(line); line = ''; } out.push(w.slice(0, width)); w = w.slice(width); }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += ` ${w}`;
    else { out.push(line); line = w; }
  });
  if (line) out.push(line);
  return out.length ? out : [''];
}

const center = (text, cols) => wrap(text, cols).map((l) => ' '.repeat(Math.max(0, Math.floor((cols - l.length) / 2))) + l);
const pair = (left, right, cols) => {
  const r = strip(right);
  const l = strip(left).slice(0, Math.max(1, cols - r.length - 1));
  return l + ' '.repeat(Math.max(1, cols - l.length - r.length)) + r;
};
const rule = (cols, ch = '-') => ch.repeat(cols);
const when = (d) => new Date(d || Date.now()).toLocaleString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function optionsText(it) {
  return (it.options || []).map((o) => o.label).filter(Boolean).join(', ');
}

function header(b, cols) {
  const out = [];
  if (b.brand_name) out.push(...center(String(b.brand_name).toUpperCase(), cols));
  if (b.legal_name) out.push(...center(b.legal_name, cols));
  if (b.rnc) out.push(...center(`RNC ${b.rnc}`, cols));
  if (b.address) out.push(...center(b.address, cols));
  if (b.phone) out.push(...center(`Tel. ${b.phone}`, cols));
  return out;
}

function itemLines(items, cols, b, withPerson) {
  const out = [];
  let person = null;
  (items || []).forEach((it) => {
    if (withPerson && it.person !== person) { person = it.person; out.push(`- ${String(person || 'Sin nombre').toUpperCase()}`); }
    out.push(pair(`${it.qty} ${it.name}`, fmtMoney(Number(it.price) * Number(it.qty), b), cols));
    const opts = optionsText(it);
    if (opts) wrap(`  ${opts}`, cols).forEach((l) => out.push(l));
    if (it.notes) wrap(`  * ${it.notes}`, cols).forEach((l) => out.push(l));
  });
  return out;
}

export function renderJob(job, paper = 80) {
  const cols = colsFor(paper);
  const p = job.payload || {};
  const out = [];

  if (job.kind === 'comanda') {
    out.push(...center(`COMANDA ${String(p.station || '').toUpperCase()}`, cols));
    out.push(rule(cols, '='));
    out.push(...wrap(String(p.table || 'Pedido').toUpperCase(), cols));
    out.push(`Para: ${strip(p.customer || 'Sin nombre')}`);
    if (p.waiter) out.push(`Camarero: ${strip(p.waiter)}`);
    out.push(when(p.created_at));
    out.push(rule(cols));
    (p.items || []).forEach((it) => {
      wrap(`${it.qty} x ${it.name}`, cols).forEach((l) => out.push(l));
      const opts = optionsText(it);
      if (opts) wrap(`   ${opts}`, cols).forEach((l) => out.push(l));
      if (it.notes) wrap(`   >> ${it.notes}`, cols).forEach((l) => out.push(l));
    });
    out.push(rule(cols, '='));
    return out;
  }

  if (job.kind === 'prefactura') {
    const b = p.business || {};
    const tab = p.tab || {};
    const charges = p.charges || [];
    out.push(...header(b, cols));
    out.push(rule(cols));
    out.push(...center('PREFACTURA', cols));
    out.push(`${strip(tab.table_label)} - Cuenta #${tab.number || ''}`);
    out.push(when());
    if (tab.waiter_name) out.push(`Camarero: ${strip(tab.waiter_name)}`);
    out.push(rule(cols));
    const items = (tab.orders || []).flatMap((o) => (o.items || []).map((it) => ({ ...it, person: o.customer_name })));
    out.push(...itemLines(items, cols, b, true));
    out.push(rule(cols));
    const gross = (tab.orders || []).reduce((s, o) => s + Number(o.subtotal || 0), 0);
    out.push(pair('Subtotal', fmtMoney(gross, b), cols));
    let tax = 0;
    charges.forEach((c) => { const a = Math.round((gross * (Number(c.percent) || 0)) / 100); tax += a; out.push(pair(`${c.label} (${c.percent}%)`, fmtMoney(a, b), cols)); });
    out.push(pair('TOTAL', fmtMoney(gross + tax, b), cols));
    if (tab.guests > 1) out.push(...center(`Entre ${tab.guests}: ${fmtMoney(Math.ceil((gross + tax) / tab.guests), b)} c/u`, cols));
    out.push('');
    out.push(...center('No valida como comprobante fiscal', cols));
    return out;
  }

  if (job.kind === 'factura') {
    const inv = p.invoice || p;
    const b = inv.business || {};
    out.push(...header(b, cols));
    out.push(rule(cols));
    out.push(...center(`FACTURA F-${String(inv.number || 0).padStart(6, '0')}`, cols));
    if (inv.ncf) out.push(...center(`e-NCF ${inv.ncf}`, cols));
    out.push(when(inv.issued_at));
    if (inv.table_label) out.push(strip(inv.table_label));
    const fiscal = inv.fiscal || {};
    if (fiscal.rnc) {
      out.push(fiscal.type === 'credito_fiscal' ? 'Credito fiscal' : 'Consumidor final');
      out.push(`RNC/Ced. ${fiscal.rnc}`);
      if (fiscal.name) wrap(fiscal.name, cols).forEach((l) => out.push(l));
    }
    out.push(rule(cols));
    out.push(...itemLines(inv.items, cols, b, false));
    out.push(rule(cols));
    out.push(pair('Subtotal', fmtMoney(inv.subtotal, b), cols));
    if (Number(inv.discount) > 0) out.push(pair('Descuento', `-${fmtMoney(inv.discount, b)}`, cols));
    (inv.tax_lines || []).forEach((l) => out.push(pair(`${l.label} (${l.percent}%)`, fmtMoney(l.amount, b), cols)));
    if (Number(inv.tip) > 0) out.push(pair('Propina', fmtMoney(inv.tip, b), cols));
    out.push(pair('TOTAL', fmtMoney(inv.total, b), cols));
    out.push(rule(cols));
    (inv.payments || []).forEach((pm) => out.push(pair(pm.method || 'Pago', fmtMoney(pm.amount, b), cols)));
    out.push('');
    if (b.footer) out.push(...center(b.footer, cols));
    out.push(...center('Gracias por su visita', cols));
    return out;
  }

  // prueba
  out.push(...center('PRUEBA DE IMPRESION', cols));
  out.push(rule(cols));
  out.push(`Impresora: ${strip(p.printer || '')}`);
  out.push(when());
  out.push(...wrap('Si lees esto, la impresora esta conectada a tu pagina.', cols));
  out.push(rule(cols));
  return out;
}

export const renderText = (job, paper) => `${renderJob(job, paper).join('\n')}\n\n\n\n`;

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Documento ePOS-Print para Epson Server Direct Print.
export function renderEpsonXml(job, paper) {
  const text = renderJob(job, paper).map((l) => xmlEscape(l)).join('&#10;');
  return `<?xml version="1.0" encoding="utf-8"?>
<PrintRequestInfo Version="2.00">
<ePOSPrint>
<Parameter><devid>local_printer</devid><timeout>10000</timeout><printjobid>${job.id}</printjobid></Parameter>
<PrintData>
<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
<text lang="es" smooth="true">${text}&#10;</text>
<feed line="3"/>
<cut type="feed"/>
</epos-print>
</PrintData>
</ePOSPrint>
</PrintRequestInfo>`;
}
