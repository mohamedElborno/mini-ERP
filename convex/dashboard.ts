import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import {
  amountInDefaultCurrency,
  convertAmountFromCurrencyToDefault,
} from "./quoteFinance";
import { computeCreditSummary } from "./companyCredit";
import { getInvoicePaidTotal } from "./receiptVouchers";
import {
  canReadInvoiceRow,
  canReadQuoteRow,
  loadAccessibleDealIds,
  rowInAccessibleGroups,
} from "./listPagination";
import {
  filterByOrgGroup,
  getAccessibleOrgGroupIds,
  getDefaultCurrencyIdForGroup,
  getUserAssignedGroupIds,
  orgGroupFilterValidator,
  resolveOrgGroupFilter,
} from "./orgGroupHelpers";

const MS_DAY = 86_400_000;
const RECENT_ACTIVITY_SCAN = 80;
const RECENT_ACTIVITY_LIMIT = 10;

function displayNameForUser(u: Doc<"users"> | null | undefined): string {
  if (!u) return "—";
  const n = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (n.length > 0) return n;
  return u.email ?? "—";
}

function inPeriod(
  doc: { _creationTime: number; updatedAt?: number | null },
  periodStart: number,
  periodEnd: number,
) {
  const t = doc.updatedAt ?? doc._creationTime;
  return t >= periodStart && t <= periodEnd;
}

async function loadUserWithRole(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user || !user.role) throw new Error("Unauthorized");

  const role = await ctx.db.get(user.role as Id<"roles">);
  const permissions = role?.permissions ?? [];
  const isAdmin = permissions.includes("admin:all");

  return { user, isAdmin, permissions };
}

function can(
  permissions: string[],
  isAdmin: boolean,
  permission: string,
): boolean {
  return isAdmin || permissions.includes(permission);
}

async function collectAccessibleCompanies(
  ctx: any,
  user: any,
  isAdmin: boolean,
  orgGroupFilter: Id<"groups"> | "all",
  accessible: Id<"groups">[],
) {
  let rows: any[];
  if (isAdmin) {
    rows = await ctx.db.query("companies").collect();
  } else {
    const myOwned = await ctx.db
      .query("companies")
      .withIndex("by_owner", (q: any) => q.eq("owner", user._id))
      .collect();

    const assigned = getUserAssignedGroupIds(user);
    const groupCompanies = await Promise.all(
      assigned.map((groupId) =>
        ctx.db
          .query("companies")
          .withIndex("by_group", (q: any) => q.eq("group", groupId))
          .collect(),
      ),
    );

    rows = Array.from(
      new Map(
        [...myOwned, ...groupCompanies.flat()].map((item) => [item._id, item]),
      ).values(),
    );
  }
  return filterByOrgGroup(rows, orgGroupFilter, accessible);
}

async function collectAccessibleDeals(
  ctx: any,
  user: any,
  isAdmin: boolean,
  orgGroupFilter: Id<"groups"> | "all",
  accessible: Id<"groups">[],
) {
  let rows: any[];
  if (isAdmin) {
    rows = await ctx.db.query("deals").collect();
  } else {
    const myOwnedDeals = await ctx.db
      .query("deals")
      .withIndex("by_owner", (q: any) => q.eq("owner", user._id))
      .collect();

    const assigned = getUserAssignedGroupIds(user);
    const groupDeals = await Promise.all(
      assigned.map((groupId) =>
        ctx.db
          .query("deals")
          .withIndex("by_group", (q: any) => q.eq("group", groupId))
          .collect(),
      ),
    );

    rows = Array.from(
      new Map(
        [...myOwnedDeals, ...groupDeals.flat()].map((item) => [item._id, item]),
      ).values(),
    );
  }
  return filterByOrgGroup(rows, orgGroupFilter, accessible);
}

