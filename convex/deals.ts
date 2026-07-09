import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  amountInDefaultCurrency,
  type CurrencyRow,
} from "./quoteFinance";
import {
  filterByOrgGroup,
  getAccessibleOrgGroupIds,
  getDefaultCurrencyIdForGroup,
  getUserAssignedGroupIds,
  orgGroupFilterValidator,
  resolveOrgGroupFilter,
  resolveOrgGroupForCreate,
} from "./orgGroupHelpers";

// ============================================================================
// 1. HELPERS (Helper functions)
// ============================================================================

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

  // Check if the user has the specific permission or the global admin permission "admin:all"
  const hasSpecificPermission = role?.permissions.includes(permissionName);
  const isSuperAdmin = role?.permissions.includes("admin:all");

  if (!role || (!hasSpecificPermission && !isSuperAdmin)) {
    throw new Error(`Forbidden: Missing permission [${permissionName}]`);
  }

  return { user, isSuperAdmin: isSuperAdmin ?? false };
}

type DefaultCurrencyCache = Map<string, Id<"currencies"> | undefined>;

async function getDefaultCurrencyCached(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups"> | undefined,
  cache: DefaultCurrencyCache,
) {
  const key = groupId ?? "__none__";
  if (!cache.has(key)) {
    cache.set(key, await getDefaultCurrencyIdForGroup(ctx, groupId));
  }
  return cache.get(key);
}

function dealValueInDefault(
  deal: { value?: number; currency?: Id<"currencies"> },
  defaultCurrencyId: Id<"currencies"> | undefined,
  currencies: CurrencyRow[],
) {
  return amountInDefaultCurrency(
    deal.value,
    deal.currency ?? defaultCurrencyId,
    defaultCurrencyId,
    currencies,
  );
}

// ============================================================================
// 2. POST (Create a new deal)
// ============================================================================

export const createDeal = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    value: v.optional(v.number()),
    company: v.optional(v.id("companies")),
    contact: v.id("contacts"),
    stage: v.union(
      v.literal("lead"),
      v.literal("contacted"),
      v.literal("negotiation"),
      v.literal("won"),
      v.literal("lost"),
    ),
    expectedCloseDate: v.optional(v.number()),
    probability: v.optional(v.number()),
    currency: v.optional(v.id("currencies")),
    orgGroupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const { user: currentUser, isSuperAdmin } = await requirePermission(
      ctx,
      "deals:create",
    );
    const { orgGroupId: requestedOrgGroupId, currency, ...dealFields } = args;
    const orgGroupId = await resolveOrgGroupForCreate(
      ctx,
      currentUser,
      requestedOrgGroupId,
      isSuperAdmin,
    );

    const currencyId =
      currency ?? (await getDefaultCurrencyIdForGroup(ctx, orgGroupId));
    if (!currencyId) {
      throw new Error(
        "No default currency configured. Add a currency in Settings first.",
      );
    }

    const dealId = await ctx.db.insert("deals", {
      ...dealFields,
      currency: currencyId,
      owner: currentUser._id,
      group: orgGroupId,
      createdBy: currentUser._id,
      updatedAt: Date.now(),
    });

    return dealId;
  },
});

// ============================================================================
// 3. PUT (Update the deal stage)
// ============================================================================

