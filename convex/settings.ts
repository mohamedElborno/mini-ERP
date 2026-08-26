import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  ensureSettingsForGroup,
  getSettingsByGroup,
  orgGroupFilterValidator,
  resolveOrgGroupForCreate,
} from "./orgGroupHelpers";

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

export function buildDocumentNumber(
  prefix: string,
  includeYear: boolean,
  padding: number,
  sequence: number,
): string {
  const paddedSeq = String(sequence).padStart(padding, "0");
  const year = includeYear
    ? new Date().getFullYear().toString().slice(-2)
    : null;
  const parts = [prefix, ...(year ? [String(year)] : []), paddedSeq];
  return parts.join("-");
}

export const generateDocumentNumber = internalMutation({
  args: {
    type: v.union(
      v.literal("quote"),
      v.literal("invoice"),
      v.literal("product"),
      v.literal("receiptVoucher"),
    ),
    groupId: v.id("groups"),
  },
  handler: async (ctx, { type, groupId }): Promise<string> => {
    const doc = await getSettingsByGroup(ctx, groupId);

    let prefix: string;
    let includeYear: boolean;
    let padding: number;
    let currentSeq: number;
    let sequenceField:
      | "quoteNextSequence"
      | "invoiceNextSequence"
      | "productNextSequence"
      | "receiptVoucherNextSequence";

    if (type === "quote") {
      prefix = doc?.quoteNumberPrefix ?? "QT";
      includeYear = doc?.quoteNumberIncludeYear ?? true;
      padding = doc?.quoteNumberPadding ?? 5;
      currentSeq = (doc?.quoteNextSequence ?? 0) + 1;
      sequenceField = "quoteNextSequence";
    } else if (type === "invoice") {
      prefix = doc?.invoiceNumberPrefix ?? "INV";
      includeYear = doc?.invoiceNumberIncludeYear ?? true;
      padding = doc?.invoiceNumberPadding ?? 5;
      currentSeq = (doc?.invoiceNextSequence ?? 0) + 1;
      sequenceField = "invoiceNextSequence";
    } else if (type === "product") {
      prefix = doc?.productCodePrefix ?? "PRD";
      includeYear = doc?.productCodeIncludeYear ?? false;
      padding = doc?.productCodePadding ?? 4;
      currentSeq = (doc?.productNextSequence ?? 0) + 1;
      sequenceField = "productNextSequence";
    } else {
      prefix = doc?.receiptVoucherNumberPrefix ?? "RV";
      includeYear = doc?.receiptVoucherNumberIncludeYear ?? true;
      padding = doc?.receiptVoucherNumberPadding ?? 5;
      currentSeq = (doc?.receiptVoucherNextSequence ?? 0) + 1;
      sequenceField = "receiptVoucherNextSequence";
    }

    if (doc) {
      await ctx.db.patch(doc._id, { [sequenceField]: currentSeq });
    } else {
      await ctx.db.insert("settings", {
        group: groupId,
        [sequenceField]: currentSeq,
      });
    }

    return buildDocumentNumber(prefix, includeYear, padding, currentSeq);
  },
});

export const getSettings = query({
  args: { orgGroupId: orgGroupFilterValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    let doc;
    if (!args.orgGroupId || args.orgGroupId === "all") {
      doc = (await ctx.db.query("settings").first()) ?? null;
    } else {
      doc = (await getSettingsByGroup(ctx, args.orgGroupId)) ?? null;
    }

    if (!doc) return null;

    let companyLogoUrl: string | null = null;
    if (doc.companyLogoStorageId) {
      companyLogoUrl = await ctx.storage.getUrl(doc.companyLogoStorageId);
    }

    return { ...doc, companyLogoUrl };
  },
});

