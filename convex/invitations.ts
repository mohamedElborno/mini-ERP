import { authorizeRequest } from "./access";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================================================
// INTERNAL — store or replace a pending invitation (called from the action)
// ============================================================================

export const storePendingInvitation = internalMutation({
  args: {
    email: v.string(),
    roleId: v.id("roles"),
    groupIds: v.array(v.id("groups")),
    invitedBy: v.id("users"),
    clerkInvitationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Replace any previous unused invitation for the same email
    const existing = await ctx.db
      .query("pendingInvitations")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) => q.eq(q.field("usedAt"), undefined))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return await ctx.db.insert("pendingInvitations", {
      email: args.email,
      roleId: args.roleId,
      groupIds: args.groupIds,
      invitedBy: args.invitedBy,
      clerkInvitationId: args.clerkInvitationId,
      createdAt: Date.now(),
    });
  },
});

export const updateClerkId = internalMutation({
  args: {
    id: v.id("pendingInvitations"),
    clerkInvitationId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { clerkInvitationId: args.clerkInvitationId });
  },
});

// ============================================================================
// INTERNAL — helper query for the action to verify sender permissions
// ============================================================================

export const getSenderInfo = internalQuery({
  args: { clerkId: v.string(), roleId: v.id("roles"), groupIds: v.array(v.id("groups")) },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (!user?.role) return null;

    const role = await ctx.db.get(user.role);
    const canInvite = role?.permissions.includes("admin:all");

    if (!canInvite) return null;
    if (!(await ctx.db.get(args.roleId)) || !args.groupIds.length) return null;
    for (const id of args.groupIds) if (!(await ctx.db.get(id))) return null;
    return { userId: user._id };
  },
});

// ============================================================================
// GET — list unused pending invitations (admin / users:update)
// ============================================================================

export const getPendingInvitations = query({
  args: {},
  handler: async (ctx) => {
    await authorizeRequest(ctx, {}, "invitations.getPendingInvitations");
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user?.role) return [];

    const role = await ctx.db.get(user.role as Id<"roles">);
    const canView =
      role?.permissions.includes("admin:all") ||
      role?.permissions.includes("users:update");
    if (!canView) return [];

    const pending = await ctx.db
      .query("pendingInvitations")
      .filter((q) => q.eq(q.field("usedAt"), undefined))
      .order("desc")
      .collect();

    return Promise.all(
      pending.map(async (inv) => {
        const invRole = await ctx.db.get(inv.roleId);
        const groups = (
          await Promise.all(inv.groupIds.map((id) => ctx.db.get(id)))
        ).filter(Boolean);
        const invitedByUser = await ctx.db.get(inv.invitedBy);
        const invitedByName = invitedByUser
          ? [invitedByUser.firstName, invitedByUser.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() || invitedByUser.email
          : "—";
        return {
          ...inv,
          roleName: invRole?.name ?? "—",
          groupNames: groups.map((g) => g!.name),
          invitedByName,
        };
      }),
    );
  },
});

// ============================================================================
// DELETE — cancel a pending invitation
// ============================================================================

export const cancelInvitation = mutation({
  args: { id: v.id("pendingInvitations") },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "invitations.cancelInvitation");
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user?.role) throw new Error("Unauthorized");

    const role = await ctx.db.get(user.role as Id<"roles">);
    const canManage =
      role?.permissions.includes("admin:all") ||
      role?.permissions.includes("users:update");
    if (!canManage) throw new Error("Forbidden");

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

// ============================================================================
// ACTION — invite an employee (role + groups are REQUIRED)
// ============================================================================

export const inviteEmployee = action({
  args: {
    emailAddress: v.string(),
    roleId: v.id("roles"),
    groupIds: v.array(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Verify caller has permission
    const sender = await ctx.runQuery(internal.invitations.getSenderInfo, {
      clerkId: identity.subject,
      roleId: args.roleId,
      groupIds: args.groupIds,
    });
    if (!sender)
      throw new Error("Forbidden: Missing permission to invite users.");

    const email = args.emailAddress.toLowerCase().trim();
    if (!email) throw new Error("Email address is required.");
    if (args.groupIds.length === 0)
      throw new Error("At least one group must be assigned.");

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey)
      throw new Error("Server configuration error: Missing CLERK_SECRET_KEY");

    // 1. Store pending invitation first (so webhook can find it)
    const invId = await ctx.runMutation(
      internal.invitations.storePendingInvitation,
      {
        email,
        roleId: args.roleId,
        groupIds: args.groupIds,
        invitedBy: sender.userId,
      },
    );

    // 2. Send the Clerk invitation email
    const response = await fetch("https://api.clerk.com/v1/invitations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: email,
        ignore_existing: true,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg =
        (errData as any)?.errors?.[0]?.message ??
        "Failed to send invitation through Clerk.";
      throw new Error(msg);
    }

    const invitation = await response.json();

    // 3. Record the Clerk invitation ID for reference
    await ctx.runMutation(internal.invitations.updateClerkId, {
      id: invId,
      clerkInvitationId: invitation.id,
    });

    return {
      success: true,
      message: "Invitation sent successfully",
      invitationId: invitation.id,
    };
  },
});
