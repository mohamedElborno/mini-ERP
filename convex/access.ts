import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id, TableNames } from "./_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;
const scopedTables: TableNames[] = ["groups", "companies", "contacts", "deals", "products", "services", "categories", "currencies", "taxes", "bankAccounts", "settings", "quotes", "invoices", "receiptVouchers", "activities"];

export async function requireMember(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  const user = await ctx.db.query("users").withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject)).unique();
  const role = user?.role ? await ctx.db.get(user.role) : null;
  if (!user || !role) throw new Error("Forbidden: Approval required");
  return { user, role, admin: role.permissions.includes("admin:all"), groups: user.assignedGroups?.length ? user.assignedGroups : user.group ? [user.group] : [] };
}

export async function requireAdmin(ctx: Ctx) {
  const member = await requireMember(ctx);
  if (!member.admin) throw new Error("Forbidden: Administrator required");
  return member;
}

/** Defense in depth for every staff endpoint, including nested/batch references.
 * Existing operation-specific permission checks still apply.
 */
export async function authorizeRequest(ctx: Ctx, args: unknown, endpoint: string) {
  const member = await requireMember(ctx);
  const record = (args ?? {}) as Record<string, unknown>;
  if (!member.admin && member.groups.length === 0) throw new Error("Forbidden: No assigned company");
  if (endpoint.startsWith("users.") || endpoint.startsWith("invitations.")) {
    if (!member.admin) throw new Error("Forbidden: Administrator required");
  }
  if (/^groups\.(create|update|delete|set|remove|generate)/.test(endpoint) && !member.admin) {
    throw new Error("Forbidden: Administrator required for company administration");
  }
  if (!member.admin && ("owner" in record || "group" in record || "companyLogoStorageId" in record || "logoStorageId" in record || "storageId" in record)) {
    throw new Error("Forbidden: Administrator required for ownership or file changes");
  }
  const groupIds = new Set<string>();
  const checked = new Set<string>();
  async function check(value: unknown): Promise<void> {
    if (Array.isArray(value)) { for (const item of value) await check(item); return; }
    if (value && typeof value === "object") { for (const item of Object.values(value)) await check(item); return; }
    if (typeof value !== "string" || checked.has(value)) return;
    for (const table of scopedTables) {
      const id = ctx.db.normalizeId(table, value);
      if (!id) continue;
      checked.add(value);
      const doc = await ctx.db.get(id);
      if (!doc) throw new Error("Record not found");
      const row = doc as unknown as Record<string, unknown>;
      let group = table === "groups" ? value : row.group as string | undefined;
      if (!group && table === "activities" && row.deal) {
        group = (await ctx.db.get(row.deal as Id<"deals">))?.group;
      }
      if (!group && table === "receiptVouchers" && row.company) {
        group = (await ctx.db.get(row.company as Id<"companies">))?.group;
      }
      if (!member.admin && (!group || !member.groups.includes(group as Id<"groups">))) {
        throw new Error("Forbidden: Company access denied");
      }
      if (group) groupIds.add(group);
      for (const field of ["company", "contact", "deal", "quote", "currency", "categories", "lineItems", "services", "shippingTaxes", "defaultTaxIds", "defaultCurrency"]) {
        if (row[field] !== undefined) await check(row[field]);
      }
      return;
    }
  }
  await check(args);
  // Relations within a business document must belong to the same company,
  // even for an administrator. Administrative group/user management is exempt.
  if (!/^(users|invitations|groups)\./.test(endpoint) && groupIds.size > 1) {
    throw new Error("Forbidden: Cross-company references");
  }
  return member;
}
