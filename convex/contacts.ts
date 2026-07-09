import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  filterByOrgGroup,
  getAccessibleOrgGroupIds,
  getUserAssignedGroupIds,
  orgGroupFilterValidator,
  resolveOrgGroupFilter,
  resolveOrgGroupForCreate,
} from "./orgGroupHelpers";

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

async function canAccessContact(
  ctx: any,
  contactId: Id<"contacts">,
  currentUser: any,
  isSuperAdmin: boolean,
) {
  const contact = await ctx.db.get(contactId);
  if (!contact) throw new Error("Contact not found");

  if (!isSuperAdmin) {
    const assigned = getUserAssignedGroupIds(currentUser);
    if (
      contact.owner !== currentUser._id &&
      (!contact.group || !assigned.includes(contact.group))
    ) {
      throw new Error("Forbidden: You don't have access to this contact.");
    }
  }
  return contact;
}

// ============================================================================
// 2. POST (Add a new contact)
// ============================================================================

export const createContact = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    company: v.optional(v.id("companies")), // Link the contact to a company
    email: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    orgGroupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(ctx, "contacts:create");

    let assignedGroup = await resolveOrgGroupForCreate(
      ctx,
      user,
      args.orgGroupId,
      isSuperAdmin,
    );
    if (args.company) {
      const company = await ctx.db.get(args.company);
      if (company?.group) {
        assignedGroup = company.group;
      }
    }

    const contactId = await ctx.db.insert("contacts", {
      ...args,
      owner: user._id,
      group: assignedGroup,
      createdBy: user._id,
      updatedAt: Date.now(),
    });

    return contactId;
  },
});

// ============================================================================
// 3. PUT (Update contact data)
// ============================================================================

export const updateContact = mutation({
  args: {
    id: v.id("contacts"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    company: v.optional(v.id("companies")),
    email: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    owner: v.optional(v.id("users")),
    group: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(
      ctx,
      "contacts:update",
    );
    await canAccessContact(ctx, args.id, user, isSuperAdmin);

    const { id, ...updateFields } = args;

    await ctx.db.patch(id, {
      ...updateFields,
      updatedBy: user._id,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================================================
// 4. GET (Get list of contacts - with filtering by company)
// ============================================================================

export const getContacts = query({
  args: {
    companyId: v.optional(v.id("companies")),
    orgGroupId: orgGroupFilterValidator,
  },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(
      ctx,
      "contacts:read",
    );

    if (args.companyId) {
      const rows = await ctx.db
        .query("contacts")
        .withIndex("by_company", (q) => q.eq("company", args.companyId!))
        .order("desc")
        .collect();
      const accessible = await getAccessibleOrgGroupIds(ctx, user, isSuperAdmin);
      const filter = resolveOrgGroupFilter(args.orgGroupId, accessible, isSuperAdmin);
      return filterByOrgGroup(rows, filter, accessible);
    }

    if (isSuperAdmin) {
      const rows = await ctx.db.query("contacts").order("desc").collect();
      const accessible = await getAccessibleOrgGroupIds(ctx, user, isSuperAdmin);
      const filter = resolveOrgGroupFilter(args.orgGroupId, accessible, isSuperAdmin);
      return filterByOrgGroup(rows, filter, accessible);
    }

    const assigned = getUserAssignedGroupIds(user);
    const myOwned = await ctx.db
      .query("contacts")
      .withIndex("by_owner", (q) => q.eq("owner", user._id))
      .collect();

    const groupContacts = await Promise.all(
      assigned.map((groupId) =>
        ctx.db
          .query("contacts")
          .withIndex("by_group", (q) => q.eq("group", groupId))
          .collect(),
      ),
    );

    const allAccessible = [...myOwned, ...groupContacts.flat()];
    const unique = Array.from(
      new Map(allAccessible.map((item) => [item._id, item])).values(),
    );
    unique.sort((a, b) => b._creationTime - a._creationTime);

    const accessible = await getAccessibleOrgGroupIds(ctx, user, isSuperAdmin);
    const filter = resolveOrgGroupFilter(args.orgGroupId, accessible, isSuperAdmin);
    return filterByOrgGroup(unique, filter, accessible);
  },
});

// ============================================================================
// 5. GET SINGLE (Get single contact)
// ============================================================================

export const getContactById = query({
  args: { id: v.id("contacts") },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(
      ctx,
      "contacts:read",
    );
    return await canAccessContact(ctx, args.id, user, isSuperAdmin);
  },
});
