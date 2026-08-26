import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  getAccessibleOrgGroupIds,
  getSettingsByGroup,
  getUserAssignedGroupIds,
  userCanAccessOrgGroup,
} from "./orgGroupHelpers";
import {
  countOrgGroupDataRecursive,
  deleteOrgGroupCascade,
  ORG_GROUP_DELETE_CONFIRMATION_PHRASE,
} from "./orgGroupDelete";
import { normalizeNationalAddressFields } from "./lib/saudiNationalAddress";

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
    taxNumber: v.optional(v.string()),
    nationalAddress: v.optional(v.string()),
    buildingNumber: v.optional(v.string()),
    address: v.optional(v.string()),
    district: v.optional(v.string()),
    secondaryNumber: v.optional(v.string()),
    city: v.optional(v.string()),
    zipCode: v.optional(v.string()),
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

    const { id, ...rawFields } = args;
    const updateFields = normalizeNationalAddressFields(rawFields);
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
    if (updateFields.taxNumber !== undefined) {
      patch.taxNumber = updateFields.taxNumber.trim() || undefined;
    }
    if (updateFields.nationalAddress !== undefined) {
      patch.nationalAddress = updateFields.nationalAddress;
    }
    if (updateFields.buildingNumber !== undefined) {
      patch.buildingNumber = updateFields.buildingNumber;
    }
    if (updateFields.address !== undefined) {
      patch.address = updateFields.address.trim() || undefined;
    }
    if (updateFields.district !== undefined) {
      patch.district = updateFields.district.trim() || undefined;
    }
    if (updateFields.secondaryNumber !== undefined) {
      patch.secondaryNumber = updateFields.secondaryNumber;
    }
    if (updateFields.city !== undefined) {
      patch.city = updateFields.city.trim() || undefined;
    }
    if (updateFields.zipCode !== undefined) {
      patch.zipCode = updateFields.zipCode;
    }

    await ctx.db.patch(id, patch);
    return { success: true };
  },
});

export const getGroupBranding = query({
  args: { id: v.id("groups") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const group = await ctx.db.get(args.id);
    if (!group) return null;

    const settings = await getSettingsByGroup(ctx, args.id);
    const logoStorageId =
      group.logoStorageId ?? settings?.companyLogoStorageId ?? null;

    let logoUrl: string | null = null;
    if (logoStorageId) {
      logoUrl = await ctx.storage.getUrl(logoStorageId);
    }

    return {
      name: group.name,
      logoUrl,
      hasLogo: Boolean(logoStorageId),
      taxNumber: group.taxNumber ?? null,
      nationalAddress: group.nationalAddress ?? null,
      buildingNumber: group.buildingNumber ?? null,
      address: group.address ?? null,
      district: group.district ?? null,
      secondaryNumber: group.secondaryNumber ?? null,
      city: group.city ?? null,
      zipCode: group.zipCode ?? null,
    };
  },
});

export const generateGroupLogoUploadUrl = mutation({
  args: { id: v.id("groups") },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(ctx, "settings:manage");
    const group = await ctx.db.get(args.id);
    if (!group) throw new Error("Company not found.");
    if (!isSuperAdmin && !userCanAccessOrgGroup(user, args.id, false)) {
      throw new Error("Forbidden: You don't have access to this company.");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const setGroupLogo = mutation({
  args: {
    id: v.id("groups"),
    logoStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(ctx, "settings:manage");
    const group = await ctx.db.get(args.id);
    if (!group) throw new Error("Company not found.");
    if (!isSuperAdmin && !userCanAccessOrgGroup(user, args.id, false)) {
      throw new Error("Forbidden: You don't have access to this company.");
    }

    if (group.logoStorageId && group.logoStorageId !== args.logoStorageId) {
      await ctx.storage.delete(group.logoStorageId);
    }

    await ctx.db.patch(args.id, {
      logoStorageId: args.logoStorageId,
      updatedBy: user._id,
      updatedAt: Date.now(),
    });
  },
});

export const removeGroupLogo = mutation({
  args: { id: v.id("groups") },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(ctx, "settings:manage");
    const group = await ctx.db.get(args.id);
    if (!group) throw new Error("Company not found.");
    if (!isSuperAdmin && !userCanAccessOrgGroup(user, args.id, false)) {
      throw new Error("Forbidden: You don't have access to this company.");
    }
    if (!group.logoStorageId) return;

    await ctx.storage.delete(group.logoStorageId);
    await ctx.db.patch(args.id, {
      logoStorageId: undefined,
      updatedBy: user._id,
      updatedAt: Date.now(),
    });
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