export const updateDealStage = mutation({
  args: {
    id: v.id("deals"),
    stage: v.union(
      v.literal("lead"),
      v.literal("contacted"),
      v.literal("negotiation"),
      v.literal("won"),
      v.literal("lost"),
    ),
    lossReason: v.optional(v.string()), // Required if the stage is lost
  },
  handler: async (ctx, args) => {
    const { user: currentUser } = await requirePermission(ctx, "deals:update");

    // Get the deal
    const deal = await ctx.db.get(args.id);
    if (!deal) throw new Error("Deal not found");

    // Update the deal
    await ctx.db.patch(args.id, {
      stage: args.stage,
      ...(args.stage === "lost" && args.lossReason
        ? { lossReason: args.lossReason }
        : {}),
      ...(args.stage === "won" ? { actualCloseDate: Date.now() } : {}),
      updatedBy: currentUser._id,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================================================
// 4. GET (Get the deals by permissions and group)
// ============================================================================

export const getDeals = query({
  args: {},
  handler: async (ctx) => {
    const { user: currentUser } = await requirePermission(ctx, "deals:read");

    const role = await ctx.db.get(currentUser.role as Id<"roles">);
    const isAdmin = role?.permissions.includes("admin:all");

    // If the user is an admin, they can see all the deals
    if (isAdmin) {
      return await ctx.db.query("deals").order("desc").collect();
    }

    // If the user is an employee, they can see their own deals and the deals of their group only
    else {
      const myOwnedDeals = await ctx.db
        .query("deals")
        .withIndex("by_owner", (q) => q.eq("owner", currentUser._id))
        .collect();

      let myGroupDeals: any[] = [];
      if (currentUser.group) {
        myGroupDeals = await ctx.db
          .query("deals")
          .withIndex("by_group", (q) => q.eq("group", currentUser.group!))
          .collect();
      }

      // Merge the results and remove duplicates
      const allAccessible = [...myOwnedDeals, ...myGroupDeals];
      const uniqueDeals = Array.from(
        new Map(allAccessible.map((item) => [item._id, item])).values(),
      );

      uniqueDeals.sort((a, b) => b._creationTime - a._creationTime);

      return uniqueDeals;
    }
  },
});

// ============================================================================
// 5. PUT (Update full deal details & reassignment)
// ============================================================================

export const updateDeal = mutation({
  args: {
    id: v.id("deals"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    value: v.optional(v.number()),
    currency: v.optional(v.id("currencies")),
    expectedCloseDate: v.optional(v.number()),
    probability: v.optional(v.number()),
    owner: v.optional(v.id("users")), // Allow transferring ownership of the deal to another employee
    group: v.optional(v.id("groups")), // Allow transferring the deal to another group
  },
  handler: async (ctx, args) => {
    const { user: currentUser } = await requirePermission(ctx, "deals:update");

    const deal = await ctx.db.get(args.id);
    if (!deal) throw new Error("Deal not found");

    // (Optional) Additional protection: Ensure that the employee has permission to edit this deal specifically
    // If the user is not an admin, they must be the owner or in the same group
    const role = await ctx.db.get(currentUser.role as Id<"roles">);
    const isAdmin = role?.permissions.includes("admin:all");

    if (
      !isAdmin &&
      deal.owner !== currentUser._id &&
      deal.group !== currentUser.group
    ) {
      throw new Error(
        "Forbidden: You don't have permission to edit this deal.",
      );
    }

    // Prepare the update object
    await ctx.db.patch(args.id, {
      ...(args.title !== undefined && { title: args.title }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.value !== undefined && { value: args.value }),
      ...(args.currency !== undefined && { currency: args.currency }),
      ...(args.expectedCloseDate !== undefined && {
        expectedCloseDate: args.expectedCloseDate,
      }),
      ...(args.probability !== undefined && { probability: args.probability }),
      ...(args.owner !== undefined && { owner: args.owner }),
      ...(args.group !== undefined && { group: args.group }),
      updatedBy: currentUser._id,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================================================
// 6. GET (Enriched deals list — joins contact & company names)
// ============================================================================

export const getDealsWithDetails = query({
  args: { orgGroupId: orgGroupFilterValidator },
  handler: async (ctx, args) => {
    const { user: currentUser } = await requirePermission(ctx, "deals:read");

    const role = await ctx.db.get(currentUser.role as Id<"roles">);
    const isAdmin = role?.permissions.includes("admin:all") ?? false;
    const accessible = await getAccessibleOrgGroupIds(ctx, currentUser, isAdmin);
    const filter = resolveOrgGroupFilter(args.orgGroupId, accessible, isAdmin);

    let deals: Array<{
      _id: Id<"deals">;
      _creationTime: number;
      title: string;
      contact: Id<"contacts">;
      owner: Id<"users">;
      createdBy: Id<"users">;
      group?: Id<"groups">;
      company?: Id<"companies">;
      description?: string;
      value?: number;
      currency?: Id<"currencies">;
      stage?: "lead" | "contacted" | "negotiation" | "won" | "lost";
      expectedCloseDate?: number;
      actualCloseDate?: number;
      probability?: number;
      lossReason?: string;
      updatedBy?: Id<"users">;
      updatedAt?: number;
    }>;

    if (isAdmin) {
      deals = await ctx.db.query("deals").order("desc").collect();
    } else {
      const myOwnedDeals = await ctx.db
        .query("deals")
        .withIndex("by_owner", (q) => q.eq("owner", currentUser._id))
        .collect();

      const groupDeals = await Promise.all(
        accessible.map((groupId) =>
          ctx.db
            .query("deals")
            .withIndex("by_group", (q) => q.eq("group", groupId))
            .collect(),
        ),
      );

      const allAccessible = [...myOwnedDeals, ...groupDeals.flat()];
      const unique = Array.from(
        new Map(allAccessible.map((d) => [d._id, d])).values(),
      );
      unique.sort((a, b) => b._creationTime - a._creationTime);
      deals = unique;
    }

    deals = filterByOrgGroup(deals, filter, accessible);

    const currencies = await ctx.db.query("currencies").collect();
    const currencyById = new Map(currencies.map((c) => [c._id, c]));
    const defaultCurrencyCache: DefaultCurrencyCache = new Map();

    return Promise.all(
      deals.map(async (deal) => {
        const contact = deal.contact ? await ctx.db.get(deal.contact) : null;
        const company = deal.company ? await ctx.db.get(deal.company) : null;
        const contactName = contact
          ? [
              (contact as any).firstName,
              (contact as any).lastName,
            ]
              .filter(Boolean)
              .join(" ") || "—"
          : "—";
        const defaultCurrencyId = await getDefaultCurrencyCached(
          ctx,
          deal.group,
          defaultCurrencyCache,
        );
        const currencyId = deal.currency ?? defaultCurrencyId;
        const currencyRow = currencyId ? currencyById.get(currencyId) : undefined;
        const defaultRow = defaultCurrencyId
          ? currencyById.get(defaultCurrencyId)
          : undefined;
        return {
          ...deal,
          contactName,
          companyName: company ? (company as any).name : null,
          currencySymbol: currencyRow?.symbol ?? defaultRow?.symbol ?? null,
          currencyName: currencyRow?.name ?? defaultRow?.name ?? null,
          valueInDefault: dealValueInDefault(
            deal,
            defaultCurrencyId,
            currencies,
          ),
          defaultCurrencySymbol: defaultRow?.symbol ?? null,
        };
      }),
    );
  },
});

// ============================================================================
// 7. GET (Get single deal by ID with visibility protection)
// ============================================================================

export const getDealById = query({
  args: {
    id: v.id("deals"),
  },
  handler: async (ctx, args) => {
    const { user: currentUser } = await requirePermission(ctx, "deals:read");

    const deal = await ctx.db.get(args.id);
    if (!deal) return null;

    // Visibility protection: Does this employee have permission to view this deal specifically?
    const role = await ctx.db.get(currentUser.role as Id<"roles">);
    const isAdmin = role?.permissions.includes("admin:all");

    if (!isAdmin) {
      if (deal.owner !== currentUser._id && deal.group !== currentUser.group) {
        throw new Error("Forbidden: You don't have access to this deal.");
      }
    }

    // Here you can also get the company and contact data linked to the deal and include it
    // const company = deal.company ? await ctx.db.get(deal.company) : null;
    // const contact = await ctx.db.get(deal.contact);

    return deal;
  },
});

// ============================================================================
// 8. GET — صفحة تفاصيل الصفقة (عروض + فواتير + مبالغ)
// ============================================================================

export const getDealDetailPage = query({
  args: { id: v.id("deals") },
  handler: async (ctx, args) => {
    const { user: currentUser } = await requirePermission(ctx, "deals:read");
    const deal = await ctx.db.get(args.id);
    if (!deal) return null;

    const role = await ctx.db.get(currentUser.role as Id<"roles">);
    const isAdmin = role?.permissions.includes("admin:all");
    if (!isAdmin) {
      if (deal.owner !== currentUser._id && deal.group !== currentUser.group) {
        return null;
      }
    }

    const contact = deal.contact ? await ctx.db.get(deal.contact) : null;
    const company = deal.company ? await ctx.db.get(deal.company) : null;
    const contactName = contact
      ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"
      : "—";
    const companyName = company ? company.name : null;

    const quoteRows = await ctx.db
      .query("quotes")
      .withIndex("by_deal", (q) => q.eq("deal", args.id))
      .collect();

    const invoiceRows = await ctx.db
      .query("invoices")
      .withIndex("by_deal", (q) => q.eq("deal", args.id))
      .collect();

    const currencies = await ctx.db.query("currencies").collect();
    const defaultCurrencyId = await getDefaultCurrencyIdForGroup(
      ctx,
      deal.group,
    );
    const defaultCurrency = defaultCurrencyId
      ? currencies.find((c) => c._id === defaultCurrencyId)
      : undefined;
    const dealCurrencyId = deal.currency ?? defaultCurrencyId;
    const dealCurrency = dealCurrencyId
      ? currencies.find((c) => c._id === dealCurrencyId)
      : undefined;

    const toDefault = (
      total: number | undefined,
      currencyId?: Id<"currencies">,
    ) =>
      amountInDefaultCurrency(
        total,
        currencyId ?? defaultCurrencyId,
        defaultCurrencyId,
        currencies,
      );

    const quotesTotal = quoteRows.reduce(
      (s, q) => s + toDefault(q.total, q.currency),
      0,
    );
    const invoicesTotal = invoiceRows.reduce(
      (s, i) => s + toDefault(i.total, i.currency),
      0,
    );

    return {
      deal,
      contactName,
      companyName,
      dealCurrencySymbol: dealCurrency?.symbol ?? defaultCurrency?.symbol ?? null,
      dealCurrencyName: dealCurrency?.name ?? defaultCurrency?.name ?? null,
      defaultCurrencySymbol: defaultCurrency?.symbol ?? null,
      quotes: quoteRows
        .map((q) => ({
          _id: q._id,
          number: q.number,
          status: q.status,
          total: q.total,
          revision: q.revision,
          issueDate: q.issueDate,
        }))
        .sort((a, b) => (b.issueDate ?? 0) - (a.issueDate ?? 0)),
      invoices: invoiceRows
        .map((inv) => ({
          _id: inv._id,
          number: inv.number,
          status: inv.status,
          total: inv.total,
          quote: inv.quote,
          issueDate: inv.issueDate,
        }))
        .sort((a, b) => (b.issueDate ?? 0) - (a.issueDate ?? 0)),
      metrics: {
        expectedValue: dealValueInDefault(deal, defaultCurrencyId, currencies),
        quotesTotal,
        invoicesTotal,
        quotesCount: quoteRows.length,
        invoicesCount: invoiceRows.length,
      },
    };
  },
});
