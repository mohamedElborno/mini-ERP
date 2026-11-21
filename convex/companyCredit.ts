import { authorizeRequest } from "./access";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { getDefaultCurrencyIdForGroup } from "./orgGroupHelpers";
import {
  amountInDefaultCurrency,
  convertAmountFromCurrencyToDefault,
} from "./quoteFinance";

const MS_DAY = 86_400_000;

type CreditSourceType =
  | "manual_limit_update"
  | "invoice_credit"
  | "invoice_payment"
  | "invoice_void";

export function computeCreditSummary(company: {
  creditLimit?: number | null;
  creditUsed?: number | null;
  creditPeriodDays?: number | null;
  creditPeriodStartedAt?: number | null;
}) {
  const limit = company.creditLimit ?? 0;
  const used = company.creditUsed ?? 0;
  const available = Math.max(0, limit - used);
  const periodDays = company.creditPeriodDays ?? 0;
  const startedAt = company.creditPeriodStartedAt ?? null;
  const elapsedDays =
    startedAt != null
      ? Math.max(0, Math.floor((Date.now() - startedAt) / MS_DAY))
      : 0;
  const remainingDays =
    periodDays > 0 ? Math.max(0, periodDays - elapsedDays) : 0;

  return {
    creditLimit: limit,
    creditUsed: used,
    creditAvailable: available,
    creditPeriodDays: periodDays,
    elapsedDays,
    remainingDays,
    creditPeriodStartedAt: startedAt,
  };
}

async function loadCurrencies(ctx: QueryCtx | MutationCtx) {
  return ctx.db.query("currencies").collect();
}

/** Invoice total converted to the org default currency for credit accounting */
async function invoiceTotalInDefaultCurrency(
  ctx: QueryCtx | MutationCtx,
  invoice: Doc<"invoices">,
): Promise<number> {
  const currencies = await loadCurrencies(ctx);
  const defaultCurrencyId = await getDefaultCurrencyIdForGroup(
    ctx,
    invoice.group,
  );
  return amountInDefaultCurrency(
    invoice.total,
    invoice.currency ?? defaultCurrencyId,
    defaultCurrencyId,
    currencies,
  );
}

/** Outstanding credit counted against the client (default currency). */
async function resolveCreditOutstanding(
  ctx: QueryCtx | MutationCtx,
  invoice: Doc<"invoices">,
): Promise<number> {
  if (invoice.creditOutstanding != null) {
    return invoice.creditOutstanding;
  }
  return invoiceTotalInDefaultCurrency(ctx, invoice);
}

async function getInvoicePaidTotalInDefault(
  ctx: QueryCtx | MutationCtx,
  invoiceId: Id<"invoices">,
) {
  const currencies = await loadCurrencies(ctx);
  const vouchers = await ctx.db.query("receiptVouchers").collect();
  let total = 0;
  for (const voucher of vouchers) {
    const defaultCurrencyId = await getDefaultCurrencyIdForGroup(
      ctx,
      voucher.group,
    );
    for (const alloc of voucher.allocations ?? []) {
      if (alloc.invoiceId !== invoiceId) continue;
      if (alloc.amountInDefaultCurrency != null) {
        total += alloc.amountInDefaultCurrency;
        continue;
      }
      total += convertAmountFromCurrencyToDefault(
        alloc.amount,
        voucher.currency,
        defaultCurrencyId,
        currencies,
      );
    }
  }
  return total;
}

async function insertLedgerEntry(
  ctx: MutationCtx,
  entry: {
    company: Doc<"companies">;
    movementType: "increase" | "decrease";
    amount: number;
    creditUsedBefore: number;
    creditUsedAfter: number;
    sourceType: CreditSourceType;
    sourceLabel?: string;
    referenceType?: string;
    referenceId?: string;
    invoice?: Id<"invoices">;
    receiptVoucher?: Id<"receiptVouchers">;
    note?: string;
    performedBy: Id<"users">;
  },
) {
  const limit = entry.company.creditLimit ?? 0;
  const availableBefore = Math.max(0, limit - entry.creditUsedBefore);
  const availableAfter = Math.max(0, limit - entry.creditUsedAfter);

  await ctx.db.insert("companyCreditLedger", {
    company: entry.company._id,
    group: entry.company.group,
    movementType: entry.movementType,
    amount: entry.amount,
    creditUsedBefore: entry.creditUsedBefore,
    creditUsedAfter: entry.creditUsedAfter,
    creditAvailableBefore: availableBefore,
    creditAvailableAfter: availableAfter,
    sourceType: entry.sourceType,
    sourceLabel: entry.sourceLabel,
    referenceType: entry.referenceType,
    referenceId: entry.referenceId,
    invoice: entry.invoice,
    receiptVoucher: entry.receiptVoucher,
    note: entry.note,
    performedBy: entry.performedBy,
    timestamp: Date.now(),
  });
}

