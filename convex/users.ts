import { authorizeRequest } from "./access";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { getUserAssignedGroupIds } from "./orgGroupHelpers";

// Auto-assign role + groups from a pending invitation, then mark it used
async function autoAssignFromInvitation(
  ctx: MutationCtx,
  userId: Id<"users">,
  email: string,
) {
  const normalizedEmail = email.toLowerCase().trim();
  const invitation = await ctx.db
    .query("pendingInvitations")
    .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
    .filter((q) => q.eq(q.field("usedAt"), undefined))
    .first();

  if (!invitation) return;

  // Validate role still exists
  const role = await ctx.db.get(invitation.roleId);
  if (!role) return;

  // Validate groups still exist
  const validGroupIds = (
    await Promise.all(invitation.groupIds.map((id) => ctx.db.get(id)))
  )
    .filter(Boolean)
    .map((g) => g!._id);

  if (validGroupIds.length === 0) return;

  await ctx.db.patch(userId, {
    role: invitation.roleId,
    group: validGroupIds[0],
    assignedGroups: validGroupIds,
    updatedAt: Date.now(),
  });

  await ctx.db.patch(invitation._id, { usedAt: Date.now() });
}

// ============================================================================
// SETUP STATUS — used by SetupGate on first launch
// ============================================================================

export const getSetupStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    // identity === null means Convex JWT config is missing (CLERK_ISSUER_URL not set)
    if (!identity) return { status: "auth_misconfigured" as const };

    // Check if any admin role exists and is assigned to a user
    const allRoles = await ctx.db.query("roles").collect();
    const adminRole = allRoles.find((r) => r.permissions.includes("admin:all"));

    let adminExists = false;
    if (adminRole) {
      const existingAdmin = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", adminRole._id))
        .first();
      adminExists = !!existingAdmin;
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    // User exists and has a role → fully ready
    if (currentUser?.role) return { status: "ready" as const };

    // No admin exists in the system yet → needs first-time bootstrap
    // (covers both: user in DB with no role, AND user not in DB yet)
    if (!adminExists) return { status: "setup_needed" as const };

    // Admin exists but this user is not in the DB → webhook pending
    if (!currentUser) return { status: "syncing" as const };

    // Admin exists, user is in DB but has no role → waiting for assignment
    return { status: "pending_approval" as const };
  },
});

// ============================================================================
// BOOTSTRAP ADMIN — one-time mutation, impossible to repeat after first admin
// ============================================================================

export const bootstrapAdmin = mutation({
  args: {
    workspaceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    if (!process.env.BOOTSTRAP_ADMIN_SUBJECT || identity.subject !== process.env.BOOTSTRAP_ADMIN_SUBJECT) throw new Error("Forbidden: Bootstrap owner not configured");
    if (await ctx.db.query("roles").first()) throw new Error("Workspace already initialized.");

    // SECURITY: Atomic guard — no admin user must exist
    const allRoles = await ctx.db.query("roles").collect();
    const existingAdminRole = allRoles.find((r) =>
      r.permissions.includes("admin:all"),
    );
    if (existingAdminRole) {
      const existingAdmin = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", existingAdminRole._id))
        .first();
      if (existingAdmin) throw new Error("Workspace already initialized.");
    }

    // Find or create the Convex user record from Clerk identity
    // (webhook may not have fired yet in production)
    let currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      // Webhook hasn't fired yet — create the user from the Clerk JWT claims
      const email =
        identity.email ??
        identity.tokenIdentifier.replace(/^.*\|/, "") + "@unknown.local";
      const userId = await ctx.db.insert("users", {
        clerkId: identity.subject,
        email,
        firstName: identity.givenName ?? undefined,
        lastName: identity.familyName ?? undefined,
        updatedAt: Date.now(),
      });
      currentUser = await ctx.db.get(userId);
      if (!currentUser) throw new Error("Failed to create user record.");
    }

    // Create Super Admin role
    const roleId = await ctx.db.insert("roles", {
      name: "Super Admin",
      permissions: ["admin:all"],
      updatedAt: Date.now(),
    });

    // Determine workspace name
    const groupName =
      (args.workspaceName ?? "").trim() ||
      [currentUser.firstName, currentUser.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      "Main";

    // Create default group (workspace)
    const groupId = await ctx.db.insert("groups", {
      name: groupName,
      isDefault: true,
      createdBy: currentUser._id,
      updatedAt: Date.now(),
    });

    // Assign role and group to the first user
    await ctx.db.patch(currentUser._id, {
      role: roleId,
      group: groupId,
      assignedGroups: [groupId],
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

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
      // Only update profile fields — never overwrite role/group
      await ctx.db.patch(existingUser._id, {
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        imageUrl: args.imageUrl,
        updatedAt: Date.now(),
      });
      // If user still has no role, try to pick up a pending invitation
      if (!existingUser.role) {
        await autoAssignFromInvitation(ctx, existingUser._id, args.email);
      }
    } else {
      const userId = await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        imageUrl: args.imageUrl,
        updatedAt: Date.now(),
      });
      // Auto-assign role + groups from pending invitation
      await autoAssignFromInvitation(ctx, userId, args.email);
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
    await authorizeRequest(ctx, {}, "users.getUnassignedUsers");
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), undefined))
      .collect();
  },
});

export const getUsers = query({
  args: {},
  handler: async (ctx) => {
    await authorizeRequest(ctx, {}, "users.getUsers");
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
    await authorizeRequest(ctx, args, "users.assignUserRole");
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const adminUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!adminUser || !adminUser.role) throw new Error("Unauthorized Access");

    const adminRole = await ctx.db.get(adminUser.role);
    if (!adminRole?.permissions.includes("admin:all")) {
      throw new Error("Forbidden: You don't have permission to manage users");
    }

    if (args.groupIds.length === 0) {
      throw new Error("At least one company must be assigned.");
    }

    if (!(await ctx.db.get(args.targetUserId)) || !(await ctx.db.get(args.roleId))) throw new Error("User or role not found");
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
    await authorizeRequest(ctx, args, "users.updateUserAssignedGroups");
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
