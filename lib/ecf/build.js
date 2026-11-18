// Arma el e-CF (formato de Alanube) a partir de una factura de la app.
// E32 (consumo) va a POST /invoices y E31 (crédito fiscal) a POST /fiscal-invoices.
//
// Por validar en el sandbox de Alanube cuando haya token (marcado con «VALIDAR»):
// - la Ley (10% de servicio) se envía como recargo global exento;
// - la propina voluntaria no forma parte del e-CF: solo se suma al valor cobrado.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const PAY_FORM = { efectivo: 1, transferencia: 2, tarjeta: 3, en_linea: 3, gift_card: 5 };

// fecha del día en República Dominicana (UTC−4)
const rdDate = (d) => new Date(new Date(d).getTime() - 4 * 3600000).toISOString().slice(0, 10);

export function buildEcf({ invoice, business, companyId, encf, docType }) {
  const items = invoice.items || [];
  const taxLines = invoice.tax_lines || [];
  const itbisLine = taxLines.find((l) => /itbis/i.test(l.label || ''));
  const itbisRate = itbisLine ? Number(itbisLine.percent || 18) : 0;
  const otherLines = taxLines.filter((l) => l !== itbisLine && Number(l.amount || 0) > 0);
  const gross = r2(invoice.subtotal);
  const discount = r2(invoice.discount);
  const net = r2(gross - discount);
  const itbis = r2(itbisLine ? itbisLine.amount : 0);
  const service = r2(otherLines.reduce((s, l) => s + Number(l.amount || 0), 0));
  const billing = itbisRate >= 18 ? 1 : itbisRate >= 16 ? 2 : itbisRate > 0 ? 3 : 4;

  const itemDetails = items.map((it, i) => {
    const qty = Number(it.qty || 1);
    const price = r2(it.price);
    return {
      lineNumber: i + 1,
      billingIndicator: billing,
      itemName: String(it.name || 'Producto').slice(0, 80),
      ...(it.options && it.options.length ? { itemDescription: it.options.map((o) => o.label).join(', ').slice(0, 1000) } : {}),
      goodServiceIndicator: 1,
      quantityItem: qty,
      unitPriceItem: price,
      itemAmount: r2(price * qty),
    };
  });

  const discountsOrSurcharges = [];
  if (discount > 0) {
    discountsOrSurcharges.push({ lineNumber: discountsOrSurcharges.length + 1, fitType: 'D', descriptionDiscountOrSurcharge: 'Descuento', typeValue: '$', discountAmountOrSurcharge: discount, indicatorBillingDiscountOrSurcharge: billing });
  }
  otherLines.forEach((l) => {
    // VALIDAR: la Ley 10% como recargo global exento
    discountsOrSurcharges.push({ lineNumber: discountsOrSurcharges.length + 1, fitType: 'R', descriptionDiscountOrSurcharge: `${l.label} (${l.percent}%)`, typeValue: '$', discountAmountOrSurcharge: r2(l.amount), indicatorBillingDiscountOrSurcharge: 4 });
  });

  const payments = (invoice.payments || []).filter((p) => Number(p.amount) > 0);
  const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const k = paid > Number(invoice.total) && paid > 0 ? Number(invoice.total) / paid : 1;
  const forms = {};
  payments.forEach((p) => {
    let f = PAY_FORM[p.method] || 8;
    if (f === 5 && docType === '31') f = 8; // la DGII acepta gift card (5) solo en E32
    forms[f] = (forms[f] || 0) + Number(p.amount || 0) * k;
  });

  const fiscal = invoice.fiscal || {};
  const totalAmount = r2(net + itbis + service);
  return {
    company: { id: companyId },
    idDoc: {
      encf,
      taxAmountIndicator: 0,
      incomeType: 1,
      paymentType: 1,
      ...(Object.keys(forms).length ? { paymentFormsTable: Object.entries(forms).slice(0, 7).map(([paymentMethod, paymentAmount]) => ({ paymentMethod: Number(paymentMethod), paymentAmount: r2(paymentAmount) })) } : {}),
    },
    sender: {
      rnc: String(business.business_rnc || '').replace(/\D/g, ''),
      companyName: business.business_legal_name || business.brand_name,
      ...(business.brand_name ? { tradename: business.brand_name } : {}),
      ...(invoice.branch_name ? { branchOffice: invoice.branch_name } : {}),
      address: business.address || 'Sin dirección',
      ...(business.email ? { mail: business.email } : {}),
      internalInvoiceNumber: `F-${String(invoice.number).padStart(6, '0')}`,
      stampDate: rdDate(invoice.issued_at),
    },
    ...(fiscal.rnc ? { buyer: { rnc: String(fiscal.rnc).replace(/\D/g, ''), ...(fiscal.name ? { companyName: fiscal.name } : {}) } } : {}),
    totals: {
      ...(billing === 4
        ? { exemptAmount: r2(net + service) }
        : { totalTaxedAmount: net, [`i${billing}AmountTaxed`]: net, [`itbisS${billing}`]: itbisRate, itbisTotal: itbis, [`itbis${billing}Total`]: itbis, ...(service > 0 ? { exemptAmount: service } : {}) }),
      totalAmount,
      payValue: r2(invoice.total),
    },
    itemDetails,
    ...(discountsOrSurcharges.length ? { discountsOrSurcharges } : {}),
  };
}

export const ecfPath = (docType) => (docType === '31' ? '/fiscal-invoices' : '/invoices');