async function applyCreditUsedDelta(
  ctx: MutationCtx,
  opts: {
    companyId: Id<"companies">;
    deltaUsed: number;
    sourceType: CreditSourceType;
    sourceLabel?: string;
    performedBy: Id<"users">;
    invoice?: Id<"invoices">;
    receiptVoucher?: Id<"receiptVouchers">;
    note?: string;
    referenceType?: string;
    referenceId?: string;
    skipLimitCheck?: boolean;
  },
) {
  if (Math.abs(opts.deltaUsed) < 0.0001) return;

  const company = await ctx.db.get(opts.companyId);
  if (!company) throw new Error("Company not found.");

  const limit = company.creditLimit ?? 0;
  if (limit <= 0 && opts.sourceType !== "manual_limit_update") {
    return;
  }

  const usedBefore = company.creditUsed ?? 0;
  const usedAfter = usedBefore + opts.deltaUsed;

  if (usedAfter < -0.0001) {
    throw new Error("Credit used cannot be negative.");
  }
  if (!opts.skipLimitCheck && opts.deltaUsed > 0 && usedAfter > limit + 0.0001) {
    throw new Error("Credit limit exceeded for this client.");
  }

  const normalizedUsed = Math.max(0, usedAfter);
  const movementType: "increase" | "decrease" =
    opts.deltaUsed > 0 ? "decrease" : "increase";

  const companyPatch: Record<string, unknown> = {
    creditUsed: normalizedUsed,
    updatedBy: opts.performedBy,
    updatedAt: Date.now(),
  };

  if (opts.deltaUsed > 0 && !company.creditPeriodStartedAt) {
    companyPatch.creditPeriodStartedAt = Date.now();
  }
  if (normalizedUsed <= 0.0001) {
    companyPatch.creditUsed = 0;
    companyPatch.creditPeriodStartedAt = undefined;
  }

  await ctx.db.patch(opts.companyId, companyPatch);

  await insertLedgerEntry(ctx, {
    company,
    movementType,
    amount: Math.abs(opts.deltaUsed),
    creditUsedBefore: usedBefore,
    creditUsedAfter: normalizedUsed <= 0.0001 ? 0 : normalizedUsed,
    sourceType: opts.sourceType,
    sourceLabel: opts.sourceLabel,
    referenceType: opts.referenceType,
    referenceId: opts.referenceId,
    invoice: opts.invoice,
    receiptVoucher: opts.receiptVoucher,
    note: opts.note,
    performedBy: opts.performedBy,
  });
}

export async function reserveCreditForInvoice(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  performedBy: Id<"users">,
) {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice?.company) return;

  const company = await ctx.db.get(invoice.company);
  if (!company || (company.creditLimit ?? 0) <= 0) return;
  if (invoice.onCredit) return;

  const amount = await invoiceTotalInDefaultCurrency(ctx, invoice);
  if (amount <= 0) return;

  await applyCreditUsedDelta(ctx, {
    companyId: invoice.company,
    deltaUsed: amount,
    sourceType: "invoice_credit",
    sourceLabel: "Invoice on credit",
    performedBy,
    invoice: invoiceId,
    referenceType: "invoice",
    referenceId: invoiceId as string,
    note: invoice.number
      ? `Credit used for invoice ${invoice.number}`
      : `Credit used for invoice ${invoiceId}`,
  });

  await ctx.db.patch(invoiceId, {
    onCredit: true,
    creditOutstanding: amount,
    updatedBy: performedBy,
    updatedAt: Date.now(),
  });
}

