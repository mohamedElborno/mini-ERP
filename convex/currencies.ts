import { authorizeRequest } from "./access";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  filterByOrgGroup,
  getAccessibleOrgGroupIds,
  getSettingsByGroup,
  orgGroupFilterValidator,
  resolveOrgGroupFilter,
  resolveOrgGroupForCreate,
} from "./orgGroupHelpers";

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
  const hasSpecificPermission = role?.permissions.includes(permissionName);
  const isSuperAdmin = role?.permissions.includes("admin:all");

  if (!role || (!hasSpecificPermission && !isSuperAdmin)) {
    throw new Error(`Forbidden: Missing permission [${permissionName}]`);
  }

  return { user, isSuperAdmin: isSuperAdmin ?? false };
}

export const createCurrency = mutation({
  args: {
    name: v.string(),
    symbol: v.string(),
    exchangeRate: v.optional(v.number()),
    default: v.optional(v.boolean()),
    orgGroupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "currencies.createCurrency");
    const { user, isSuperAdmin } = await requirePermission(ctx, "settings:manage");
    const orgGroupId = await resolveOrgGroupForCreate(
      ctx,
      user,
      args.orgGroupId,
      isSuperAdmin,
    );

    const inGroup = await ctx.db
      .query("currencies")
      .withIndex("by_group", (q) => q.eq("group", orgGroupId))
      .collect();
    if (inGroup.some((c) => c.name === args.name)) {
      throw new Error("A currency with this name already exists.");
    }

    const currencyId = await ctx.db.insert("currencies", {
      name: args.name,
      symbol: args.symbol,
      exchangeRate: args.exchangeRate,
      default: args.default ?? false,
      group: orgGroupId,
      createdBy: user._id,
      updatedAt: Date.now(),
    });

    return currencyId;
  },
});

export const updateCurrency = mutation({
  args: {
    id: v.id("currencies"),
    name: v.string(),
    symbol: v.string(),
    exchangeRate: v.optional(v.number()),
    clearExchangeRate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "currencies.updateCurrency");
    const { user } = await requirePermission(ctx, "settings:manage");

    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Currency not found");

    const nameTrim = args.name.trim();
    const symbolTrim = args.symbol.trim();
    if (!nameTrim || !symbolTrim) {
      throw new Error("Name and symbol are required.");
    }

    if (nameTrim !== row.name && row.group) {
      const inGroup = await ctx.db
        .query("currencies")
        .withIndex("by_group", (q) => q.eq("group", row.group!))
        .collect();
      if (inGroup.some((c) => c.name === nameTrim && c._id !== args.id)) {
        throw new Error("A currency with this name already exists.");
      }
    }

    await ctx.db.patch(args.id, {
      name: nameTrim,
      symbol: symbolTrim,
      updatedBy: user._id,
      updatedAt: Date.now(),
      ...(args.clearExchangeRate
        ? { exchangeRate: undefined }
        : args.exchangeRate !== undefined
          ? { exchangeRate: args.exchangeRate }
          : {}),
    });

    return { success: true };
  },
});

export const setDefaultCurrency = mutation({
  args: {
    id: v.id("currencies"),
    orgGroupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "currencies.setDefaultCurrency");
    const { user, isSuperAdmin } = await requirePermission(ctx, "settings:manage");
    const currency = await ctx.db.get(args.id);
    if (!currency) throw new Error("Currency not found.");

    const orgGroupId =
      currency.group ??
      (await resolveOrgGroupForCreate(ctx, user, args.orgGroupId, isSuperAdmin));

    const inGroup = await ctx.db
      .query("currencies")
      .withIndex("by_group", (q) => q.eq("group", orgGroupId))
      .collect();
    await Promise.all(
      inGroup.map((c) => ctx.db.patch(c._id, { default: c._id === args.id })),
    );

    const settingsDoc = await getSettingsByGroup(ctx, orgGroupId);
    if (settingsDoc) {
      await ctx.db.patch(settingsDoc._id, { defaultCurrency: args.id });
    }

    return { success: true };
  },
});

export const deleteCurrency = mutation({
  args: { id: v.id("currencies") },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "currencies.deleteCurrency");
    await requirePermission(ctx, "settings:manage");

    const currency = await ctx.db.get(args.id);
    if (!currency) throw new Error("Currency not found");
    if (currency.default)
      throw new Error("Cannot delete the default currency.");

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

export const getCurrencies = query({
  args: { orgGroupId: orgGroupFilterValidator },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "currencies.getCurrencies");
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user?.role) return [];

    const role = await ctx.db.get(user.role);
    const isAdmin = role?.permissions.includes("admin:all") ?? false;
    const accessible = await getAccessibleOrgGroupIds(ctx, user, isAdmin);
    const filter = resolveOrgGroupFilter(args.orgGroupId, accessible, isAdmin);

    const rows = await ctx.db.query("currencies").order("asc").collect();
    return filterByOrgGroup(rows, filter, accessible);
  },
});

/** One-time: invert stored rates after semantics change (default per 1 foreign). */
export const invertExchangeRateSemantics = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("currencies").collect();
    let inverted = 0;
    for (const row of rows) {
      if (row.default) continue;
      const rate = row.exchangeRate;
      if (rate == null || rate === 0) continue;
      await ctx.db.patch(row._id, {
        exchangeRate: 1 / rate,
        updatedAt: Date.now(),
      });
      inverted++;
    }
    return { inverted };
  },
});
