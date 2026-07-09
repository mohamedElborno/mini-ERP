import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { releaseReservationsForQuoteProductLines } from "./inventoryReservations";

/** Phrase the admin must type to confirm irreversible company deletion */
export const ORG_GROUP_DELETE_CONFIRMATION_PHRASE = "DELETE COMPANY";

type GroupTable =
  | "companies"
  | "contacts"
  | "deals"
  | "quotes"
  | "invoices"
  | "receiptVouchers"
  | "products"
  | "services"
  | "categories"
  | "currencies"
  | "taxes"
  | "bankAccounts"
  | "settings"
  | "companyCreditLedger";

type ByGroupIndex = {
  eq: (field: "group", value: Id<"groups">) => ByGroupIndex;
};

async function collectByGroup<T extends GroupTable>(
  ctx: QueryCtx | MutationCtx,
  table: T,
  groupId: Id<"groups">,
): Promise<Doc<T>[]> {
  return ctx.db
    .query(table)
    .withIndex(
      "by_group",
      (q) => (q as unknown as ByGroupIndex).eq("group", groupId) as never,
    )
    .collect();
}

async function countOrgGroupData(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">,
) {
  const [
    companies,
    contacts,
    deals,
    quotes,
    invoices,
    receiptVouchers,
    products,
    services,
    categories,
    currencies,
    taxes,
    bankAccounts,
    settings,
    creditLedger,
  ] = await Promise.all([
    collectByGroup(ctx, "companies", groupId),
    collectByGroup(ctx, "contacts", groupId),
    collectByGroup(ctx, "deals", groupId),
    collectByGroup(ctx, "quotes", groupId),
    collectByGroup(ctx, "invoices", groupId),
    collectByGroup(ctx, "receiptVouchers", groupId),
    collectByGroup(ctx, "products", groupId),
    collectByGroup(ctx, "services", groupId),
    collectByGroup(ctx, "categories", groupId),
    collectByGroup(ctx, "currencies", groupId),
    collectByGroup(ctx, "taxes", groupId),
    collectByGroup(ctx, "bankAccounts", groupId),
    collectByGroup(ctx, "settings", groupId),
    collectByGroup(ctx, "companyCreditLedger", groupId),
  ]);

  let activities = 0;
  for (const deal of deals) {
    const rows = await ctx.db
      .query("activities")
      .withIndex("by_deal", (q) => q.eq("deal", deal._id))
      .collect();
    activities += rows.length;
  }

  return {
    companies: companies.length,
    contacts: contacts.length,
    deals: deals.length,
    activities,
    quotes: quotes.length,
    invoices: invoices.length,
    receiptVouchers: receiptVouchers.length,
    products: products.length,
    services: services.length,
    categories: categories.length,
    currencies: currencies.length,
    taxes: taxes.length,
    bankAccounts: bankAccounts.length,
    settings: settings.length,
    creditLedger: creditLedger.length,
    total:
      companies.length +
      contacts.length +
      deals.length +
      activities +
      quotes.length +
      invoices.length +
      receiptVouchers.length +
      products.length +
      services.length +
      categories.length +
      currencies.length +
      taxes.length +
      bankAccounts.length +
      settings.length +
      creditLedger.length,
  };
}

export async function countOrgGroupDataRecursive(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">,
) {
  const direct = await countOrgGroupData(ctx, groupId);
  const group = await ctx.db.get(groupId);
  let subsidiaries = 0;
  let subsidiaryRecords = 0;

  if (group?.children?.length) {
    for (const childId of group.children) {
      subsidiaries += 1;
      const nested = await countOrgGroupDataRecursive(ctx, childId);
      subsidiaries += nested.subsidiaries;
      subsidiaryRecords += nested.totalRecords;
    }
  }

  return {
    direct,
    subsidiaries,
    subsidiaryRecords,
    totalRecords: direct.total + subsidiaryRecords,
  };
}

async function deleteAuditLogsForEntity(
  ctx: MutationCtx,
  entityId: string,
) {
  const logs = await ctx.db
    .query("auditLogs")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .collect();
  for (const log of logs) {
    await ctx.db.delete(log._id);
  }
}