export async function releaseCreditForInvoice(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  performedBy: Id<"users">,
  sourceType: "invoice_payment" | "invoice_void",
  amount?: number,
  receiptVoucherId?: Id<"receiptVouchers">,
) {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice?.company || !invoice.onCredit) return;

  const currentOutstanding = await resolveCreditOutstanding(ctx, invoice);
  const releaseAmount = amount ?? currentOutstanding;
  if (releaseAmount <= 0) return;

  const sourceLabel =
    sourceType === "invoice_void"
      ? "Invoice voided — credit restored"
      : "Invoice payment — credit restored";

  await applyCreditUsedDelta(ctx, {
    companyId: invoice.company,
    deltaUsed: -releaseAmount,
    sourceType,
    sourceLabel,
    performedBy,
    invoice: invoiceId,
    receiptVoucher: receiptVoucherId,
    referenceType:
      sourceType === "invoice_void" ? "invoice" : "receiptVoucher",
    referenceId:
      sourceType === "invoice_void"
        ? (invoiceId as string)
        : receiptVoucherId
          ? (receiptVoucherId as string)
          : undefined,
    note:
      sourceType === "invoice_void"
        ? invoice.number
          ? `Credit restored from voided invoice ${invoice.number}`
          : undefined
        : invoice.number
          ? `Credit restored after payment on invoice ${invoice.number}`
          : undefined,
  });

  const newOutstanding = Math.max(0, currentOutstanding - releaseAmount);
  await ctx.db.patch(invoiceId, {
    creditOutstanding: newOutstanding > 0 ? newOutstanding : undefined,
    onCredit: newOutstanding > 0.0001,
    updatedBy: performedBy,
    updatedAt: Date.now(),
  });
}

export async function reconcileInvoiceCreditAfterPayment(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  performedBy: Id<"users">,
  receiptVoucherId?: Id<"receiptVouchers">,
) {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice?.onCredit || !invoice.company) return;

  const paidTotal = await getInvoicePaidTotalInDefault(ctx, invoiceId);
  const totalInDefault = await invoiceTotalInDefaultCurrency(ctx, invoice);
  const newOutstanding = Math.max(0, totalInDefault - paidTotal);
  const oldOutstanding = await resolveCreditOutstanding(ctx, invoice);
  const released = oldOutstanding - newOutstanding;

  if (released > 0.0001) {
    await releaseCreditForInvoice(
      ctx,
      invoiceId,
      performedBy,
      "invoice_payment",
      released,
      receiptVoucherId,
    );
  }
}

export async function logManualCreditLimitUpdate(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  performedBy: Id<"users">,
  changes: {
    creditLimitBefore?: number;
    creditLimitAfter?: number;
    creditPeriodDaysBefore?: number;
    creditPeriodDaysAfter?: number;
  },
) {
  const company = await ctx.db.get(companyId);
  if (!company) return;

  const parts: string[] = [];
  if (changes.creditLimitBefore !== changes.creditLimitAfter) {
    parts.push(
      `Limit: ${changes.creditLimitBefore ?? 0} → ${changes.creditLimitAfter ?? 0}`,
    );
  }
  if (changes.creditPeriodDaysBefore !== changes.creditPeriodDaysAfter) {
    parts.push(
      `Period (days): ${changes.creditPeriodDaysBefore ?? 0} → ${changes.creditPeriodDaysAfter ?? 0}`,
    );
  }
  if (parts.length === 0) return;

  const used = company.creditUsed ?? 0;
  await insertLedgerEntry(ctx, {
    company,
    movementType: "increase",
    amount: 0,
    creditUsedBefore: used,
    creditUsedAfter: used,
    sourceType: "manual_limit_update",
    sourceLabel: "Credit terms updated",
    note: parts.join("; "),
    performedBy,
  });
}

export const getCompanyCreditSummary = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "companyCredit.getCompanyCreditSummary");
    const company = await ctx.db.get(args.companyId);
    if (!company) return null;
    return computeCreditSummary(company);
  },
});

export const getCompanyCreditLedger = query({
  args: {
    companyId: v.id("companies"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "companyCredit.getCompanyCreditLedger");
    const rows = await ctx.db
      .query("companyCreditLedger")
      .withIndex("by_company", (q) => q.eq("company", args.companyId))
      .order("desc")
      .collect();

    const max = args.limit ?? 100;
    return rows.slice(0, max);
  },
});
