import { authorizeRequest } from "./access";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { logAudit } from "./auditLog";
import {
  convertAmountFromCurrencyToDefault,
  convertAmountFromDefaultToCurrencyNumber,
} from "./quoteFinance";
import { reconcileInvoiceCreditAfterPayment } from "./companyCredit";
import {
  filterByOrgGroup,
  getAccessibleOrgGroupIds,
  getDefaultCurrencyIdForGroup,
  getGroupBrandingForPrint,
  getSettingsByGroup,
  getUserAssignedGroupIds,
  orgGroupFilterValidator,
  resolveOrgGroupFilter,
  resolveOrgGroupForCreate,
} from "./orgGroupHelpers";
import {
  getListAuth,
  listSearchValidator,
  loadCompanyNameMap,
  normalizeSearch,
  paginateWithPredicate,
  resolveGroupIdsForList,
  rowInAccessibleGroups,
  voucherMatchesSearch,
} from "./listPagination";

// ============================================================================
// HELPERS
// ============================================================================

const paymentMethodValidator = v.union(
  v.literal("cash"),
  v.literal("bank_transfer"),
  v.literal("check"),
  v.literal("credit_card"),
  v.literal("other"),
);

const voucherContextValidator = v.union(
  v.literal("general_credit"),
  v.literal("invoice_payment"),
  v.literal("deal_advance"),
  v.literal("quote_advance"),
);

const BANK_PAYMENT_METHODS = new Set(["bank_transfer", "credit_card"]);

const allocationInput = v.object({
  invoiceId: v.id("invoices"),
  amount: v.number(),
  amountInDefaultCurrency: v.optional(v.number()),
});

async function requirePermission(ctx: any, permissionName: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user || !user.role)
    throw new Error("Unauthorized: Invalid user or role");

  const role = await ctx.db.get(user.role as Id<"roles">);
  const has = role?.permissions.includes(permissionName);
  const isAdmin = role?.permissions.includes("admin:all");
  if (!role || (!has && !isAdmin)) {
    throw new Error(`Forbidden: Missing permission [${permissionName}]`);
  }

  return user;
}

function displayNameForUser(
  u: { firstName?: string; lastName?: string; email: string } | null,
) {
  if (!u) return "—";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email;
}

async function loadVoucherIfReadable(ctx: QueryCtx, id: Id<"receiptVouchers">) {
  const currentUser = await requirePermission(ctx, "receiptVouchers:read");
  const voucher = await ctx.db.get(id);
  if (!voucher) return null;
  const role = await ctx.db.get(currentUser.role as Id<"roles">);
  if (role?.permissions.includes("admin:all")) return voucher;
  if (voucher.createdBy === currentUser._id) return voucher;
  if (currentUser.group) {
    const company = await ctx.db.get(voucher.company);
    const assigned = getUserAssignedGroupIds(currentUser);
    if (company?.group && assigned.includes(company.group)) return voucher;
  }
  return null;
}

async function getDefaultCurrencyId(
  ctx: QueryCtx | MutationCtx,
  groupId?: Id<"groups">,
) {
  return getDefaultCurrencyIdForGroup(ctx, groupId);
}

