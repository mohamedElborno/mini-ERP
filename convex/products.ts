import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { recomputeQuoteShortage } from "./inventoryReservations";
import {
  filterByOrgGroup,
  getAccessibleOrgGroupIds,
  getSettingsByGroup,
  orgGroupFilterValidator,
  resolveOrgGroupFilter,
  resolveOrgGroupForCreate,
} from "./orgGroupHelpers";
import {
  getListAuth,
  listSearchValidator,
  normalizeSearch,
  paginateWithPredicate,
  productMatchesSearch,
  productMatchesStatusFilter,
  resolveGroupIdsForList,
} from "./listPagination";

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

export const createProduct = mutation({
  args: {
    name: v.string(),
    code: v.optional(v.string()),
    categories: v.optional(v.array(v.id("categories"))),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    ),
    stock: v.optional(v.number()),
    price: v.optional(v.number()),
    orgGroupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(ctx, "products:create");
    const { orgGroupId: requestedOrgGroupId, ...productFields } = args;
    const orgGroupId = await resolveOrgGroupForCreate(
      ctx,
      user,
      requestedOrgGroupId,
      isSuperAdmin,
    );

    let productCode = productFields.code?.trim() || "";
    if (!productCode) {
      const settings = await getSettingsByGroup(ctx, orgGroupId);
      const mode = settings?.productCodeMode ?? "manual";
      if (mode === "auto") {
        productCode = await ctx.runMutation(
          internal.settings.generateDocumentNumber,
          { type: "product", groupId: orgGroupId },
        );
      }
    }

    if (productCode) {
      const sameGroup = await ctx.db
        .query("products")
        .withIndex("by_group", (q) => q.eq("group", orgGroupId))
        .collect();
      if (sameGroup.some((p) => p.code === productCode)) {
        throw new Error("A product with this code already exists.");
      }
    }

    const stock = args.stock ?? 0;
    const productId = await ctx.db.insert("products", {
      name: productFields.name,
      code: productCode || undefined,
      categories: productFields.categories ?? [],
      description: productFields.description,
      status: productFields.status || "active",
      stock,
      reserved: 0,
      shortage: recomputeQuoteShortage(stock, 0),
      price: productFields.price || 0,
      group: orgGroupId,
      createdBy: user._id,
      updatedAt: Date.now(),
    });

    return productId;
  },
});

export const updateProduct = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    categories: v.optional(v.array(v.id("categories"))),
    description: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    ),
    stock: v.optional(v.number()),
    price: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requirePermission(ctx, "products:update");

    const product = await ctx.db.get(args.id);
    if (!product) throw new Error("Product not found");

    const nextStock =
      args.stock !== undefined ? args.stock : (product.stock ?? 0);
    const reserved = product.reserved ?? 0;
    const nextShortage =
      args.stock !== undefined
        ? recomputeQuoteShortage(nextStock, reserved)
        : (product.shortage ?? 0);

    await ctx.db.patch(args.id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.code !== undefined && { code: args.code }),
      ...(args.categories !== undefined && { categories: args.categories }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.status !== undefined && { status: args.status }),
      ...(args.stock !== undefined && { stock: args.stock }),
      ...(args.stock !== undefined && { shortage: nextShortage }),
      ...(args.price !== undefined && { price: args.price }),
      updatedBy: user._id,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const getProducts = query({
  args: {
    categoryId: v.optional(v.id("categories")),
    orgGroupId: orgGroupFilterValidator,
  },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(ctx, "products:read");
    const accessible = await getAccessibleOrgGroupIds(ctx, user, isSuperAdmin);
    const filter = resolveOrgGroupFilter(args.orgGroupId, accessible, isSuperAdmin);

    let allProducts = await ctx.db.query("products").order("desc").collect();
    allProducts = filterByOrgGroup(allProducts, filter, accessible);

    if (args.categoryId) {
      allProducts = allProducts.filter((p) =>
        p.categories?.includes(args.categoryId!),
      );
    }

    if (isSuperAdmin) return allProducts;
    return allProducts.filter((p) => p.status === "active");
  },
});

export const listProductsPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    orgGroupId: orgGroupFilterValidator,
    statusFilter: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    search: listSearchValidator,
  },
  handler: async (ctx, args) => {
    const { isAdmin, accessible } = await getListAuth(ctx, "products:read");
    const term = normalizeSearch(args.search);
    const groupIds = resolveGroupIdsForList(args.orgGroupId, accessible);
    const orgFilter = resolveOrgGroupFilter(
      args.orgGroupId,
      accessible,
      isAdmin,
    );
    const statusFilter = args.statusFilter;

    const buildFetch = (opts: typeof args.paginationOpts) => {
      if (
        groupIds.length === 1 &&
        statusFilter &&
        statusFilter !== "all"
      ) {
        return ctx.db
          .query("products")
          .withIndex("by_group_status", (q) =>
            q
              .eq("group", groupIds[0])
              .eq(
                "status",
                statusFilter as NonNullable<
                  import("./_generated/dataModel").Doc<"products">["status"]
                >,
              ),
          )
          .order("desc")
          .paginate(opts);
      }
      if (groupIds.length === 1) {
        return ctx.db
          .query("products")
          .withIndex("by_group", (q) => q.eq("group", groupIds[0]))
          .order("desc")
          .paginate(opts);
      }
      return ctx.db.query("products").order("desc").paginate(opts);
    };

    return paginateWithPredicate(
      buildFetch,
      args.paginationOpts,
      (product) => {
        if (orgFilter !== "all" && orgFilter && product.group !== orgFilter) {
          return false;
        }
        if (
          orgFilter === "all" &&
          product.group &&
          !accessible.includes(product.group)
        ) {
          return false;
        }
        if (!productMatchesStatusFilter(product, statusFilter, isAdmin)) {
          return false;
        }
        if (
          args.categoryId &&
          !product.categories?.includes(args.categoryId)
        ) {
          return false;
        }
        return productMatchesSearch(product, term);
      },
    );
  },
});

export const getProductListStats = query({
  args: { orgGroupId: orgGroupFilterValidator },
  handler: async (ctx, args) => {
    const { isAdmin, accessible } = await getListAuth(ctx, "products:read");
    const orgFilter = resolveOrgGroupFilter(
      args.orgGroupId,
      accessible,
      isAdmin,
    );
    const groupIds = resolveGroupIdsForList(args.orgGroupId, accessible);

    let rows;
    if (groupIds.length === 1) {
      rows = await ctx.db
        .query("products")
        .withIndex("by_group", (q) => q.eq("group", groupIds[0]))
        .collect();
    } else {
      rows = await ctx.db.query("products").collect();
    }

    rows = filterByOrgGroup(rows, orgFilter, accessible);
    if (!isAdmin) {
      rows = rows.filter((p) => p.status === "active");
    }

    return {
      total: rows.length,
      active: rows.filter((p) => p.status === "active").length,
      draft: rows.filter((p) => p.status === "draft").length,
      archived: rows.filter((p) => p.status === "archived").length,
    };
  },
});

export const getProductById = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "products:read");
    return await ctx.db.get(args.id);
  },
});
