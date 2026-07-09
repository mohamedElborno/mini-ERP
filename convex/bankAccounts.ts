import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  filterByOrgGroup,
  getAccessibleOrgGroupIds,
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

const bankAccountInput = {
  bankName: v.string(),
  accountNumber: v.string(),
  iban: v.string(),
  swift: v.optional(v.string()),
  country: v.string(),
  city: v.string(),
  currency: v.id("currencies"),
  name: v.optional(v.string()),
  isPrimary: v.optional(v.boolean()),
  orgGroupId: v.optional(v.id("groups")),
};

function parseBankAccountInput(args: {
  bankName: string;
  accountNumber: string;
  iban: string;
  swift?: string;
  country: string;
  city: string;
  currency: Id<"currencies">;
  name?: string;
}) {
  const bankName = args.bankName.trim();
  const accountNumber = args.accountNumber.trim();
  const iban = args.iban.trim();
  const swift = args.swift?.trim() || undefined;
  const country = args.country.trim();
  const city = args.city.trim();
  const name = args.name?.trim() || bankName;

  if (!bankName) throw new Error("Bank name is required.");
  if (!accountNumber) throw new Error("Account number is required.");
  if (!iban) throw new Error("IBAN is required.");
  if (!country) throw new Error("Country is required.");
  if (!city) throw new Error("City is required.");
  if (!args.currency) throw new Error("Currency is required.");

  return { bankName, accountNumber, iban, swift, country, city, name };
}

async function clearPrimaryExcept(
  ctx: { db: any },
  groupId: Id<"groups">,
  exceptId?: Id<"bankAccounts">,
) {
  const inGroup = await ctx.db
    .query("bankAccounts")
    .withIndex("by_group", (q: any) => q.eq("group", groupId))
    .collect();
  await Promise.all(
    inGroup
      .filter(
        (row: { _id: Id<"bankAccounts">; isPrimary?: boolean }) =>
          row.isPrimary === true && row._id !== exceptId,
      )
      .map((row: { _id: Id<"bankAccounts"> }) =>
        ctx.db.patch(row._id, { isPrimary: false }),
      ),
  );
}

async function ensureOnePrimary(ctx: { db: any }, groupId: Id<"groups">) {
  const inGroup = await ctx.db
    .query("bankAccounts")
    .withIndex("by_group", (q: any) => q.eq("group", groupId))
    .collect();
  if (inGroup.length === 0) return;
  const primary = inGroup.find(
    (r: { isPrimary?: boolean }) => r.isPrimary === true,
  );
  if (!primary) {
    await ctx.db.patch(inGroup[0]._id, { isPrimary: true });
  }
}

export const createBankAccount = mutation({
  args: bankAccountInput,
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(
      ctx,
      "settings:manage",
    );
    const { orgGroupId: requestedOrgGroupId, ...fields } = args;
    const orgGroupId = await resolveOrgGroupForCreate(
      ctx,
      user,
      requestedOrgGroupId,
      isSuperAdmin,
    );
    const parsed = parseBankAccountInput(fields);

    const inGroup = await ctx.db
      .query("bankAccounts")
      .withIndex("by_group", (q) => q.eq("group", orgGroupId))
      .collect();
    const isFirst = inGroup.length === 0;
    const isPrimary = args.isPrimary === true || isFirst;

    if (isPrimary) {
      await clearPrimaryExcept(ctx, orgGroupId);
    }

    return await ctx.db.insert("bankAccounts", {
      ...parsed,
      currency: args.currency,
      group: orgGroupId,
      isPrimary,
      active: true,
      createdBy: user._id,
      updatedAt: Date.now(),
    });
  },
});

export const updateBankAccount = mutation({
  args: {
    id: v.id("bankAccounts"),
    bankName: v.string(),
    accountNumber: v.string(),
    iban: v.string(),
    swift: v.optional(v.string()),
    country: v.string(),
    city: v.string(),
    currency: v.id("currencies"),
    name: v.optional(v.string()),
    isPrimary: v.optional(v.boolean()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requirePermission(ctx, "settings:manage");

    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Bank account not found.");
    if (!row.group) throw new Error("Bank account group is missing.");

    const parsed = parseBankAccountInput(args);

    if (args.isPrimary === true) {
      await clearPrimaryExcept(ctx, row.group, args.id);
    }

    await ctx.db.patch(args.id, {
      ...parsed,
      currency: args.currency,
      ...(args.isPrimary !== undefined && { isPrimary: args.isPrimary }),
      ...(args.active !== undefined && { active: args.active }),
      updatedBy: user._id,
      updatedAt: Date.now(),
    });

    if (args.isPrimary === false) {
      await ensureOnePrimary(ctx, row.group);
    }

    return { success: true };
  },
});

export const setPrimaryBankAccount = mutation({
  args: { id: v.id("bankAccounts") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "settings:manage");

    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Bank account not found.");
    if (!row.group) throw new Error("Bank account group is missing.");
    if (row.active === false) {
      throw new Error("Cannot set an inactive account as primary.");
    }

    await clearPrimaryExcept(ctx, row.group, args.id);
    await ctx.db.patch(args.id, { isPrimary: true, updatedAt: Date.now() });

    return { success: true };
  },
});

export const deleteBankAccount = mutation({
  args: { id: v.id("bankAccounts") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "settings:manage");

    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Bank account not found.");

    const wasPrimary = row.isPrimary === true;
    const groupId = row.group;
    await ctx.db.delete(args.id);

    if (wasPrimary && groupId) {
      await ensureOnePrimary(ctx, groupId);
    }

    return { success: true };
  },
});

export const getBankAccounts = query({
  args: {
    activeOnly: v.optional(v.boolean()),
    orgGroupId: orgGroupFilterValidator,
  },
  handler: async (ctx, args) => {
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

    let rows = await ctx.db.query("bankAccounts").collect();
    rows = filterByOrgGroup(rows, filter, accessible);

    if (args.activeOnly) {
      rows = rows.filter((r) => r.active !== false);
    }
    rows.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return a.bankName.localeCompare(b.bankName);
    });
    return rows;
  },
});