/** Sum of amounts allocated to an invoice across all receipt vouchers (default currency). */
export async function getInvoicePaidTotal(
  ctx: QueryCtx | MutationCtx,
  invoiceId: Id<"invoices">,
): Promise<number> {
  const currencies = await ctx.db.query("currencies").collect();
  const vouchers = await ctx.db.query("receiptVouchers").collect();
  let total = 0;
  for (const voucher of vouchers) {
    const defaultCurrencyId = await getDefaultCurrencyId(ctx, voucher.group);
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

function remainingToDefaultAmount(
  remainingAmount: number,
  voucherCurrencyId: Id<"currencies">,
  amountInDefaultCurrency: number | undefined,
  voucherAmount: number,
  defaultCurrencyId: Id<"currencies"> | undefined,
  allCurrencies: { _id: Id<"currencies">; exchangeRate?: number | null }[],
): number {
  if (remainingAmount <= 0) return 0;
  if (!defaultCurrencyId || voucherCurrencyId === defaultCurrencyId) {
    return remainingAmount;
  }
  if (
    amountInDefaultCurrency != null &&
    voucherAmount > 0 &&
    Number.isFinite(amountInDefaultCurrency)
  ) {
    return (remainingAmount / voucherAmount) * amountInDefaultCurrency;
  }
  return convertAmountFromCurrencyToDefault(
    remainingAmount,
    voucherCurrencyId,
    defaultCurrencyId,
    allCurrencies,
  );
}

async function applyPrepaidBalanceDelta(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  delta: number,
  currentUserId: Id<"users">,
) {
  if (Math.abs(delta) < 0.0001) return;
  const company = await ctx.db.get(companyId);
  if (!company) throw new Error("Company not found.");
  const current = company.prepaidBalance ?? 0;
  await ctx.db.patch(companyId, {
    prepaidBalance: current + delta,
    updatedBy: currentUserId,
    updatedAt: Date.now(),
  });
}

async function recalcInvoicePaymentStatus(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  currentUserId: Id<"users">,
  receiptVoucherId?: Id<"receiptVouchers">,
) {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice || invoice.status === "void") return;

  // paidTotal is always stored in the DEFAULT currency
  const paidTotal = await getInvoicePaidTotal(ctx, invoiceId);
  const invoiceTotal = invoice.total ?? 0;

  // Convert invoice total to the default currency so both sides use the same unit
  const defaultCurrencyId = await getDefaultCurrencyIdForGroup(
    ctx,
    invoice.group,
  );
  const allCurrencies = await ctx.db.query("currencies").collect();
  const invoiceTotalInDefault =
    defaultCurrencyId &&
    invoice.currency &&
    invoice.currency !== defaultCurrencyId
      ? convertAmountFromCurrencyToDefault(
          invoiceTotal,
          invoice.currency,
          defaultCurrencyId,
          allCurrencies,
        )
      : invoiceTotal;

  let newStatus = invoice.status ?? "draft";
  if (paidTotal >= invoiceTotalInDefault && invoiceTotalInDefault > 0) {
    newStatus = "paid";
    if (invoice.deal) {
      await ctx.db.patch(invoice.deal, {
        stage: "won",
        actualCloseDate: Date.now(),
      });
    }
  } else if (paidTotal > 0) {
    newStatus = "partially_paid";
  } else if (newStatus === "paid" || newStatus === "partially_paid") {
    newStatus = "sent";
  }

  if (newStatus !== invoice.status) {
    await ctx.db.patch(invoiceId, {
      status: newStatus,
      updatedBy: currentUserId,
      updatedAt: Date.now(),
    });
  }

  await reconcileInvoiceCreditAfterPayment(
    ctx,
    invoiceId,
    currentUserId,
    receiptVoucherId,
  );
}

function sumAllocations(allocations: { amount: number }[] | undefined): number {
  return (allocations ?? []).reduce((s, a) => s + a.amount, 0);
}

function validateAllocations(
  amount: number,
  allocations: { invoiceId: Id<"invoices">; amount: number }[],
) {
  const used = sumAllocations(allocations);
  if (used > amount + 0.001) {
    throw new Error("Allocated amount exceeds voucher total.");
  }
  const seen = new Set<string>();
  for (const a of allocations) {
    if (seen.has(a.invoiceId)) {
      throw new Error("Duplicate invoice in allocations.");
    }
    seen.add(a.invoiceId);
    if (a.amount <= 0) {
      throw new Error("Allocation amount must be positive.");
    }
  }
}

function validateVoucherContext(args: {
  voucherContext:
    "general_credit" | "invoice_payment" | "deal_advance" | "quote_advance";
  deal?: Id<"deals">;
  quote?: Id<"quotes">;
  references: Id<"invoices">[];
}) {
  if (args.voucherContext === "deal_advance" && !args.deal) {
    throw new Error("Deal is required for deal advance vouchers.");
  }
  if (args.voucherContext === "quote_advance" && !args.quote) {
    throw new Error("Quote is required for quote advance vouchers.");
  }
  if (
    args.voucherContext === "invoice_payment" &&
    args.references.length === 0
  ) {
    throw new Error("At least one invoice reference is required.");
  }
}

function validateBankAccount(
  paymentMethod: string,
  bankAccount: Id<"bankAccounts"> | undefined,
) {
  if (BANK_PAYMENT_METHODS.has(paymentMethod) && !bankAccount) {
    throw new Error("Bank account is required for this payment method.");
  }
}

function resolveNetAmounts(
  grossAmount: number,
  taxAmount: number | undefined,
  grossInDefault: number,
  currencyId: Id<"currencies">,
  defaultCurrencyId: Id<"currencies"> | undefined,
  allCurrencies: { _id: Id<"currencies">; exchangeRate?: number | null }[],
) {
  const tax = taxAmount ?? 0;
  if (tax > grossAmount + 0.001) {
    throw new Error("Payment method tax exceeds the paid amount.");
  }
  const netAmount = grossAmount - tax;
  if (netAmount <= 0) {
    throw new Error("Net amount after tax must be positive.");
  }

  let taxInDefault = tax;
  if (defaultCurrencyId && currencyId !== defaultCurrencyId) {
    taxInDefault = convertAmountFromCurrencyToDefault(
      tax,
      currencyId,
      defaultCurrencyId,
      allCurrencies,
    );
  }
  const netInDefault = grossInDefault - taxInDefault;
  return { netAmount, netInDefault };
}

function voucherNetAmount(voucher: {
  amount: number;
  netAmount?: number;
  paymentMethodTaxAmount?: number;
}): number {
  return (
    voucher.netAmount ?? voucher.amount - (voucher.paymentMethodTaxAmount ?? 0)
  );
}

// ============================================================================
// CREATE
// ============================================================================

export const createReceiptVoucher = mutation({
  args: {
    number: v.optional(v.string()),
    company: v.id("companies"),
    contact: v.id("contacts"),
    voucherContext: voucherContextValidator,
    deal: v.optional(v.id("deals")),
    quote: v.optional(v.id("quotes")),
    amount: v.number(),
    currency: v.id("currencies"),
    amountInDefaultCurrency: v.optional(v.number()),
    exchangeRateUsed: v.optional(v.number()),
    paymentMethod: paymentMethodValidator,
    bankAccount: v.optional(v.id("bankAccounts")),
    paymentMethodTaxRate: v.optional(v.number()),
    paymentMethodTaxAmount: v.optional(v.number()),
    references: v.optional(v.array(v.id("invoices"))),
    allocations: v.optional(v.array(allocationInput)),
    issueDate: v.optional(v.number()),
    description: v.optional(v.string()),
    orgGroupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "receiptVouchers.createReceiptVoucher");
    const currentUser = await requirePermission(ctx, "receiptVouchers:create");
    const role = await ctx.db.get(currentUser.role as Id<"roles">);
    const isAdmin = role?.permissions.includes("admin:all") ?? false;

    if (args.amount <= 0) throw new Error("Amount must be positive.");

    const { orgGroupId: requestedOrgGroupId, ...voucherArgs } = args;
    const orgGroupId = await resolveOrgGroupForCreate(
      ctx,
      currentUser,
      requestedOrgGroupId,
      isAdmin,
    );

    const references = voucherArgs.references ?? [];
    validateVoucherContext({
      voucherContext: voucherArgs.voucherContext,
      deal: voucherArgs.deal,
      quote: voucherArgs.quote,
      references,
    });
    validateBankAccount(voucherArgs.paymentMethod, voucherArgs.bankAccount);

    if (args.bankAccount) {
      const bank = await ctx.db.get(args.bankAccount);
      if (!bank || bank.active === false) {
        throw new Error("Bank account not found or inactive.");
      }
    }

    const company = await ctx.db.get(args.company);
    if (!company) throw new Error("Company not found.");

    const contact = await ctx.db.get(args.contact);
    if (!contact) throw new Error("Contact not found.");
    if (contact.company && contact.company !== args.company) {
      throw new Error("Contact does not belong to the selected company.");
    }

    if (args.deal) {
      const deal = await ctx.db.get(args.deal);
      if (!deal) throw new Error("Deal not found.");
      if (deal.company && deal.company !== args.company) {
        throw new Error("Deal does not belong to the selected company.");
      }
    }

    if (args.quote) {
      const quote = await ctx.db.get(args.quote);
      if (!quote) throw new Error("Quote not found.");
      if (quote.company && quote.company !== args.company) {
        throw new Error("Quote does not belong to the selected company.");
      }
    }

    const currency = await ctx.db.get(args.currency);
    if (!currency) throw new Error("Currency not found.");

    const voucherGroupId = company.group ?? orgGroupId;

    const defaultCurrencyId = await getDefaultCurrencyId(ctx, voucherGroupId);
    const allCurrencies = await ctx.db.query("currencies").collect();
    const isDefaultCurrency =
      !defaultCurrencyId || args.currency === defaultCurrencyId;

    let amountInDefault = args.amountInDefaultCurrency;
    if (!isDefaultCurrency) {
      if (amountInDefault == null) {
        amountInDefault = convertAmountFromCurrencyToDefault(
          args.amount,
          args.currency,
          defaultCurrencyId,
          allCurrencies,
        );
      }
    } else {
      amountInDefault = args.amount;
    }

    const { netAmount, netInDefault } = resolveNetAmounts(
      args.amount,
      args.paymentMethodTaxAmount,
      amountInDefault,
      args.currency,
      defaultCurrencyId,
      allCurrencies,
    );

    const allocations = args.allocations ?? [];
    validateAllocations(netAmount, allocations);

    for (const invId of references) {
      const inv = await ctx.db.get(invId);
      if (!inv) throw new Error("Invoice not found.");
      if (inv.company && inv.company !== args.company) {
        throw new Error("Invoice does not belong to the selected company.");
      }
    }

    for (const alloc of allocations) {
      if (!references.includes(alloc.invoiceId)) {
        throw new Error("Allocated invoice must be in references.");
      }
    }

    const usedAmount = sumAllocations(allocations);
    const remainingAmount = netAmount - usedAmount;
    const balanceCreditInDefault = remainingToDefaultAmount(
      remainingAmount,
      args.currency,
      netInDefault,
      netAmount,
      defaultCurrencyId,
      allCurrencies,
    );

    let voucherNumber = args.number?.trim() ?? "";
    if (!voucherNumber) {
      const settings = await getSettingsByGroup(ctx, voucherGroupId);
      const mode = settings?.receiptVoucherNumberMode ?? "auto";
      if (mode === "auto") {
        voucherNumber = await ctx.runMutation(
          internal.settings.generateDocumentNumber,
          { type: "receiptVoucher", groupId: voucherGroupId },
        );
      }
    }
    if (!voucherNumber) {
      voucherNumber = `RV-${Date.now().toString().slice(-6)}`;
    }

    const voucherId = await ctx.db.insert("receiptVouchers", {
      number: voucherNumber,
      company: args.company,
      contact: args.contact,
      group: voucherGroupId,
      voucherContext: args.voucherContext,
      deal: args.deal,
      quote: args.quote,
      amount: args.amount,
      netAmount,
      currency: args.currency,
      amountInDefaultCurrency: isDefaultCurrency ? undefined : amountInDefault,
      netAmountInDefaultCurrency: isDefaultCurrency ? undefined : netInDefault,
      exchangeRateUsed: args.exchangeRateUsed,
      paymentMethod: args.paymentMethod,
      bankAccount: args.bankAccount,
      paymentMethodTaxRate: args.paymentMethodTaxRate,
      paymentMethodTaxAmount: args.paymentMethodTaxAmount,
      references: references.length > 0 ? references : undefined,
      allocations: allocations.length > 0 ? allocations : undefined,
      usedAmount,
      remainingAmount,
      balanceCreditInDefault:
        balanceCreditInDefault > 0 ? balanceCreditInDefault : undefined,
      issueDate: args.issueDate ?? Date.now(),
      description: args.description,
      createdBy: currentUser._id,
      updatedAt: Date.now(),
    });

    await applyPrepaidBalanceDelta(
      ctx,
      args.company,
      balanceCreditInDefault,
      currentUser._id,
    );

    await logAudit(ctx, {
      entityId: voucherId as string,
      entityType: "receiptVoucher",
      action: "CREATED",
      changes: {
        number: voucherNumber,
        company: args.company,
        contact: args.contact,
        voucherContext: args.voucherContext,
        amount: args.amount,
        netAmount,
        currency: args.currency,
        paymentMethod: args.paymentMethod,
        paymentMethodTaxAmount: args.paymentMethodTaxAmount ?? null,
        usedAmount,
        remainingAmount,
        balanceCreditInDefault,
        references,
      },
      performedBy: currentUser._id,
    });

    const affectedInvoices = new Set<Id<"invoices">>();
    for (const alloc of allocations) {
      affectedInvoices.add(alloc.invoiceId);
    }
    for (const invId of affectedInvoices) {
      await recalcInvoicePaymentStatus(ctx, invId, currentUser._id, voucherId);
    }

    return voucherId;
  },
});