async function collectAccessibleInvoices(
  ctx: any,
  user: any,
  isAdmin: boolean,
  orgGroupFilter: Id<"groups"> | "all",
  accessible: Id<"groups">[],
) {
  let rows: any[];
  if (isAdmin) {
    rows = await ctx.db.query("invoices").order("desc").collect();
  } else {
    const myCreatedInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_createdBy", (q: any) => q.eq("createdBy", user._id))
      .collect();

    const assigned = getUserAssignedGroupIds(user);
    const groupInvoices = await Promise.all(
      assigned.map((groupId) =>
        ctx.db
          .query("invoices")
          .withIndex("by_group", (q: any) => q.eq("group", groupId))
          .collect(),
      ),
    );

    rows = Array.from(
      new Map(
        [...myCreatedInvoices, ...groupInvoices.flat()].map((item) => [
          item._id,
          item,
        ]),
      ).values(),
    );
  }
  return filterByOrgGroup(rows, orgGroupFilter, accessible);
}

async function collectAccessibleReceiptVouchers(
  ctx: any,
  user: Doc<"users">,
  isAdmin: boolean,
  orgGroupFilter: Id<"groups"> | "all",
  accessible: Id<"groups">[],
) {
  let rows: Doc<"receiptVouchers">[];
  if (isAdmin) {
    rows = await ctx.db.query("receiptVouchers").collect();
  } else {
    const myCreated = await ctx.db
      .query("receiptVouchers")
      .withIndex("by_createdBy", (q: any) => q.eq("createdBy", user._id))
      .collect();
    const assigned = getUserAssignedGroupIds(user);
    const groupVouchers = await Promise.all(
      assigned.map((groupId) =>
        ctx.db
          .query("receiptVouchers")
          .withIndex("by_group", (q: any) => q.eq("group", groupId))
          .collect(),
      ),
    );
    rows = Array.from(
      new Map(
        [...myCreated, ...groupVouchers.flat()].map((item) => [item._id, item]),
      ).values(),
    );
  }

  const companies = (await ctx.db
    .query("companies")
    .collect()) as Doc<"companies">[];
  const companiesById = new Map(companies.map((c) => [c._id, c]));
  const withGroup = rows.map((row) => ({
    ...row,
    group: row.group ?? companiesById.get(row.company)?.group,
  }));

  const visible = withGroup.filter((voucher) =>
    canReadVoucherRow(voucher, user, isAdmin, accessible),
  );
  return filterByOrgGroup(visible, orgGroupFilter, accessible);
}

function voucherTimestamp(voucher: Doc<"receiptVouchers">) {
  return voucher.issueDate ?? voucher.updatedAt ?? voucher._creationTime;
}

function voucherNetAmount(voucher: Doc<"receiptVouchers">) {
  return (
    voucher.netAmount ??
    voucher.amount - (voucher.paymentMethodTaxAmount ?? 0)
  );
}

async function getDefaultCurrencyFromCache(
  ctx: any,
  groupId: Id<"groups"> | undefined,
  cache: Map<string, Id<"currencies"> | undefined>,
) {
  const groupKey = groupId ?? "__none__";
  if (!cache.has(groupKey)) {
    cache.set(groupKey, await getDefaultCurrencyIdForGroup(ctx, groupId));
  }
  return cache.get(groupKey);
}

/** Allocated (used) portion of a receipt voucher, in the default currency. */
async function voucherUsedInDefault(
  ctx: any,
  voucher: Doc<"receiptVouchers">,
  currencies: Array<{
    _id: Id<"currencies">;
    exchangeRate?: number | null;
    default?: boolean | null;
  }>,
  cache: Map<string, Id<"currencies"> | undefined>,
) {
  const defaultCurrencyId = await getDefaultCurrencyFromCache(
    ctx,
    voucher.group,
    cache,
  );

  if (voucher.allocations?.length) {
    return voucher.allocations.reduce((sum, alloc) => {
      if (alloc.amountInDefaultCurrency != null) {
        return sum + alloc.amountInDefaultCurrency;
      }
      return (
        sum +
        convertAmountFromCurrencyToDefault(
          alloc.amount,
          voucher.currency,
          defaultCurrencyId,
          currencies,
        )
      );
    }, 0);
  }

  const used = voucher.usedAmount ?? 0;
  if (used <= 0) return 0;

  if (!defaultCurrencyId || voucher.currency === defaultCurrencyId) {
    return used;
  }

  const netAmount = voucherNetAmount(voucher);
  const netInDefault =
    voucher.netAmountInDefaultCurrency ?? voucher.amountInDefaultCurrency;
  if (netInDefault != null && netAmount > 0) {
    return (used / netAmount) * netInDefault;
  }

  return convertAmountFromCurrencyToDefault(
    used,
    voucher.currency,
    defaultCurrencyId,
    currencies,
  );
}

