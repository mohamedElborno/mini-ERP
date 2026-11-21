import { authorizeRequest } from "./access";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  filterByOrgGroup,
  getAccessibleOrgGroupIds,
  getUserAssignedGroupIds,
  orgGroupFilterValidator,
  resolveOrgGroupFilter,
  resolveOrgGroupForCreate,
  userCanAccessOrgGroup,
} from "./orgGroupHelpers";
import { logManualCreditLimitUpdate } from "./companyCredit";
import { normalizeNationalAddressFields } from "./lib/saudiNationalAddress";
import {
  companyMatchesSearch,
  getListAuth,
  listSearchValidator,
  normalizeSearch,
  paginateWithPredicate,
  resolveGroupIdsForList,
  rowInAccessibleGroups,
} from "./listPagination";

// ============================================================================
// 1. HELPERS (Helper functions)
// ============================================================================

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

// Helper function to check if the user has access to a specific company (to prevent accessing clients from other branches)
async function canAccessCompany(
  ctx: any,
  companyId: Id<"companies">,
  currentUser: any,
  isSuperAdmin: boolean,
) {
  const company = await ctx.db.get(companyId);
  if (!company) throw new Error("Company not found");

  if (!isSuperAdmin) {
    const assigned = getUserAssignedGroupIds(currentUser);
    if (
      company.owner !== currentUser._id &&
      (!company.group || !assigned.includes(company.group))
    ) {
      throw new Error(
        "Forbidden: You don't have access to this company's data.",
      );
    }
  }
  return company;
}

// ============================================================================
// 2. POST (Add a new company)
// ============================================================================

export const createCompany = mutation({
  args: {
    name: v.string(),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    address: v.optional(v.string()),
    taxNumber: v.optional(v.string()),
    nationalAddress: v.optional(v.string()),
    buildingNumber: v.optional(v.string()),
    district: v.optional(v.string()),
    secondaryNumber: v.optional(v.string()),
    website: v.optional(v.string()),
    email: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    orgGroupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "companies.createCompany");
    const { user, isSuperAdmin } = await requirePermission(
      ctx,
      "companies:create",
    );
    const { orgGroupId: requestedOrgGroupId, ...rawFields } = args;
    const companyFields = normalizeNationalAddressFields(rawFields);
    const orgGroupId = await resolveOrgGroupForCreate(
      ctx,
      user,
      requestedOrgGroupId,
      isSuperAdmin,
    );

    if (args.email) {
      const existing = await ctx.db
        .query("companies")
        .withIndex("by_email", (q) => q.eq("email", args.email!))
        .first();
      if (existing)
        throw new Error("A company with this email already exists.");
    }

    const companyId = await ctx.db.insert("companies", {
      ...companyFields,
      owner: user._id,
      group: orgGroupId,
      createdBy: user._id,
      updatedAt: Date.now(),
    });

    return companyId;
  },
});

// ============================================================================
// 3. PUT (Update company data or transfer ownership)
// ============================================================================

export const updateCompany = mutation({
  args: {
    id: v.id("companies"),
    name: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    address: v.optional(v.string()),
    taxNumber: v.optional(v.string()),
    nationalAddress: v.optional(v.string()),
    buildingNumber: v.optional(v.string()),
    district: v.optional(v.string()),
    secondaryNumber: v.optional(v.string()),
    website: v.optional(v.string()),
    email: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    owner: v.optional(v.id("users")), // To transfer the client to another employee
    group: v.optional(v.id("groups")), // To transfer the client to another branch
    creditLimit: v.optional(v.number()),
    creditPeriodDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "companies.updateCompany");
    const { user, isSuperAdmin } = await requirePermission(
      ctx,
      "companies:update",
    );
    const company = await canAccessCompany(ctx, args.id, user, isSuperAdmin);

    const { id, creditLimit, creditPeriodDays, ...rawFields } = args;
    const updateFields = normalizeNationalAddressFields(rawFields);

    if (creditLimit !== undefined && creditLimit < 0) {
      throw new Error("Credit limit cannot be negative.");
    }
    if (creditPeriodDays !== undefined && creditPeriodDays < 0) {
      throw new Error("Credit period cannot be negative.");
    }
    if (
      creditLimit !== undefined &&
      (company.creditUsed ?? 0) > creditLimit + 0.0001
    ) {
      throw new Error(
        "Credit limit cannot be less than the amount already used on credit.",
      );
    }

    await ctx.db.patch(id, {
      ...updateFields,
      ...(creditLimit !== undefined ? { creditLimit } : {}),
      ...(creditPeriodDays !== undefined ? { creditPeriodDays } : {}),
      updatedBy: user._id,
      updatedAt: Date.now(),
    });

    if (creditLimit !== undefined || creditPeriodDays !== undefined) {
      await logManualCreditLimitUpdate(ctx, id, user._id, {
        creditLimitBefore: company.creditLimit,
        creditLimitAfter:
          creditLimit !== undefined ? creditLimit : company.creditLimit,
        creditPeriodDaysBefore: company.creditPeriodDays,
        creditPeriodDaysAfter:
          creditPeriodDays !== undefined
            ? creditPeriodDays
            : company.creditPeriodDays,
      });
    }

    return { success: true };
  },
});