function filterVouchersByVisibility<
  T extends { createdBy: Id<"users">; company: Id<"companies"> },
>(
  rows: T[],
  currentUser: { _id: Id<"users">; group?: Id<"groups"> | null },
  isAdmin: boolean,
  companiesById: Map<Id<"companies">, { group?: Id<"groups"> | null }>,
) {
  if (isAdmin) return rows;
  return rows.filter((r) => {
    if (r.createdBy === currentUser._id) return true;
    if (currentUser.group) {
      const company = companiesById.get(r.company);
      const assigned = getUserAssignedGroupIds({
        _id: currentUser._id,
        group: currentUser.group ?? undefined,
      });
      if (company?.group && assigned.includes(company.group)) return true;
    }
    return false;
  });
}

// ============================================================================
// UPDATE (allocations, description, etc.)
// ============================================================================

export const updateReceiptVoucher = mutation({
  args: {
    id: v.id("receiptVouchers"),
    description: v.optional(v.string()),
    references: v.optional(v.array(v.id("invoices"))),
    allocations: v.optional(v.array(allocationInput)),
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "receiptVouchers.updateReceiptVoucher");
    const currentUser = await requirePermission(ctx, "receiptVouchers:update");

    const voucher = await ctx.db.get(args.id);
    if (!voucher) throw new Error("Receipt voucher not found.");

    const patch: Record<string, unknown> = {
      updatedBy: currentUser._id,
      updatedAt: Date.now(),
    };
    const auditChanges: Record<string, { from: unknown; to: unknown }> = {};

    if (args.description !== undefined) {
      auditChanges.description = {
        from: voucher.description ?? null,
        to: args.description,
      };
      patch.description = args.description;
    }

    if (args.references !== undefined) {
      for (const invId of args.references) {
        const inv = await ctx.db.get(invId);
        if (!inv) throw new Error("Invoice not found.");
        if (inv.company && inv.company !== voucher.company) {
          throw new Error("Invoice does not belong to the voucher company.");
        }
      }
      auditChanges.references = {
        from: voucher.references,
        to: args.references,
      };
      patch.references = args.references;
    }

    if (args.allocations !== undefined) {
      const netAmount = voucherNetAmount(voucher);
      validateAllocations(netAmount, args.allocations);
      const references = (args.references ??
        voucher.references ??
        []) as Id<"invoices">[];
      for (const alloc of args.allocations) {
        if (!references.includes(alloc.invoiceId)) {
          throw new Error("Allocated invoice must be in references.");
        }
      }
      const usedAmount = sumAllocations(args.allocations);
      const remainingAmount = netAmount - usedAmount;

      const defaultCurrencyId = await getDefaultCurrencyId(ctx, voucher.group);
      const allCurrencies = await ctx.db.query("currencies").collect();
      const grossInDefault = voucher.amountInDefaultCurrency ?? voucher.amount;
      const { netInDefault } = resolveNetAmounts(
        voucher.amount,
        voucher.paymentMethodTaxAmount,
        grossInDefault,
        voucher.currency,
        defaultCurrencyId,
        allCurrencies,
      );
      const newBalanceCredit = remainingToDefaultAmount(
        remainingAmount,
        voucher.currency,
        netInDefault,
        netAmount,
        defaultCurrencyId,
        allCurrencies,
      );
      const oldBalanceCredit = voucher.balanceCreditInDefault ?? 0;

      patch.allocations =
        args.allocations.length > 0 ? args.allocations : undefined;
      patch.usedAmount = usedAmount;
      patch.remainingAmount = remainingAmount;
      patch.balanceCreditInDefault =
        newBalanceCredit > 0 ? newBalanceCredit : undefined;
      auditChanges.usedAmount = { from: voucher.usedAmount, to: usedAmount };
      auditChanges.remainingAmount = {
        from: voucher.remainingAmount,
        to: remainingAmount,
      };

      await applyPrepaidBalanceDelta(
        ctx,
        voucher.company,
        newBalanceCredit - oldBalanceCredit,
        currentUser._id,
      );
    }

    await ctx.db.patch(args.id, patch);

    if (Object.keys(auditChanges).length > 0) {
      await logAudit(ctx, {
        entityId: args.id as string,
        entityType: "receiptVoucher",
        action: "UPDATED",
        changes: auditChanges,
        performedBy: currentUser._id,
      });
    }

    const affectedInvoices = new Set<Id<"invoices">>();
    for (const alloc of args.allocations ?? voucher.allocations ?? []) {
      affectedInvoices.add(alloc.invoiceId);
    }
    for (const invId of affectedInvoices) {
      await recalcInvoicePaymentStatus(ctx, invId, currentUser._id, args.id);
    }

    return args.id;
  },
});