async function collectAccessibleQuotes(
  ctx: any,
  user: Doc<"users">,
  isAdmin: boolean,
  orgGroupFilter: Id<"groups"> | "all",
  accessible: Id<"groups">[],
) {
  const accessibleDealIds = await loadAccessibleDealIds(
    ctx,
    user,
    isAdmin,
    accessible,
  );

  let rows: Doc<"quotes">[];
  if (isAdmin) {
    rows = await ctx.db.query("quotes").collect();
  } else {
    const myCreated = await ctx.db
      .query("quotes")
      .withIndex("by_createdBy", (q: any) => q.eq("createdBy", user._id))
      .collect();
    const fromDeals: Doc<"quotes">[] = [];
    if (accessibleDealIds) {
      for (const dealId of accessibleDealIds) {
        const qs = await ctx.db
          .query("quotes")
          .withIndex("by_deal", (q: any) => q.eq("deal", dealId))
          .collect();
        fromDeals.push(...qs);
      }
    }
    rows = Array.from(
      new Map(
        [...myCreated, ...fromDeals].map((item) => [item._id, item]),
      ).values(),
    );
  }

  rows = rows.filter((q) =>
    canReadQuoteRow(q, user, isAdmin, accessible, accessibleDealIds),
  );
  return filterByOrgGroup(rows, orgGroupFilter, accessible);
}

function canReadVoucherRow(
  voucher: Doc<"receiptVouchers">,
  user: Doc<"users">,
  isAdmin: boolean,
  accessible: Id<"groups">[],
) {
  if (!rowInAccessibleGroups(voucher, accessible)) return false;
  if (isAdmin) return true;
  if (voucher.createdBy === user._id) return true;
  if (voucher.group) {
    const assigned = getUserAssignedGroupIds(user);
    if (assigned.includes(voucher.group)) return true;
  }
  return false;
}

async function documentTotalInDefault(
  ctx: any,
  doc: {
    total?: number;
    currency?: Id<"currencies">;
    group?: Id<"groups">;
  },
  currencies: Array<{
    _id: Id<"currencies">;
    exchangeRate?: number | null;
    default?: boolean | null;
  }>,
  cache: Map<string, Id<"currencies"> | undefined>,
) {
  const groupKey = doc.group ?? "__none__";
  if (!cache.has(groupKey)) {
    cache.set(groupKey, await getDefaultCurrencyIdForGroup(ctx, doc.group));
  }
  const defaultCurrencyId = cache.get(groupKey);
  return amountInDefaultCurrency(
    doc.total,
    doc.currency ?? defaultCurrencyId,
    defaultCurrencyId,
    currencies,
  );
}

