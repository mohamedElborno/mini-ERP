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

export const createCategory = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    orgGroupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(
      ctx,
      "categories:create",
    );
    const orgGroupId = await resolveOrgGroupForCreate(
      ctx,
      user,
      args.orgGroupId,
      isSuperAdmin,
    );

    const inGroup = await ctx.db
      .query("categories")
      .withIndex("by_group", (q) => q.eq("group", orgGroupId))
      .collect();
    if (inGroup.some((c) => c.name === args.name)) {
      throw new Error("A category with this name already exists.");
    }

    const categoryId = await ctx.db.insert("categories", {
      name: args.name,
      description: args.description,
      group: orgGroupId,
      createdBy: user._id,
      updatedAt: Date.now(),
    });

    return categoryId;
  },
});

export const updateCategory = mutation({
  args: {
    id: v.id("categories"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requirePermission(ctx, "categories:update");

    const category = await ctx.db.get(args.id);
    if (!category) throw new Error("Category not found");

    await ctx.db.patch(args.id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.description !== undefined && { description: args.description }),
      updatedBy: user._id,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const getCategories = query({
  args: { orgGroupId: orgGroupFilterValidator },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(ctx, "categories:read");
    const accessible = await getAccessibleOrgGroupIds(ctx, user, isSuperAdmin);
    const filter = resolveOrgGroupFilter(args.orgGroupId, accessible, isSuperAdmin);

    const rows = await ctx.db.query("categories").order("desc").collect();
    return filterByOrgGroup(rows, filter, accessible);
  },
});

export const getCategoryById = query({
  args: { id: v.id("categories") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "categories:read");
    return await ctx.db.get(args.id);
  },
});