// ============================================================================
// APPLY EXISTING VOUCHER
// ============================================================================

export const applyExistingReceiptVoucher = mutation({
  args: {
    voucherId: v.id("receiptVouchers"),
    voucherContext: voucherContextValidator,
    invoiceId: v.optional(v.id("invoices")),
    dealId: v.optional(v.id("deals")),
    quoteId: v.optional(v.id("quotes")),
    allocationAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "receiptVouchers.applyExistingReceiptVoucher");
    const currentUser = await requirePermission(ctx, "receiptVouchers:update");

    const voucher = await ctx.db.get(args.voucherId);
    if (!voucher) throw new Error("Receipt voucher not found.");

    const patch: Record<string, unknown> = {
      voucherContext: args.voucherContext,
      updatedBy: currentUser._id,
      updatedAt: Date.now(),
    };
    const auditChanges: Record<string, { from: unknown; to: unknown }> = {
      voucherContext: {
        from: voucher.voucherContext ?? null,
        to: args.voucherContext,
      },
    };

    if (args.dealId) {
      const deal = await ctx.db.get(args.dealId);
      if (!deal) throw new Error("Deal not found.");
      if (deal.company && deal.company !== voucher.company) {
        throw new Error("Deal does not belong to the voucher company.");
      }
      if (voucher.deal && voucher.deal !== args.dealId) {
        throw new Error("Voucher is already linked to another deal.");
      }
      patch.deal = args.dealId;
      auditChanges.deal = { from: voucher.deal ?? null, to: args.dealId };
    }

    if (args.quoteId) {
      const quote = await ctx.db.get(args.quoteId);
      if (!quote) throw new Error("Quote not found.");
      if (quote.company && quote.company !== voucher.company) {
        throw new Error("Quote does not belong to the voucher company.");
      }
      if (voucher.quote && voucher.quote !== args.quoteId) {
        throw new Error("Voucher is already linked to another quote.");
      }
      patch.quote = args.quoteId;
      auditChanges.quote = { from: voucher.quote ?? null, to: args.quoteId };
    }

    const affectedInvoices = new Set<Id<"invoices">>();

    if (args.invoiceId) {
      const allocAmt = args.allocationAmount;
      if (allocAmt == null || allocAmt <= 0) {
        throw new Error("Allocation amount is required.");
      }
      if (allocAmt > voucher.remainingAmount + 0.001) {
        throw new Error("Allocation exceeds voucher remaining amount.");
      }

      const invoice = await ctx.db.get(args.invoiceId);
      if (!invoice) throw new Error("Invoice not found.");
      if (invoice.company && invoice.company !== voucher.company) {
        throw new Error("Invoice does not belong to the voucher company.");
      }

      // All amounts are converted to the default currency for a consistent comparison
      const paidTotalInDefault = await getInvoicePaidTotal(ctx, args.invoiceId);
      const defaultCurrencyIdForCheck = await getDefaultCurrencyId(
        ctx,
        voucher.group,
      );
      const allCurrenciesForCheck = await ctx.db.query("currencies").collect();

      const invoiceTotalInDefault =
        defaultCurrencyIdForCheck &&
        invoice.currency &&
        invoice.currency !== defaultCurrencyIdForCheck
          ? convertAmountFromCurrencyToDefault(
              invoice.total ?? 0,
              invoice.currency,
              defaultCurrencyIdForCheck,
              allCurrenciesForCheck,
            )
          : (invoice.total ?? 0);

      const outstandingInDefault = Math.max(
        0,
        invoiceTotalInDefault - paidTotalInDefault,
      );

      const allocAmtInDefault =
        defaultCurrencyIdForCheck &&
        voucher.currency !== defaultCurrencyIdForCheck
          ? convertAmountFromCurrencyToDefault(
              allocAmt,
              voucher.currency,
              defaultCurrencyIdForCheck,
              allCurrenciesForCheck,
            )
          : allocAmt;

      if (allocAmtInDefault > outstandingInDefault + 0.001) {
        throw new Error("Allocation exceeds invoice outstanding amount.");
      }

      const references = [...(voucher.references ?? [])] as Id<"invoices">[];
      if (!references.includes(args.invoiceId)) {
        references.push(args.invoiceId);
      }

      const allocations = [...(voucher.allocations ?? [])];
      const existingIdx = allocations.findIndex(
        (a) => a.invoiceId === args.invoiceId,
      );

      const defaultCurrencyId = await getDefaultCurrencyId(ctx, voucher.group);
      const allCurrencies = await ctx.db.query("currencies").collect();
      let amountInDefault: number | undefined;
      if (defaultCurrencyId && voucher.currency !== defaultCurrencyId) {
        amountInDefault = convertAmountFromCurrencyToDefault(
          allocAmt,
          voucher.currency,
          defaultCurrencyId,
          allCurrencies,
        );
      }

      if (existingIdx >= 0) {
        const prev = allocations[existingIdx];
        allocations[existingIdx] = {
          invoiceId: args.invoiceId,
          amount: prev.amount + allocAmt,
          amountInDefaultCurrency:
            (prev.amountInDefaultCurrency ?? prev.amount) +
            (amountInDefault ?? allocAmt),
        };
      } else {
        allocations.push({
          invoiceId: args.invoiceId,
          amount: allocAmt,
          amountInDefaultCurrency: amountInDefault,
        });
      }

      const netAmount = voucherNetAmount(voucher);
      validateAllocations(netAmount, allocations);
      const usedAmount = sumAllocations(allocations);
      const remainingAmount = netAmount - usedAmount;

      const grossInDefault = voucher.amountInDefaultCurrency ?? voucher.amount;
      const { netInDefault } = resolveNetAmounts(
        voucher.amount,
        voucher.paymentMethodTaxAmount,
        grossInDefault,
        voucher.currency,
        defaultCurrencyId,
        allCurrencies,
      );
      const newBalanceCredit = remainingToDefaultAmount(
        remainingAmount,
        voucher.currency,
        netInDefault,
        netAmount,
        defaultCurrencyId,
        allCurrencies,
      );
      const oldBalanceCredit = voucher.balanceCreditInDefault ?? 0;

      patch.references = references;
      patch.allocations = allocations;
      patch.usedAmount = usedAmount;
      patch.remainingAmount = remainingAmount;
      patch.balanceCreditInDefault =
        newBalanceCredit > 0 ? newBalanceCredit : undefined;

      auditChanges.references = { from: voucher.references, to: references };
      auditChanges.allocations = { from: voucher.allocations, to: allocations };
      auditChanges.usedAmount = { from: voucher.usedAmount, to: usedAmount };
      auditChanges.remainingAmount = {
        from: voucher.remainingAmount,
        to: remainingAmount,
      };

      await applyPrepaidBalanceDelta(
        ctx,
        voucher.company,
        newBalanceCredit - oldBalanceCredit,
        currentUser._id,
      );

      affectedInvoices.add(args.invoiceId);
    }

    await ctx.db.patch(args.voucherId, patch);

    await logAudit(ctx, {
      entityId: args.voucherId as string,
      entityType: "receiptVoucher",
      action: "UPDATED",
      changes: auditChanges,
      performedBy: currentUser._id,
    });

    for (const invId of affectedInvoices) {
      await recalcInvoicePaymentStatus(
        ctx,
        invId,
        currentUser._id,
        args.voucherId,
      );
    }

    return args.voucherId;
  },
});

