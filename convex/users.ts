import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { getUserAssignedGroupIds } from "./orgGroupHelpers";

// ============================================================================
// 1. WEBHOOK SYNC (Create or update a user from Clerk)
// ============================================================================

export const upsertUser = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        imageUrl: args.imageUrl,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        imageUrl: args.imageUrl,
        updatedAt: Date.now(),
      });
    }
  },
});

// ============================================================================
// 2. GET (Fetch users for the frontend)
// ============================================================================

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return null;

    const roleDetails = user.role ? await ctx.db.get(user.role) : null;
    const groupDetails = user.group ? await ctx.db.get(user.group) : null;
    const assignedGroupIds = getUserAssignedGroupIds(user);
    const assignedGroupDetails = (
      await Promise.all(assignedGroupIds.map((id) => ctx.db.get(id)))
    ).filter(Boolean);

    return {
      ...user,
      roleDetails,
      groupDetails,
      assignedGroupDetails,
    };
  },
});

export const getUnassignedUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), undefined))
      .collect();
  },
});

export const getUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const adminUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!adminUser?.role) return [];

    const adminRole = await ctx.db.get(adminUser.role);
    if (
      !adminRole?.permissions.includes("users:read") &&
      !adminRole?.permissions.includes("admin:all")
    ) {
      return [];
    }

    const users = await ctx.db.query("users").collect();
    return await Promise.all(
      users.map(async (u) => {
        const role = u.role ? await ctx.db.get(u.role) : null;
        const assignedGroupIds = getUserAssignedGroupIds(u);
        const assignedGroups = (
          await Promise.all(assignedGroupIds.map((id) => ctx.db.get(id)))
        ).filter(Boolean);
        return { ...u, roleDetails: role, assignedGroups };
      }),
    );
  },
});

// ============================================================================
// 3. PUT / ASSIGNMENT (Admin activates the employee)
// ============================================================================

export const assignUserRole = mutation({
  args: {
    targetUserId: v.id("users"),
    roleId: v.id("roles"),
    groupIds: v.array(v.id("groups")),
    managerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const adminUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!adminUser || !adminUser.role) throw new Error("Unauthorized Access");

    const adminRole = await ctx.db.get(adminUser.role);
    if (!adminRole?.permissions.includes("users:update")) {
      throw new Error("Forbidden: You don't have permission to manage users");
    }

    if (args.groupIds.length === 0) {
      throw new Error("At least one company must be assigned.");
    }

    const uniqueGroupIds = [...new Set(args.groupIds)];
    for (const groupId of uniqueGroupIds) {
      const group = await ctx.db.get(groupId);
      if (!group) throw new Error("Company not found.");
    }

    await ctx.db.patch(args.targetUserId, {
      role: args.roleId,
      assignedGroups: uniqueGroupIds,
      group: uniqueGroupIds[0],
      ...(args.managerId !== undefined && { managerId: args.managerId }),
      updatedBy: adminUser._id,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const updateUserAssignedGroups = mutation({
  args: {
    targetUserId: v.id("users"),
    groupIds: v.array(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const adminUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!adminUser?.role) throw new Error("Unauthorized");

    const adminRole = await ctx.db.get(adminUser.role);
    if (
      !adminRole?.permissions.includes("users:update") &&
      !adminRole?.permissions.includes("admin:all")
    ) {
      throw new Error("Forbidden");
    }

    if (args.groupIds.length === 0) {
      throw new Error("At least one company must be assigned.");
    }

    const uniqueGroupIds = [...new Set(args.groupIds)];
    await ctx.db.patch(args.targetUserId, {
      assignedGroups: uniqueGroupIds,
      group: uniqueGroupIds[0],
      updatedBy: adminUser._id,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