async function deleteOrgGroupDataOnly(
  ctx: MutationCtx,
  groupId: Id<"groups">,
) {
  const auditEntityIds: string[] = [];

  const receiptVouchers = await collectByGroup(
    ctx,
    "receiptVouchers",
    groupId,
  );
  for (const row of receiptVouchers) {
    auditEntityIds.push(row._id);
    await ctx.db.delete(row._id);
  }

  const invoices = await collectByGroup(ctx, "invoices", groupId);
  for (const row of invoices) {
    auditEntityIds.push(row._id);
    await ctx.db.delete(row._id);
  }

  const quotes = await collectByGroup(ctx, "quotes", groupId);
  for (const row of quotes) {
    await releaseReservationsForQuoteProductLines(ctx, row.lineItems);
    auditEntityIds.push(row._id);
    await ctx.db.delete(row._id);
  }

  const deals = await collectByGroup(ctx, "deals", groupId);
  for (const deal of deals) {
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_deal", (q) => q.eq("deal", deal._id))
      .collect();
    for (const activity of activities) {
      await ctx.db.delete(activity._id);
    }
    auditEntityIds.push(deal._id);
    await ctx.db.delete(deal._id);
  }

  const contacts = await collectByGroup(ctx, "contacts", groupId);
  for (const row of contacts) {
    auditEntityIds.push(row._id);
    await ctx.db.delete(row._id);
  }

  const creditLedgerRows = await collectByGroup(
    ctx,
    "companyCreditLedger",
    groupId,
  );
  for (const row of creditLedgerRows) {
    await ctx.db.delete(row._id);
  }

  const companies = await collectByGroup(ctx, "companies", groupId);
  for (const row of companies) {
    auditEntityIds.push(row._id);
    await ctx.db.delete(row._id);
  }

  const bankAccounts = await collectByGroup(ctx, "bankAccounts", groupId);
  for (const row of bankAccounts) {
    await ctx.db.delete(row._id);
  }

  const settings = await collectByGroup(ctx, "settings", groupId);
  for (const row of settings) {
    await ctx.db.delete(row._id);
  }

  const products = await collectByGroup(ctx, "products", groupId);
  for (const row of products) {
    await ctx.db.delete(row._id);
  }

  const services = await collectByGroup(ctx, "services", groupId);
  for (const row of services) {
    await ctx.db.delete(row._id);
  }

  const categories = await collectByGroup(ctx, "categories", groupId);
  for (const row of categories) {
    await ctx.db.delete(row._id);
  }

  const taxes = await collectByGroup(ctx, "taxes", groupId);
  for (const row of taxes) {
    await ctx.db.delete(row._id);
  }

  const currencies = await collectByGroup(ctx, "currencies", groupId);
  for (const row of currencies) {
    await ctx.db.delete(row._id);
  }

  for (const entityId of auditEntityIds) {
    await deleteAuditLogsForEntity(ctx, entityId);
  }
}

export async function deleteOrgGroupCascade(
  ctx: MutationCtx,
  groupId: Id<"groups">,
) {
  const group = await ctx.db.get(groupId);
  if (!group) throw new Error("Company not found.");

  if (group.children?.length) {
    for (const childId of group.children) {
      await deleteOrgGroupCascade(ctx, childId);
    }
  }

  if (group.parent) {
    const parent = await ctx.db.get(group.parent);
    if (parent?.children) {
      await ctx.db.patch(group.parent, {
        children: parent.children.filter((c) => c !== groupId),
      });
    }
  }

  const users = await ctx.db.query("users").collect();
  for (const u of users) {
    const assigned = u.assignedGroups ?? [];
    if (!assigned.includes(groupId)) continue;
    const nextAssigned = assigned.filter((g) => g !== groupId);
    const patch: Record<string, unknown> = {
      assignedGroups: nextAssigned,
      updatedAt: Date.now(),
    };
    if (u.group === groupId) {
      patch.group = nextAssigned[0];
    }
    await ctx.db.patch(u._id, patch);
  }

  await deleteOrgGroupDataOnly(ctx, groupId);
  await ctx.db.delete(groupId);
}