async function loadRecentActivity(
  ctx: any,
  user: Doc<"users">,
  isAdmin: boolean,
  permissions: string[],
  accessible: Id<"groups">[],
  orgGroupFilter: Id<"groups"> | "all",
) {
  const canQuotes = can(permissions, isAdmin, "quotes:read");
  const canVouchers = can(permissions, isAdmin, "receiptVouchers:read");
  if (!canQuotes && !canVouchers) {
    return {
      canReadActivity: false,
      items: [] as Array<{
        _id: Id<"auditLogs">;
        timestamp: number;
        action: string;
        entityType: string;
        entityId: string;
        entityLabel: string | null;
        performedByName: string;
        changes: unknown;
      }>,
    };
  }

  const accessibleDealIds = canQuotes
    ? await loadAccessibleDealIds(ctx, user, isAdmin, accessible)
    : null;

  const candidates = await ctx.db
    .query("auditLogs")
    .withIndex("by_timestamp")
    .order("desc")
    .take(RECENT_ACTIVITY_SCAN);

  const nameCache = new Map<string, string>();
  const nameFor = async (userId: Id<"users">) => {
    if (nameCache.has(userId)) return nameCache.get(userId)!;
    const u = await ctx.db.get(userId);
    const n = displayNameForUser(u);
    nameCache.set(userId, n);
    return n;
  };

  const items: Array<{
    _id: Id<"auditLogs">;
    timestamp: number;
    action: string;
    entityType: string;
    entityId: string;
    entityLabel: string | null;
    performedByName: string;
    changes: unknown;
  }> = [];

  for (const row of candidates) {
    if (items.length >= RECENT_ACTIVITY_LIMIT) break;

    let visible = false;
    let entityLabel: string | null = null;

    if (row.entityType === "quote" && canQuotes) {
      const quote = await ctx.db.get(row.entityId as Id<"quotes">);
      if (
        quote &&
        canReadQuoteRow(quote, user, isAdmin, accessible, accessibleDealIds) &&
        filterByOrgGroup([quote], orgGroupFilter, accessible).length > 0
      ) {
        visible = true;
        entityLabel = quote.number ?? null;
      }
    } else if (row.entityType === "receiptVoucher" && canVouchers) {
      const voucher = await ctx.db.get(row.entityId as Id<"receiptVouchers">);
      if (
        voucher &&
        canReadVoucherRow(voucher, user, isAdmin, accessible) &&
        filterByOrgGroup([voucher], orgGroupFilter, accessible).length > 0
      ) {
        visible = true;
        entityLabel = voucher.number ?? null;
      }
    }

    if (!visible) continue;

    items.push({
      _id: row._id,
      timestamp: row.timestamp,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      entityLabel,
      performedByName: await nameFor(row.performedBy),
      changes: row.changes,
    });
  }

  return { canReadActivity: true, items };
}

function computeBucketMs(periodStart: number, periodEnd: number): number {
  const rangeDays = Math.max(1, (periodEnd - periodStart) / MS_DAY);
  if (rangeDays <= 45) return MS_DAY;
  if (rangeDays <= 400) return 7 * MS_DAY;
  return 30 * MS_DAY;
}

type DefaultCurrencyCache = Map<string, Id<"currencies"> | undefined>;

async function dealValueInDefault(
  ctx: any,
  deal: { value?: number; currency?: Id<"currencies">; group?: Id<"groups"> },
  currencies: Array<{
    _id: Id<"currencies">;
    exchangeRate?: number | null;
    default?: boolean | null;
  }>,
  cache: Map<string, Id<"currencies"> | undefined>,
) {
  return documentTotalInDefault(
    ctx,
    { total: deal.value, currency: deal.currency, group: deal.group },
    currencies,
    cache,
  );
}