// ============================================================================
// GET LINKABLE VOUCHERS
// ============================================================================

export const getLinkableReceiptVouchers = query({
  args: {
    companyId: v.id("companies"),
    requireRemaining: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "receiptVouchers.getLinkableReceiptVouchers");
    const currentUser = await requirePermission(ctx, "receiptVouchers:read");
    const role = await ctx.db.get(currentUser.role as Id<"roles">);
    const isAdmin = role?.permissions.includes("admin:all") ?? false;

    let rows = await ctx.db
      .query("receiptVouchers")
      .withIndex("by_company", (q) => q.eq("company", args.companyId))
      .order("desc")
      .collect();

    if (args.requireRemaining) {
      rows = rows.filter((r) => r.remainingAmount > 0.001);
    }

    const companies = await ctx.db.query("companies").collect();
    const companiesById = new Map(companies.map((c) => [c._id, c]));
    rows = filterVouchersByVisibility(
      rows,
      currentUser,
      isAdmin,
      companiesById,
    );

    return rows;
  },
});

export const getReceiptVouchers = query({
  args: {
    companyId: v.optional(v.id("companies")),
    invoiceId: v.optional(v.id("invoices")),
    orgGroupId: orgGroupFilterValidator,
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "receiptVouchers.getReceiptVouchers");
    const currentUser = await requirePermission(ctx, "receiptVouchers:read");
    const role = await ctx.db.get(currentUser.role as Id<"roles">);
    const isAdmin = role?.permissions.includes("admin:all") ?? false;
    const accessible = await getAccessibleOrgGroupIds(
      ctx,
      currentUser,
      isAdmin,
    );
    const filter = resolveOrgGroupFilter(args.orgGroupId, accessible, isAdmin);

    let rows = args.companyId
      ? await ctx.db
          .query("receiptVouchers")
          .withIndex("by_company", (q) => q.eq("company", args.companyId!))
          .order("desc")
          .collect()
      : await ctx.db.query("receiptVouchers").order("desc").collect();

    if (args.invoiceId) {
      rows = rows.filter((r) => (r.references ?? []).includes(args.invoiceId!));
    }

    const companies = await ctx.db.query("companies").collect();
    const companiesById = new Map(companies.map((c) => [c._id, c]));
    rows = filterVouchersByVisibility(
      rows,
      currentUser,
      isAdmin,
      companiesById,
    );

    const withGroup = rows.map((row) => ({
      ...row,
      group: row.group ?? companiesById.get(row.company)?.group,
    }));

    return filterByOrgGroup(withGroup, filter, accessible);
  },
});

