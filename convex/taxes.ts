import { authorizeRequest } from "./access";
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

export const createTax = mutation({
  args: {
    name: v.string(),
    code: v.optional(v.string()),
    rate: v.number(),
    orgGroupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "taxes.createTax");
    const { user, isSuperAdmin } = await requirePermission(ctx, "settings:manage");
    const orgGroupId = await resolveOrgGroupForCreate(
      ctx,
      user,
      args.orgGroupId,
      isSuperAdmin,
    );

    const taxId = await ctx.db.insert("taxes", {
      name: args.name,
      code: args.code,
      rate: args.rate,
      group: orgGroupId,
      createdBy: user._id,
      updatedAt: Date.now(),
    });

    return taxId;
  },
});

export const updateTax = mutation({
  args: {
    id: v.id("taxes"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    rate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "taxes.updateTax");
    const { user } = await requirePermission(ctx, "settings:manage");

    const tax = await ctx.db.get(args.id);
    if (!tax) throw new Error("Tax not found");

    await ctx.db.patch(args.id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.code !== undefined && { code: args.code }),
      ...(args.rate !== undefined && { rate: args.rate }),
      updatedBy: user._id,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const deleteTax = mutation({
  args: { id: v.id("taxes") },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "taxes.deleteTax");
    await requirePermission(ctx, "settings:manage");

    const tax = await ctx.db.get(args.id);
    if (!tax) throw new Error("Tax not found");

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

export const getTaxes = query({
  args: { orgGroupId: orgGroupFilterValidator },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "taxes.getTaxes");
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

    const rows = await ctx.db.query("taxes").order("asc").collect();
    return filterByOrgGroup(rows, filter, accessible);
  },
});