export const getDashboardMetrics = query({
  args: {
    periodPreset: v.optional(
      v.union(v.literal("7d"), v.literal("30d"), v.literal("90d")),
    ),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
    orgGroupId: orgGroupFilterValidator,
  },
  handler: async (ctx, args) => {
    let periodStart: number;
    let periodEnd: number;

    if (args.periodPreset) {
      periodEnd = Date.now();
      const days =
        args.periodPreset === "7d" ? 7 : args.periodPreset === "30d" ? 30 : 90;
      periodStart = periodEnd - days * MS_DAY;
    } else if (args.periodStart != null && args.periodEnd != null) {
      periodStart = args.periodStart;
      periodEnd = args.periodEnd;
    } else {
      throw new Error("Dashboard period is required.");
    }

    const { user, isAdmin, permissions } = await loadUserWithRole(ctx);
    const accessible = await getAccessibleOrgGroupIds(ctx, user, isAdmin);
    const filter = resolveOrgGroupFilter(args.orgGroupId, accessible, isAdmin);

    const canCompanies = can(permissions, isAdmin, "companies:read");
    const canDeals = can(permissions, isAdmin, "deals:read");
    const canInvoices = can(permissions, isAdmin, "invoices:read");
    const canQuotes = can(permissions, isAdmin, "quotes:read");
    const canVouchers = can(permissions, isAdmin, "receiptVouchers:read");

    const currencies = await ctx.db.query("currencies").collect();
    const defaultCurrencyCache = new Map<
      string,
      Id<"currencies"> | undefined
    >();

    // Accumulates company IDs across all accessible document types to count active clients
    const activeClientIdsInPeriod = new Set<string>();
    let receiptVouchersCount: number | null = null;

    let clientsCount: number | null = null;
    let creditSummary: {
      totalLimit: number;
      totalUsed: number;
      totalRemaining: number;
    } | null = null;

    if (canCompanies) {
      const companies = await collectAccessibleCompanies(
        ctx,
        user,
        isAdmin,
        filter,
        accessible,
      );
      clientsCount = companies.length;

      let totalLimit = 0;
      let totalUsed = 0;
      for (const company of companies) {
        const summary = computeCreditSummary(company);
        totalLimit += summary.creditLimit;
        totalUsed += summary.creditUsed;
      }
      creditSummary = {
        totalLimit,
        totalUsed,
        totalRemaining: Math.max(0, totalLimit - totalUsed),
      };
    }

    let dealsTotal: number | null = null;
    let wonDealsCount: number | null = null;
    let lostDealsCount: number | null = null;
    let dealsValueSummary: {
      totalValue: number;
      wonValue: number;
      wonInvoicesValue: number | null;
    } | null = null;

    if (canDeals) {
      const deals = await collectAccessibleDeals(
        ctx,
        user,
        isAdmin,
        filter,
        accessible,
      );
      dealsTotal = deals.length;
      wonDealsCount = deals.filter((d: any) => d.stage === "won").length;
      lostDealsCount = deals.filter((d: any) => d.stage === "lost").length;

      let totalValue = 0;
      let wonValue = 0;
      const wonDeals: Doc<"deals">[] = [];
      for (const deal of deals as Doc<"deals">[]) {
        const value = await dealValueInDefault(
          ctx,
          deal,
          currencies,
          defaultCurrencyCache,
        );
        totalValue += value;
        if (deal.stage === "won") {
          wonValue += value;
          wonDeals.push(deal);
        }
      }

      // Sum actual invoice totals for won deals (only when the user can read invoices)
      let wonInvoicesValue: number | null = null;
      if (canInvoices && wonDeals.length > 0) {
        wonInvoicesValue = 0;
        for (const deal of wonDeals) {
          const dealInvoices = await ctx.db
            .query("invoices")
            .withIndex("by_deal", (q: any) => q.eq("deal", deal._id))
            .collect();
          for (const inv of dealInvoices) {
            wonInvoicesValue += await documentTotalInDefault(
              ctx,
              inv,
              currencies,
              defaultCurrencyCache,
            );
          }
        }
      }

      dealsValueSummary = { totalValue, wonValue, wonInvoicesValue };

      // Track active clients from deals in the period
      for (const deal of deals as Doc<"deals">[]) {
        if (inPeriod(deal, periodStart, periodEnd) && deal.company) {
          activeClientIdsInPeriod.add(deal.company);
        }
      }
    }

    let paidSalesTotal: number | null = null;
    const salesSeries: Array<{ date: string; sales: number }> = [];
    let invoiceSummary: {
      count: number;
      totalValue: number;
      approvedCount: number;
      cancelledCount: number;
    } | null = null;

    if (canVouchers) {
      const vouchers = await collectAccessibleReceiptVouchers(
        ctx,
        user,
        isAdmin,
        filter,
        accessible,
      );
      const vouchersInPeriod = vouchers.filter((voucher) => {
        const t = voucherTimestamp(voucher);
        return t >= periodStart && t <= periodEnd;
      });

      paidSalesTotal = 0;
      for (const voucher of vouchersInPeriod) {
        paidSalesTotal += await voucherUsedInDefault(
          ctx,
          voucher,
          currencies,
          defaultCurrencyCache,
        );
      }

      const bucketMs = computeBucketMs(periodStart, periodEnd);
      const bucketTotals = new Map<number, number>();

      for (const voucher of vouchersInPeriod) {
        const t = voucherTimestamp(voucher);
        const idx = Math.floor((t - periodStart) / bucketMs);
        const bucketStart = periodStart + idx * bucketMs;
        if (bucketStart > periodEnd) continue;
        const amount = await voucherUsedInDefault(
          ctx,
          voucher,
          currencies,
          defaultCurrencyCache,
        );
        bucketTotals.set(
          bucketStart,
          (bucketTotals.get(bucketStart) ?? 0) + amount,
        );
      }

      for (let t = periodStart; t <= periodEnd; t += bucketMs) {
        salesSeries.push({
          date: new Date(t).toISOString().slice(0, 10),
          sales: bucketTotals.get(t) ?? 0,
        });
      }

      // Count vouchers in the period and track active clients
      receiptVouchersCount = vouchersInPeriod.length;
      for (const voucher of vouchersInPeriod) {
        activeClientIdsInPeriod.add(voucher.company);
      }
    }

    if (canInvoices) {
      const invoices = await collectAccessibleInvoices(
        ctx,
        user,
        isAdmin,
        filter,
        accessible,
      );
      const accessibleDealIds = await loadAccessibleDealIds(
        ctx,
        user,
        isAdmin,
        accessible,
      );
      const readableInvoices = invoices.filter((inv: Doc<"invoices">) =>
        canReadInvoiceRow(inv, user, isAdmin, accessible, accessibleDealIds),
      );
      const invoicesInPeriod = readableInvoices.filter((inv) =>
        inPeriod(inv, periodStart, periodEnd),
      );

      let invoiceTotalValue = 0;
      for (const inv of invoicesInPeriod) {
        const status = inv.status ?? "draft";
        if (status === "paid") {
          invoiceTotalValue += await documentTotalInDefault(
            ctx,
            inv,
            currencies,
            defaultCurrencyCache,
          );
        } else if (status === "partially_paid") {
          invoiceTotalValue += await getInvoicePaidTotal(ctx, inv._id);
        }
      }
      invoiceSummary = {
        count: invoicesInPeriod.length,
        totalValue: invoiceTotalValue,
        approvedCount: invoicesInPeriod.filter(
          (inv) => inv.status === "paid" || inv.status === "partially_paid",
        ).length,
        cancelledCount: invoicesInPeriod.filter((inv) => inv.status === "void")
          .length,
      };

      // Track active clients from invoices in the period
      for (const inv of invoicesInPeriod) {
        if (inv.company) activeClientIdsInPeriod.add(inv.company);
      }
    }

    let quoteSummary: {
      count: number;
      totalValue: number;
      approvedCount: number;
      cancelledCount: number;
    } | null = null;

    if (canQuotes) {
      const quotes = await collectAccessibleQuotes(
        ctx,
        user,
        isAdmin,
        filter,
        accessible,
      );
      const quotesInPeriod = quotes.filter((q) =>
        inPeriod(q, periodStart, periodEnd),
      );

      let quoteTotalValue = 0;
      for (const quote of quotesInPeriod) {
        quoteTotalValue += await documentTotalInDefault(
          ctx,
          quote,
          currencies,
          defaultCurrencyCache,
        );
      }

      quoteSummary = {
        count: quotesInPeriod.length,
        totalValue: quoteTotalValue,
        approvedCount: quotesInPeriod.filter(
          (q) =>
            q.status === "accepted" ||
            q.status === "invoiced" ||
            q.invoiced === true,
        ).length,
        cancelledCount: quotesInPeriod.filter(
          (q) => q.status === "rejected" || q.status === "expired",
        ).length,
      };

      // Track active clients from quotes in the period
      for (const q of quotesInPeriod) {
        if (q.company) activeClientIdsInPeriod.add(q.company as string);
      }
    }

    const activity = await loadRecentActivity(
      ctx,
      user,
      isAdmin,
      permissions,
      accessible,
      filter,
    );

    // activeClientsCount: unique clients with any deal/quote/invoice/voucher in the period
    const canCountActive = canDeals || canVouchers || canInvoices || canQuotes;
    const activeClientsCount = canCountActive
      ? activeClientIdsInPeriod.size
      : null;

    return {
      clientsCount,
      activeClientsCount,
      dealsTotal,
      wonDealsCount,
      lostDealsCount,
      dealsValueSummary,
      creditSummary,
      paidSalesTotal,
      receiptVouchersCount,
      salesSeries,
      quoteSummary,
      invoiceSummary,
      recentActivity: activity.items,
      canReadCompanies: canCompanies,
      canReadDeals: canDeals,
      canReadInvoices: canInvoices,
      canReadQuotes: canQuotes,
      canReadReceiptVouchers: canVouchers,
      canReadActivity: activity.canReadActivity,
    };
  },
});