function canReadVoucherRow(
  voucher: Doc<"receiptVouchers"> & { group?: Id<"groups"> | null },
  user: Doc<"users">,
  isAdmin: boolean,
  accessible: Id<"groups">[],
) {
  const group = voucher.group;
  if (!rowInAccessibleGroups({ group }, accessible)) return false;
  if (isAdmin) return true;
  if (voucher.createdBy === user._id) return true;
  if (group) {
    const assigned = getUserAssignedGroupIds({
      _id: user._id,
      group: user.group ?? undefined,
      assignedGroups: user.assignedGroups,
    });
    if (assigned.includes(group)) return true;
  }
  return false;
}

export const listReceiptVouchersPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    orgGroupId: orgGroupFilterValidator,
    search: listSearchValidator,
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "receiptVouchers.listReceiptVouchersPaginated");
    const { user, isAdmin, accessible } = await getListAuth(
      ctx,
      "receiptVouchers:read",
    );
    const term = normalizeSearch(args.search);
    const groupIds = resolveGroupIdsForList(args.orgGroupId, accessible);
    const orgFilter = resolveOrgGroupFilter(
      args.orgGroupId,
      accessible,
      isAdmin,
    );

    const buildFetch = (opts: typeof args.paginationOpts) => {
      if (groupIds.length === 1) {
        return ctx.db
          .query("receiptVouchers")
          .withIndex("by_group", (q) => q.eq("group", groupIds[0]))
          .order("desc")
          .paginate(opts);
      }
      return ctx.db.query("receiptVouchers").order("desc").paginate(opts);
    };

    const result = await paginateWithPredicate(
      buildFetch,
      args.paginationOpts,
      (voucher) => {
        if (!canReadVoucherRow(voucher, user, isAdmin, accessible)) {
          return false;
        }
        if (orgFilter !== "all" && orgFilter && voucher.group !== orgFilter) {
          return false;
        }
        if (!term) return true;
        if (voucher.number?.toLowerCase().includes(term)) return true;
        return false;
      },
    );

    const companyMap = await loadCompanyNameMap(
      ctx,
      result.page.map((v) => v.company),
    );

    const currencyIds = [
      ...new Set(result.page.map((v) => v.currency)),
    ] as Id<"currencies">[];
    const currencyRows = await Promise.all(
      currencyIds.map((id) => ctx.db.get(id)),
    );
    const currencySymbolMap = new Map(
      currencyRows
        .filter((row): row is NonNullable<typeof row> => row != null)
        .map((row) => [row._id, row.symbol] as const),
    );

    const page = term
      ? result.page.filter((voucher) =>
          voucherMatchesSearch(voucher, term, companyMap.get(voucher.company)),
        )
      : result.page;

    return {
      ...result,
      page: page.map((voucher) => ({
        ...voucher,
        companyName: companyMap.get(voucher.company) ?? "—",
        currencySymbol: currencySymbolMap.get(voucher.currency) ?? null,
      })),
    };
  },
});

