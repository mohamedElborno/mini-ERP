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

export const createService = mutation({
  args: {
    name: v.string(),
    code: v.optional(v.string()),
    categories: v.optional(v.array(v.id("categories"))),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    ),
    price: v.optional(v.number()),
    orgGroupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(ctx, "services:create");
    const { orgGroupId: requestedOrgGroupId, ...serviceFields } = args;
    const orgGroupId = await resolveOrgGroupForCreate(
      ctx,
      user,
      requestedOrgGroupId,
      isSuperAdmin,
    );

    if (args.code) {
      const sameGroup = await ctx.db
        .query("services")
        .withIndex("by_group", (q) => q.eq("group", orgGroupId))
        .collect();
      if (sameGroup.some((s) => s.code === args.code)) {
        throw new Error("A service with this code already exists.");
      }
    }

    const serviceId = await ctx.db.insert("services", {
      name: serviceFields.name,
      code: serviceFields.code,
      categories: serviceFields.categories,
      description: serviceFields.description,
      status: serviceFields.status || "active",
      price: serviceFields.price || 0,
      group: orgGroupId,
      createdBy: user._id,
      updatedAt: Date.now(),
    });

    return serviceId;
  },
});

export const updateService = mutation({
  args: {
    id: v.id("services"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    categories: v.optional(v.array(v.id("categories"))),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    ),
    price: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requirePermission(ctx, "services:update");

    const service = await ctx.db.get(args.id);
    if (!service) throw new Error("Service not found");

    await ctx.db.patch(args.id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.code !== undefined && { code: args.code }),
      ...(args.categories !== undefined && { categories: args.categories }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.status !== undefined && { status: args.status }),
      ...(args.price !== undefined && { price: args.price }),
      updatedBy: user._id,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const getServices = query({
  args: {
    categoryId: v.optional(v.id("categories")),
    orgGroupId: orgGroupFilterValidator,
  },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(ctx, "services:read");
    const accessible = await getAccessibleOrgGroupIds(ctx, user, isSuperAdmin);
    const filter = resolveOrgGroupFilter(args.orgGroupId, accessible, isSuperAdmin);

    let allServices = await ctx.db.query("services").order("desc").collect();
    allServices = filterByOrgGroup(allServices, filter, accessible);

    if (args.categoryId) {
      allServices = allServices.filter((s) =>
        s.categories?.includes(args.categoryId!),
      );
    }

    if (isSuperAdmin) return allServices;
    return allServices.filter((service) => service.status === "active");
  },
});

export const getServiceById = query({
  args: { id: v.id("services") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "services:read");
    return await ctx.db.get(args.id);
  },
});