// ============================================================================
// 4. GET (Get list of companies based on the scope of visibility)
// ============================================================================

export const getCompanies = query({
  args: { orgGroupId: orgGroupFilterValidator },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "companies.getCompanies");
    const { user, isSuperAdmin } = await requirePermission(
      ctx,
      "companies:read",
    );
    const accessible = await getAccessibleOrgGroupIds(ctx, user, isSuperAdmin);
    const filter = resolveOrgGroupFilter(
      args.orgGroupId,
      accessible,
      isSuperAdmin,
    );

    let rows;
    if (isSuperAdmin) {
      rows = await ctx.db.query("companies").order("desc").collect();
    } else {
      const myOwned = await ctx.db
        .query("companies")
        .withIndex("by_owner", (q) => q.eq("owner", user._id))
        .collect();

      const groupCompanies = await Promise.all(
        accessible.map((groupId) =>
          ctx.db
            .query("companies")
            .withIndex("by_group", (q) => q.eq("group", groupId))
            .collect(),
        ),
      );

      const allAccessible = [...myOwned, ...groupCompanies.flat()];
      rows = Array.from(
        new Map(allAccessible.map((item) => [item._id, item])).values(),
      );
      rows.sort((a, b) => b._creationTime - a._creationTime);
    }

    return filterByOrgGroup(rows, filter, accessible);
  },
});

export const listCompaniesPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    orgGroupId: orgGroupFilterValidator,
    search: listSearchValidator,
  },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "companies.listCompaniesPaginated");
    const { user, isAdmin, accessible } = await getListAuth(
      ctx,
      "companies:read",
    );
    const term = normalizeSearch(args.search);
    const groupIds = resolveGroupIdsForList(args.orgGroupId, accessible);
    const orgFilter = resolveOrgGroupFilter(
      args.orgGroupId,
      accessible,
      isAdmin,
    );

    const buildFetch = (opts: typeof args.paginationOpts) => {
      if (groupIds.length === 1) {
        return ctx.db
          .query("companies")
          .withIndex("by_group", (q) => q.eq("group", groupIds[0]))
          .order("desc")
          .paginate(opts);
      }
      return ctx.db.query("companies").order("desc").paginate(opts);
    };

    return paginateWithPredicate(
      buildFetch,
      args.paginationOpts,
      (company) => {
        if (!rowInAccessibleGroups(company, accessible)) return false;
        if (orgFilter !== "all" && orgFilter && company.group !== orgFilter) {
          return false;
        }
        if (!isAdmin) {
          const assigned = getUserAssignedGroupIds(user);
          if (
            company.owner !== user._id &&
            (!company.group || !assigned.includes(company.group))
          ) {
            return false;
          }
        }
        return companyMatchesSearch(company, term);
      },
    );
  },
});

export const getCompanyListStats = query({
  args: { orgGroupId: orgGroupFilterValidator },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "companies.getCompanyListStats");
    const { user, isAdmin, accessible } = await getListAuth(
      ctx,
      "companies:read",
    );
    const filter = resolveOrgGroupFilter(
      args.orgGroupId,
      accessible,
      isAdmin,
    );
    const groupIds = resolveGroupIdsForList(args.orgGroupId, accessible);

    let rows;
    if (isAdmin) {
      rows =
        groupIds.length === 1
          ? await ctx.db
              .query("companies")
              .withIndex("by_group", (q) => q.eq("group", groupIds[0]))
              .collect()
          : await ctx.db.query("companies").collect();
    } else {
      const myOwned = await ctx.db
        .query("companies")
        .withIndex("by_owner", (q) => q.eq("owner", user._id))
        .collect();
      const groupCompanies = await Promise.all(
        accessible.map((groupId) =>
          ctx.db
            .query("companies")
            .withIndex("by_group", (q) => q.eq("group", groupId))
            .collect(),
        ),
      );
      const allAccessible = [...myOwned, ...groupCompanies.flat()];
      rows = Array.from(
        new Map(allAccessible.map((item) => [item._id, item])).values(),
      );
    }

    rows = filterByOrgGroup(rows, filter, accessible);
    if (!isAdmin) {
      rows = rows.filter((company) => {
        const assigned = getUserAssignedGroupIds({
          _id: user._id,
          group: user.group ?? undefined,
          assignedGroups: user.assignedGroups,
        });
        return (
          company.owner === user._id ||
          (company.group != null && assigned.includes(company.group))
        );
      });
    }

    return { total: rows.length };
  },
});

// ============================================================================
// 5. GET SINGLE (Get single company)
// ============================================================================

export const getCompanyById = query({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    await authorizeRequest(ctx, args, "companies.getCompanyById");
    const { user, isSuperAdmin } = await requirePermission(
      ctx,
      "companies:read",
    );
    return await canAccessCompany(ctx, args.id, user, isSuperAdmin);
  },
});