export const getReceiptVoucherListStats = query({
  args: { orgGroupId: orgGroupFilterValidator },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "receiptVouchers.getReceiptVoucherListStats");
    const { user, isAdmin, accessible } = await getListAuth(
      ctx,
      "receiptVouchers:read",
    );
    const orgFilter = resolveOrgGroupFilter(
      args.orgGroupId,
      accessible,
      isAdmin,
    );
    const groupIds = resolveGroupIdsForList(args.orgGroupId, accessible);

    let rows: Doc<"receiptVouchers">[];
    if (groupIds.length === 1) {
      rows = await ctx.db
        .query("receiptVouchers")
        .withIndex("by_group", (q) => q.eq("group", groupIds[0]))
        .collect();
    } else {
      rows = await ctx.db.query("receiptVouchers").collect();
    }

    const companies = await ctx.db.query("companies").collect();
    const companiesById = new Map(companies.map((c) => [c._id, c]));
    rows = filterVouchersByVisibility(rows, user, isAdmin, companiesById);
    const withGroup = rows.map((row) => ({
      ...row,
      group: row.group ?? companiesById.get(row.company)?.group,
    }));
    const filtered = filterByOrgGroup(withGroup, orgFilter, accessible);

    return {
      total: filtered.length,
      totalAmount: filtered.reduce((s, r) => s + (r.amount ?? 0), 0),
      totalUsed: filtered.reduce((s, r) => s + (r.usedAmount ?? 0), 0),
      totalRemaining: filtered.reduce(
        (s, r) => s + (r.remainingAmount ?? 0),
        0,
      ),
    };
  },
});

export const getReceiptVoucherWithDetails = query({
  args: { id: v.id("receiptVouchers") },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "receiptVouchers.getReceiptVoucherWithDetails");
    const voucher = await loadVoucherIfReadable(ctx, args.id);
    if (!voucher) return null;

    const company = await ctx.db.get(voucher.company);
    const contact = await ctx.db.get(voucher.contact);
    const currency = await ctx.db.get(voucher.currency);

    const invoices = await Promise.all(
      (voucher.references ?? []).map(async (invId) => {
        const inv = await ctx.db.get(invId);
        return inv
          ? {
              _id: inv._id,
              number: inv.number,
              total: inv.total,
              status: inv.status,
            }
          : null;
      }),
    );

    return {
      voucher,
      companyName: company?.name ?? null,
      contactName: contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
          contact.email ||
          "—"
        : null,
      currencySymbol: currency?.symbol ?? null,
      invoices: invoices.filter(Boolean),
    };
  },
});

/** Payment summary for an invoice (receipt voucher form) */
export const getInvoicePaymentInfo = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "receiptVouchers.getInvoicePaymentInfo");
    await requirePermission(ctx, "receiptVouchers:read");
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;

    // paidTotal from DB is always in the DEFAULT currency
    const paidTotalInDefault = await getInvoicePaidTotal(ctx, args.invoiceId);
    const total = invoice.total ?? 0;

    // Convert paidTotal back to the invoice's own currency for display
    const defaultCurrencyId = await getDefaultCurrencyIdForGroup(
      ctx,
      invoice.group,
    );
    const allCurrencies = await ctx.db.query("currencies").collect();
    const paidTotal =
      invoice.currency &&
      defaultCurrencyId &&
      invoice.currency !== defaultCurrencyId
        ? convertAmountFromDefaultToCurrencyNumber(
            paidTotalInDefault,
            invoice.currency,
            defaultCurrencyId,
            allCurrencies,
          )
        : paidTotalInDefault;

    const outstanding = Math.max(0, total - paidTotal);

    return {
      invoiceId: args.invoiceId,
      number: invoice.number,
      total,
      paidTotal,
      outstanding,
      company: invoice.company,
      contact: invoice.contact,
      currency: invoice.currency,
      status: invoice.status,
    };
  },
});