export const updateSettings = mutation({
  args: {
    orgGroupId: v.optional(v.id("groups")),
    defaultCurrency: v.optional(v.id("currencies")),
    quoteNumberMode: v.optional(
      v.union(v.literal("auto"), v.literal("manual")),
    ),
    quoteNumberPrefix: v.optional(v.string()),
    quoteNumberIncludeYear: v.optional(v.boolean()),
    quoteNumberPadding: v.optional(v.number()),
    invoiceNumberMode: v.optional(
      v.union(v.literal("auto"), v.literal("manual")),
    ),
    invoiceNumberPrefix: v.optional(v.string()),
    invoiceNumberIncludeYear: v.optional(v.boolean()),
    invoiceNumberPadding: v.optional(v.number()),
    productCodeMode: v.optional(
      v.union(v.literal("auto"), v.literal("manual")),
    ),
    productCodePrefix: v.optional(v.string()),
    productCodeIncludeYear: v.optional(v.boolean()),
    productCodePadding: v.optional(v.number()),
    receiptVoucherNumberMode: v.optional(
      v.union(v.literal("auto"), v.literal("manual")),
    ),
    receiptVoucherNumberPrefix: v.optional(v.string()),
    receiptVoucherNumberIncludeYear: v.optional(v.boolean()),
    receiptVoucherNumberPadding: v.optional(v.number()),
    allowPerLineTaxes: v.optional(v.boolean()),
    defaultTaxIds: v.optional(v.array(v.id("taxes"))),
    companyLogoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(ctx, "settings:manage");
    const groupId = await resolveOrgGroupForCreate(
      ctx,
      user,
      args.orgGroupId,
      isSuperAdmin,
    );

    const patch: Record<string, unknown> = {
      group: groupId,
      updatedBy: user._id,
      updatedAt: Date.now(),
    };

    const fields = [
      "defaultCurrency",
      "quoteNumberMode",
      "quoteNumberPrefix",
      "quoteNumberIncludeYear",
      "quoteNumberPadding",
      "invoiceNumberMode",
      "invoiceNumberPrefix",
      "invoiceNumberIncludeYear",
      "invoiceNumberPadding",
      "productCodeMode",
      "productCodePrefix",
      "productCodeIncludeYear",
      "productCodePadding",
      "receiptVoucherNumberMode",
      "receiptVoucherNumberPrefix",
      "receiptVoucherNumberIncludeYear",
      "receiptVoucherNumberPadding",
      "allowPerLineTaxes",
      "defaultTaxIds",
      "companyLogoStorageId",
    ] as const;

    for (const key of fields) {
      if ((args as Record<string, unknown>)[key] !== undefined) {
        patch[key] = (args as Record<string, unknown>)[key];
      }
    }

    const existing = await getSettingsByGroup(ctx, groupId);
    if (
      args.companyLogoStorageId !== undefined &&
      existing?.companyLogoStorageId &&
      existing.companyLogoStorageId !== args.companyLogoStorageId
    ) {
      await ctx.storage.delete(existing.companyLogoStorageId);
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    await ensureSettingsForGroup(ctx, groupId, user._id);
    const created = await getSettingsByGroup(ctx, groupId);
    if (!created) throw new Error("Failed to save settings.");
    await ctx.db.patch(created._id, patch);
    return created._id;
  },
});

export const generateCompanyLogoUploadUrl = mutation({
  args: { orgGroupId: v.optional(v.id("groups")) },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(
      ctx,
      "settings:manage",
    );
    await resolveOrgGroupForCreate(ctx, user, args.orgGroupId, isSuperAdmin);
    return await ctx.storage.generateUploadUrl();
  },
});

export const removeCompanyLogo = mutation({
  args: { orgGroupId: v.optional(v.id("groups")) },
  handler: async (ctx, args) => {
    const { user, isSuperAdmin } = await requirePermission(
      ctx,
      "settings:manage",
    );
    const groupId = await resolveOrgGroupForCreate(
      ctx,
      user,
      args.orgGroupId,
      isSuperAdmin,
    );

    const existing = await getSettingsByGroup(ctx, groupId);
    if (!existing?.companyLogoStorageId) return;

    await ctx.storage.delete(existing.companyLogoStorageId);
    await ctx.db.patch(existing._id, {
      companyLogoStorageId: undefined,
      updatedBy: user._id,
      updatedAt: Date.now(),
    });
  },
});
