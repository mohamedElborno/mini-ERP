import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

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

  // Smart version that supports the global admin permission "admin:all"
  const hasSpecificPermission = role?.permissions.includes(permissionName);
  const isSuperAdmin = role?.permissions.includes("admin:all");

  if (!role || (!hasSpecificPermission && !isSuperAdmin)) {
    throw new Error(`Forbidden: Missing permission [${permissionName}]`);
  }

  return user;
}

// ============================================================================
// 2. POST (Create new role/permission)
// ============================================================================

export const createRole = mutation({
  args: {
    name: v.string(),
    permissions: v.array(v.string()), // Array of strings, e.g.: ["deals:read", "deals:create"]
  },
  handler: async (ctx, args) => {
    // To create a new role, the user must have the global admin or user management permission
    const currentUser = await requirePermission(ctx, "admin:all");

    // Check for duplicate role name
    const existingRole = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existingRole) {
      throw new Error("A role with this name already exists.");
    }

    const roleId = await ctx.db.insert("roles", {
      name: args.name,
      permissions: args.permissions,
      createdBy: currentUser._id,
      updatedAt: Date.now(),
    });

    return roleId;
  },
});

// ============================================================================
// 3. PUT (Update role permissions)
// ============================================================================

export const updateRole = mutation({
  args: {
    id: v.id("roles"),
    name: v.optional(v.string()),
    permissions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const currentUser = await requirePermission(ctx, "admin:all");

    const role = await ctx.db.get(args.id);
    if (!role) throw new Error("Role not found");

    // Additional protection (optional but important): Prevent modifying the "Super Admin" role if you want to keep it
    // if (role.name === "Super Admin") throw new Error("Cannot modify the Super Admin role.");

    await ctx.db.patch(args.id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.permissions !== undefined && { permissions: args.permissions }),
      updatedBy: currentUser._id,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================================================
// 4. GET (Get all roles to display in the user management page)
// ============================================================================

export const getRoles = query({
  args: {},
  handler: async (ctx) => {
    // Usually this function is used in the user management page, so we request the read permission for users
    await requirePermission(ctx, "users:read");

    return await ctx.db.query("roles").order("desc").collect();
  },
});

// ============================================================================
// 5. GET SINGLE (Get single role details)
// ============================================================================

export const getRoleById = query({
  args: {
    id: v.id("roles"),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "users:read");
    return await ctx.db.get(args.id);
  },
});
