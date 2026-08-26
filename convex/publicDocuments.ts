import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  buildInvoicePrintData,
  buildQuotePrintData,
} from "./documentViews";
import { isValidPublicViewToken } from "./lib/publicViewToken";
import { lookupByPublicViewToken } from "./lib/publicViewTokenStorage";

/** Public read-only quote view — no authentication; token is the credential. */
export const getPublicQuoteByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!isValidPublicViewToken(args.token)) return null;

    const quote = await lookupByPublicViewToken(ctx, "quotes", args.token);
    if (!quote) return null;

    return await buildQuotePrintData(ctx, quote);
  },
});

/** Public read-only invoice view — no authentication; token is the credential. */
export const getPublicInvoiceByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!isValidPublicViewToken(args.token)) return null;

    const invoice = await lookupByPublicViewToken(ctx, "invoices", args.token);
    if (!invoice) return null;

    return await buildInvoicePrintData(ctx, invoice);
  },
});