export const getReceiptVoucherAuditLog = query({
  args: { id: v.id("receiptVouchers") },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "receiptVouchers.getReceiptVoucherAuditLog");
    const voucher = await loadVoucherIfReadable(ctx, args.id);
    if (!voucher) return null;

    const creator = await ctx.db.get(voucher.createdBy);
    const lastEditor = voucher.updatedBy
      ? await ctx.db.get(voucher.updatedBy)
      : null;

    const raw = await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) => q.eq("entityId", args.id as string))
      .collect();
    const rows = raw
      .filter(
        (row) =>
          row.entityType === "receiptVoucher" &&
          row.entityId === (args.id as string),
      )
      .sort((a, b) => b.timestamp - a.timestamp);

    const nameCache = new Map<string, string>();
    const nameFor = async (userId: Id<"users">) => {
      if (nameCache.has(userId)) return nameCache.get(userId)!;
      const u = await ctx.db.get(userId);
      const n = displayNameForUser(u);
      nameCache.set(userId, n);
      return n;
    };

    const entries = await Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        action: row.action,
        timestamp: row.timestamp,
        changes: row.changes,
        performedById: row.performedBy,
        performedByName: await nameFor(row.performedBy),
      })),
    );

    return {
      voucherNumber: voucher.number,
      documentCreatedByName: displayNameForUser(creator),
      documentLastUpdatedByName: lastEditor
        ? displayNameForUser(lastEditor)
        : null,
      documentCreatedAt: voucher._creationTime,
      documentUpdatedAt: voucher.updatedAt ?? null,
      entries,
    };
  },
});

/** One-time: normalize exchangeRateUsed to default units per 1 foreign unit. */
export const repairVoucherExchangeRates = internalMutation({
  args: {},
  handler: async (ctx) => {
    const vouchers = await ctx.db.query("receiptVouchers").collect();
    const allCurrencies = await ctx.db.query("currencies").collect();
    let repaired = 0;

    for (const voucher of vouchers) {
      const defaultCurrencyId = await getDefaultCurrencyIdForGroup(
        ctx,
        voucher.group,
      );
      if (
        !defaultCurrencyId ||
        voucher.currency === defaultCurrencyId ||
        voucher.amount <= 0
      ) {
        continue;
      }

      const storedDefault = voucher.amountInDefaultCurrency;
      let nextRate: number | null = null;
      if (storedDefault != null && storedDefault > 0) {
        nextRate = storedDefault / voucher.amount;
      } else if (
        voucher.exchangeRateUsed != null &&
        voucher.exchangeRateUsed > 0 &&
        voucher.exchangeRateUsed < 1
      ) {
        nextRate = 1 / voucher.exchangeRateUsed;
      }

      if (nextRate == null || !Number.isFinite(nextRate) || nextRate <= 0) {
        continue;
      }

      const patch: {
        exchangeRateUsed: number;
        amountInDefaultCurrency?: number;
        netAmountInDefaultCurrency?: number;
      } = { exchangeRateUsed: nextRate };

      if (storedDefault == null) {
        patch.amountInDefaultCurrency = voucher.amount * nextRate;
        const tax = voucher.paymentMethodTaxAmount ?? 0;
        const taxInDefault =
          tax > 0
            ? convertAmountFromCurrencyToDefault(
                tax,
                voucher.currency,
                defaultCurrencyId,
                allCurrencies,
              )
            : 0;
        patch.netAmountInDefaultCurrency =
          patch.amountInDefaultCurrency - taxInDefault;
      }

      const current = voucher.exchangeRateUsed;
      if (
        current == null ||
        Math.abs(current - nextRate) > 0.0001 ||
        storedDefault == null
      ) {
        await ctx.db.patch(voucher._id, patch);
        repaired++;
      }
    }

    return { repaired };
  },
});

/** Full receipt voucher data for PDF printing */
export const getVoucherForPrint = query({
  args: { id: v.id("receiptVouchers") },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "receiptVouchers.getVoucherForPrint");
    const voucher = await loadVoucherIfReadable(ctx, args.id);
    if (!voucher) return null;

    const company = await ctx.db.get(voucher.company);
    const contact = await ctx.db.get(voucher.contact);
    const currency = await ctx.db.get(voucher.currency);
    const group = await getGroupBrandingForPrint(ctx, voucher.group ?? undefined);

    // Linked invoices with their allocations
    const allocations = voucher.allocations ?? [];
    const invoiceDetails = await Promise.all(
      allocations.map(async (alloc) => {
        const inv = await ctx.db.get(alloc.invoiceId);
        return inv
          ? {
              invoiceId: inv._id,
              number: inv.number ?? "—",
              total: inv.total ?? 0,
              allocated: alloc.amount,
              allocatedInDefault: alloc.amountInDefaultCurrency ?? null,
            }
          : null;
      }),
    );

    return {
      voucher,
      company: company
        ? {
            name: company.name,
            address: company.address,
            city: company.city,
            country: company.country,
            phone: company.phoneNumber,
            email: company.email,
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
          }
        : null,
      group,
      currencySymbol: currency?.symbol ?? null,
      currencyName: currency?.name ?? null,
      invoiceDetails: invoiceDetails.filter(Boolean),
    };
  },
});
