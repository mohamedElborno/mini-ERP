import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { getGroupBrandingForPrint } from "./orgGroupHelpers";

export async function buildQuotePrintData(ctx: QueryCtx, quote: Doc<"quotes">) {
  const company = quote.company ? await ctx.db.get(quote.company) : null;
  const contact = await ctx.db.get(quote.contact);
  const group = await getGroupBrandingForPrint(ctx, quote.group ?? undefined);
  const currency = quote.currency ? await ctx.db.get(quote.currency) : null;
  const deal = await ctx.db.get(quote.deal);

  const productMap = new Map<string, string>();
  for (const item of quote.lineItems ?? []) {
    if (!productMap.has(item.product)) {
      const p = await ctx.db.get(item.product);
      if (p) productMap.set(item.product, p.name);
    }
  }

  const serviceMap = new Map<string, string>();
  for (const item of quote.services ?? []) {
    if (!serviceMap.has(item.service)) {
      const s = await ctx.db.get(item.service);
      if (s) serviceMap.set(item.service, s.name);
    }
  }

  const paymentTerms = quote.paymentTerms
    ? await ctx.db.get(quote.paymentTerms)
    : null;
  const shippingTerms = quote.shippingTerms
    ? await ctx.db.get(quote.shippingTerms)
    : null;
  const deliveryTerms = quote.deliveryTerms
    ? await ctx.db.get(quote.deliveryTerms)
    : null;

  return {
    quote,
    hasPublicViewLink: Boolean(
      quote.publicViewTokenHash ??
        quote.publicViewTokenEnc ??
        quote.publicViewToken,
    ),
    company: company
      ? {
          name: company.name,
          address: company.address,
          city: company.city,
          country: company.country,
          zipCode: company.zipCode,
          phone: company.phoneNumber,
          email: company.email,
          taxNumber: company.taxNumber,
          nationalAddress: company.nationalAddress,
          buildingNumber: company.buildingNumber,
          district: company.district,
          secondaryNumber: company.secondaryNumber,
        }
      : null,
    contact: contact
      ? {
          name:
            [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
            contact.email ||
            "—",
          email: contact.email,
          phone: contact.phoneNumber,
          jobTitle: contact.jobTitle,
        }
      : null,
    group,
    currency: currency
      ? { symbol: currency.symbol, name: currency.name }
      : null,
    dealTitle: deal?.title ?? null,
    lineItems: (quote.lineItems ?? []).map((item, i) => ({
      index: i + 1,
      name: productMap.get(item.product) ?? "—",
      quantity: item.quantity,
      price: item.price,
      discount: item.discount ?? 0,
      priceAfterDiscount: item.priceAfterDiscount ?? item.price,
      subtotal: item.subtotal ?? 0,
      taxes: item.taxes ?? [],
      taxAmount: item.taxAmount ?? 0,
      total: item.totalAfterTax ?? 0,
    })),
    services: (quote.services ?? []).map((item, i) => ({
      index: (quote.lineItems?.length ?? 0) + i + 1,
      name: serviceMap.get(item.service) ?? "—",
      quantity: item.quantity,
      price: item.price,
      discount: item.discount ?? 0,
      priceAfterDiscount: item.priceAfterDiscount ?? item.price,
      subtotal: item.subtotal ?? 0,
      taxes: item.taxes ?? [],
      taxAmount: item.taxAmount ?? 0,
      total: item.totalAfterTax ?? 0,
    })),
    paymentTermsName: paymentTerms?.name ?? null,
    shippingTermsName: shippingTerms?.name ?? null,
    deliveryTermsName: deliveryTerms?.name ?? null,
  };
}

export async function buildInvoicePrintData(
  ctx: QueryCtx,
  invoice: Doc<"invoices">,
) {
  const company = invoice.company ? await ctx.db.get(invoice.company) : null;
  const contact = await ctx.db.get(invoice.contact);
  const group = await getGroupBrandingForPrint(ctx, invoice.group ?? undefined);
  const currency = invoice.currency ? await ctx.db.get(invoice.currency) : null;
  const quote = await ctx.db.get(invoice.quote);

  const productMap = new Map<string, string>();
  for (const item of invoice.lineItems ?? []) {
    if (!productMap.has(item.product)) {
      const p = await ctx.db.get(item.product);
      if (p) productMap.set(item.product, p.name);
    }
  }

  const serviceMap = new Map<string, string>();
  for (const item of invoice.services ?? []) {
    if (!serviceMap.has(item.service)) {
      const s = await ctx.db.get(item.service);
      if (s) serviceMap.set(item.service, s.name);
    }
  }

  const paymentTerms = invoice.paymentTerms
    ? await ctx.db.get(invoice.paymentTerms)
    : null;
  const shippingTerms = invoice.shippingTerms
    ? await ctx.db.get(invoice.shippingTerms)
    : null;
  const deliveryTerms = invoice.deliveryTerms
    ? await ctx.db.get(invoice.deliveryTerms)
    : null;

  return {
    invoice,
    hasPublicViewLink: Boolean(
      invoice.publicViewTokenHash ??
        invoice.publicViewTokenEnc ??
        invoice.publicViewToken,
    ),
    company: company
      ? {
          name: company.name,
          address: company.address,
          city: company.city,
          country: company.country,
          zipCode: company.zipCode,
          phone: company.phoneNumber,
          email: company.email,
          taxNumber: company.taxNumber,
          nationalAddress: company.nationalAddress,
          buildingNumber: company.buildingNumber,
          district: company.district,
          secondaryNumber: company.secondaryNumber,
        }
      : null,
    contact: contact
      ? {
          name:
            [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
            contact.email ||
            "—",
          email: contact.email,
          phone: contact.phoneNumber,
          jobTitle: contact.jobTitle,
        }
      : null,
    group,
    currency: currency
      ? { symbol: currency.symbol, name: currency.name }
      : null,
    quoteRef: quote
      ? { number: quote.number, revision: quote.revision }
      : null,
    lineItems: (invoice.lineItems ?? []).map((item, i) => ({
      index: i + 1,
      name: productMap.get(item.product) ?? "—",
      quantity: item.quantity,
      price: item.price,
      discount: item.discount ?? 0,
      priceAfterDiscount: item.priceAfterDiscount ?? item.price,
      subtotal: item.subtotal ?? 0,
      taxes: item.taxes ?? [],
      taxAmount: item.taxAmount ?? 0,
      total: item.totalAfterTax ?? 0,
    })),
    services: (invoice.services ?? []).map((item, i) => ({
      index: (invoice.lineItems?.length ?? 0) + i + 1,
      name: serviceMap.get(item.service) ?? "—",
      quantity: item.quantity,
      price: item.price,
      discount: item.discount ?? 0,
      priceAfterDiscount: item.priceAfterDiscount ?? item.price,
      subtotal: item.subtotal ?? 0,
      taxes: item.taxes ?? [],
      taxAmount: item.taxAmount ?? 0,
      total: item.totalAfterTax ?? 0,
    })),
    paymentTermsName: paymentTerms?.name ?? null,
    shippingTermsName: shippingTerms?.name ?? null,
    deliveryTermsName: deliveryTerms?.name ?? null,
  };
}
