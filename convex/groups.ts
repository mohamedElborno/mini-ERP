import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  getAccessibleOrgGroupIds,
  getUserAssignedGroupIds,
  userCanAccessOrgGroup,
} from "./orgGroupHelpers";
import {
  countOrgGroupDataRecursive,
  deleteOrgGroupCascade,
  ORG_GROUP_DELETE_CONFIRMATION_PHRASE,
} from "./orgGroupDelete";

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

  return { user, role, isSuperAdmin };
}

export const createGroup = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    parent: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const { user } = await requirePermission(ctx, "settings:manage");

    const name = args.name.trim();
    if (!name) throw new Error("Company name is required.");

    const existingGroup = await ctx.db
      .query("groups")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (existingGroup) {
      throw new Error("A company with this name already exists.");
    }

    const groupId = await ctx.db.insert("groups", {
      name,
      description: args.description?.trim() || undefined,
      parent: args.parent,
      createdBy: user._id,
      updatedAt: Date.now(),
    });

    if (args.parent) {
      const parentGroup = await ctx.db.get(args.parent);
      if (parentGroup) {
        const currentChildren = parentGroup.children || [];
        await ctx.db.patch(args.parent, {
          children: [...currentChildren, groupId],
        });
      }
    }

    const assigned = getUserAssignedGroupIds(user);
    if (!assigned.includes(groupId)) {
      await ctx.db.patch(user._id, {
        assignedGroups: [...assigned, groupId],
        group: user.group ?? groupId,
        updatedAt: Date.now(),
      });
    }

    return groupId;
  },
});

export const updateGroup = mutation({
  args: {
    id: v.id("groups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    parent: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(ctx, "settings:manage");

    const group = await ctx.db.get(args.id);
    if (!group) throw new Error("Company not found.");

    if (!isSuperAdmin && !userCanAccessOrgGroup(user, args.id, false)) {
      throw new Error("Forbidden: You don't have access to this company.");
    }

    if (group.isDefault && args.parent !== undefined && args.parent !== group.parent) {
      throw new Error("Cannot change the parent of the default company.");
    }

    if (args.name !== undefined) {
      const trimmed = args.name.trim();
      if (!trimmed) throw new Error("Company name is required.");
      const duplicate = await ctx.db
        .query("groups")
        .withIndex("by_name", (q) => q.eq("name", trimmed))
        .first();
      if (duplicate && duplicate._id !== args.id) {
        throw new Error("A company with this name already exists.");
      }
    }

    const { id, ...updateFields } = args;
    const patch: Record<string, unknown> = {
      updatedBy: user._id,
      updatedAt: Date.now(),
    };
    if (updateFields.name !== undefined) {
      patch.name = updateFields.name.trim();
    }
    if (updateFields.description !== undefined) {
      patch.description = updateFields.description.trim() || undefined;
    }
    if (updateFields.parent !== undefined && !group.isDefault) {
      patch.parent = updateFields.parent;
    }

    await ctx.db.patch(id, patch);
    return { success: true };
  },
});

export const getOrgGroupDeletePreview = query({
  args: { id: v.id("groups") },
  handler: async (ctx, args) => {
    const { isSuperAdmin } = await requirePermission(ctx, "settings:manage");
    if (!isSuperAdmin) {
      throw new Error("Forbidden: Only administrators can delete companies.");
    }

    const group = await ctx.db.get(args.id);
    if (!group) throw new Error("Company not found.");
    if (group.isDefault) {
      return {
        canDelete: false,
        isDefault: true,
        reason: "default",
        counts: null,
        subsidiaries: 0,
        totalRecords: 0,
        confirmationPhrase: ORG_GROUP_DELETE_CONFIRMATION_PHRASE,
      };
    }

    const summary = await countOrgGroupDataRecursive(ctx, args.id);

    return {
      canDelete: true,
      isDefault: false,
      reason: null,
      counts: summary.direct,
      subsidiaries: summary.subsidiaries,
      totalRecords: summary.totalRecords,
      confirmationPhrase: ORG_GROUP_DELETE_CONFIRMATION_PHRASE,
    };
  },
});

export const deleteGroup = mutation({
  args: {
    id: v.id("groups"),
    confirmationPhrase: v.string(),
  },
  handler: async (ctx, args) => {
    const { isSuperAdmin } = await requirePermission(ctx, "settings:manage");
    if (!isSuperAdmin) {
      throw new Error("Forbidden: Only administrators can delete companies.");
    }

    const group = await ctx.db.get(args.id);
    if (!group) throw new Error("Company not found.");

    if (group.isDefault) {
      throw new Error("Cannot delete the default company.");
    }

    const phrase = args.confirmationPhrase.trim();
    if (phrase !== ORG_GROUP_DELETE_CONFIRMATION_PHRASE) {
      throw new Error("Confirmation phrase does not match.");
    }

    await deleteOrgGroupCascade(ctx, args.id);
    return { success: true };
  },
});

export const getGroups = query({
  args: {},
  handler: async (ctx) => {
    const { user, isSuperAdmin } = await requirePermission(ctx, "users:read");
    const accessible = await getAccessibleOrgGroupIds(ctx, user, isSuperAdmin);
    const all = await ctx.db.query("groups").order("desc").collect();
    if (isSuperAdmin) return all;
    return all.filter((g) => accessible.includes(g._id));
  },
});

export const getMyOrgGroups = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return [];

    const role = user.role ? await ctx.db.get(user.role) : null;
    const isSuperAdmin = role?.permissions.includes("admin:all") ?? false;
    const accessible = await getAccessibleOrgGroupIds(ctx, user, isSuperAdmin);
    if (accessible.length === 0) return [];

    const groups = await Promise.all(accessible.map((id) => ctx.db.get(id)));
    return groups.filter(Boolean).sort((a, b) => a!.name.localeCompare(b!.name));
  },
});

export const getGroupById = query({
  args: { id: v.id("groups") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "users:read");
    return await ctx.db.get(args.id);
  },
});
