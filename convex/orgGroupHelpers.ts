import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const orgGroupFilterValidator = v.optional(
  v.union(v.id("groups"), v.literal("all")),
);

type OrgUser = {
  _id: Id<"users">;
  group?: Id<"groups">;
  assignedGroups?: Id<"groups">[];
  firstName?: string;
  lastName?: string;
  email?: string;
};

export function getUserAssignedGroupIds(user: OrgUser): Id<"groups">[] {
  if (user.assignedGroups?.length) return user.assignedGroups;
  if (user.group) return [user.group];
  return [];
}

export function userCanAccessOrgGroup(
  user: OrgUser,
  orgGroupId: Id<"groups">,
  isAdmin: boolean,
) {
  if (isAdmin) return true;
  return getUserAssignedGroupIds(user).includes(orgGroupId);
}

export function filterByOrgGroup<T extends { group?: Id<"groups"> | null }>(
  rows: T[],
  orgGroupFilter: Id<"groups"> | "all" | undefined,
  accessibleGroupIds: Id<"groups">[],
) {
  if (!orgGroupFilter || orgGroupFilter === "all") {
    if (accessibleGroupIds.length === 0) return rows;
    return rows.filter(
      (row) => !row.group || accessibleGroupIds.includes(row.group),
    );
  }
  return rows.filter((row) => row.group === orgGroupFilter);
}

export async function ensureDefaultOrgGroup(
  ctx: MutationCtx,
  user: OrgUser,
): Promise<Id<"groups">> {
  const existing = await ctx.db.query("groups").collect();
  if (existing.length > 0) {
    const defaultGroup =
      existing.find((g) => g.isDefault === true) ?? existing[0];
    const assigned = getUserAssignedGroupIds(user);
    if (assigned.length === 0) {
      await ctx.db.patch(user._id, {
        assignedGroups: [defaultGroup._id],
        group: defaultGroup._id,
        updatedAt: Date.now(),
      });
    }
    return defaultGroup._id;
  }

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email ||
    "Company";

  const groupId = await ctx.db.insert("groups", {
    name: displayName,
    isDefault: true,
    createdBy: user._id,
    updatedAt: Date.now(),
  });

  await ctx.db.patch(user._id, {
    assignedGroups: [groupId],
    group: groupId,
    updatedAt: Date.now(),
  });

  return groupId;
}

export async function resolveOrgGroupForCreate(
  ctx: MutationCtx,
  user: Doc<"users">,
  requestedOrgGroupId: Id<"groups"> | undefined,
  isAdmin: boolean,
): Promise<Id<"groups">> {
  await ensureDefaultOrgGroup(ctx, user);

  const refreshed = await ctx.db.get(user._id);
  if (!refreshed) throw new Error("User not found.");

  const assigned = getUserAssignedGroupIds(refreshed);

  if (requestedOrgGroupId) {
    if (!userCanAccessOrgGroup(refreshed, requestedOrgGroupId, isAdmin)) {
      throw new Error("Forbidden: You don't have access to this company.");
    }
    return requestedOrgGroupId;
  }

  if (refreshed.group && assigned.includes(refreshed.group)) {
    return refreshed.group;
  }
  if (assigned.length > 0) return assigned[0];

  return await ensureDefaultOrgGroup(ctx, refreshed);
}

export async function getAccessibleOrgGroupIds(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  isAdmin: boolean,
): Promise<Id<"groups">[]> {
  if (isAdmin) {
    const all = await ctx.db.query("groups").collect();
    return all.map((g) => g._id);
  }
  return getUserAssignedGroupIds(user);
}

export function resolveOrgGroupFilter(
  orgGroupFilter: Id<"groups"> | "all" | undefined,
  accessibleGroupIds: Id<"groups">[],
  isAdmin: boolean,
): Id<"groups"> | "all" {
  if (!orgGroupFilter || orgGroupFilter === "all") return "all";
  if (isAdmin || accessibleGroupIds.includes(orgGroupFilter)) {
    return orgGroupFilter;
  }
  return "all";
}

export async function getSettingsByGroup(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups"> | undefined,
) {
  if (groupId) {
    const scoped = await ctx.db
      .query("settings")
      .withIndex("by_group", (q) => q.eq("group", groupId))
      .first();
    if (scoped) return scoped;
  }
  return (await ctx.db.query("settings").first()) ?? null;
}

export async function ensureSettingsForGroup(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  userId: Id<"users">,
) {
  const existing = await getSettingsByGroup(ctx, groupId);
  if (existing) return existing;
  const id = await ctx.db.insert("settings", {
    group: groupId,
    updatedBy: userId,
    updatedAt: Date.now(),
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create settings.");
  return created;
}

export async function getDefaultCurrencyIdForGroup(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups"> | undefined,
) {
  const settings = await getSettingsByGroup(ctx, groupId);
  if (settings?.defaultCurrency) return settings.defaultCurrency;
  const all = await ctx.db.query("currencies").collect();
  return all.find((c) => c.default)?._id;
}

export async function getGroupBrandingForPrint(
  ctx: QueryCtx,
  groupId: Id<"groups"> | undefined,
) {
  if (!groupId) return null;
  const group = await ctx.db.get(groupId);
  if (!group) return null;

  const settings = await getSettingsByGroup(ctx, groupId);
  let logoUrl: string | null = null;

  const logoStorageId =
    group.logoStorageId ?? settings?.companyLogoStorageId ?? null;
  if (logoStorageId) {
    logoUrl = await ctx.storage.getUrl(logoStorageId);
  }

  return {
    name: group.name,
    logoUrl,
    taxNumber: group.taxNumber ?? null,
    nationalAddress: group.nationalAddress ?? null,
    buildingNumber: group.buildingNumber ?? null,
    address: group.address ?? null,
    district: group.district ?? null,
    secondaryNumber: group.secondaryNumber ?? null,
    city: group.city ?? null,
    zipCode: group.zipCode ?? null,
  };
}
