import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { PaginationOptions, PaginationResult } from "convex/server";
import {
  filterByOrgGroup,
  getAccessibleOrgGroupIds,
  orgGroupFilterValidator,
} from "./orgGroupHelpers";

export const listSearchValidator = v.optional(v.string());

export const PAGE_SIZE_DEFAULT = 20;

export function normalizeSearch(term: string | undefined): string {
  return term?.trim().toLowerCase() ?? "";
}

type Ctx = QueryCtx | MutationCtx;

export async function getListAuth(ctx: Ctx, permission: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user || !user.role) throw new Error("Unauthorized");

  const role = await ctx.db.get(user.role as Id<"roles">);
  const isAdmin = role?.permissions.includes("admin:all") ?? false;
  const has = role?.permissions.includes(permission) ?? false;

  if (!role || (!has && !isAdmin)) {
    throw new Error(`Forbidden: Missing permission [${permission}]`);
  }

  const accessible = await getAccessibleOrgGroupIds(ctx, user, isAdmin);
  return { user, isAdmin, accessible };
}

export function rowInAccessibleGroups<T extends { group?: Id<"groups"> | null }>(
  row: T,
  accessible: Id<"groups">[],
) {
  if (accessible.length === 0) return true;
  return !row.group || accessible.includes(row.group);
}

export async function loadDealTitleMap(
  ctx: Ctx,
  dealIds: Iterable<Id<"deals">>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(dealIds)];
  await Promise.all(
    unique.map(async (id) => {
      const deal = await ctx.db.get(id);
      if (deal) map.set(id, deal.title);
    }),
  );
  return map;
}

export async function loadCompanyNameMap(
  ctx: Ctx,
  companyIds: Iterable<Id<"companies"> | undefined | null>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [
    ...new Set(
      [...companyIds].filter((id): id is Id<"companies"> => id != null),
    ),
  ];
  await Promise.all(
    unique.map(async (id) => {
      const company = await ctx.db.get(id);
      if (company) map.set(id, company.name);
    }),
  );
  return map;
}

export async function resolveDealIdsForSearch(
  ctx: Ctx,
  term: string,
  groupIds: Id<"groups">[],
): Promise<Set<Id<"deals">>> {
  const ids = new Set<Id<"deals">>();
  if (!term || groupIds.length === 0) return ids;

  for (const groupId of groupIds) {
    const deals = await ctx.db
      .query("deals")
      .withIndex("by_group", (q) => q.eq("group", groupId))
      .collect();
    for (const deal of deals) {
      if (deal.title.toLowerCase().includes(term)) ids.add(deal._id);
    }
  }
  return ids;
}

export async function resolveCompanyIdsForSearch(
  ctx: Ctx,
  term: string,
  groupIds: Id<"groups">[],
): Promise<Set<Id<"companies">>> {
  const ids = new Set<Id<"companies">>();
  if (!term || groupIds.length === 0) return ids;

  for (const groupId of groupIds) {
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_group", (q) => q.eq("group", groupId))
      .collect();
    for (const company of companies) {
      if (company.name.toLowerCase().includes(term)) ids.add(company._id);
    }
  }
  return ids;
}

export async function loadAccessibleDealIds(
  ctx: Ctx,
  user: Doc<"users">,
  isAdmin: boolean,
  accessible: Id<"groups">[],
): Promise<Set<Id<"deals">> | null> {
  if (isAdmin) return null;

  const ids = new Set<Id<"deals">>();
  const owned = await ctx.db
    .query("deals")
    .withIndex("by_owner", (q) => q.eq("owner", user._id))
    .collect();
  for (const deal of owned) ids.add(deal._id);

  for (const groupId of accessible) {
    const groupDeals = await ctx.db
      .query("deals")
      .withIndex("by_group", (q) => q.eq("group", groupId))
      .collect();
    for (const deal of groupDeals) ids.add(deal._id);
  }
  return ids;
}

export function quoteMatchesSearch(
  quote: Doc<"quotes">,
  term: string,
  dealIds: Set<Id<"deals">>,
  companyIds: Set<Id<"companies">>,
  dealTitle?: string,
  companyName?: string,
): boolean {
  if (!term) return true;
  const number = quote.number?.toLowerCase() ?? "";
  if (number.includes(term)) return true;
  if (dealIds.has(quote.deal)) return true;
  if (quote.company && companyIds.has(quote.company)) return true;
  if (dealTitle?.toLowerCase().includes(term)) return true;
  if (companyName?.toLowerCase().includes(term)) return true;
  return false;
}

export function invoiceMatchesSearch(
  invoice: Doc<"invoices">,
  term: string,
  dealIds: Set<Id<"deals">>,
  companyIds: Set<Id<"companies">>,
  dealTitle?: string,
  companyName?: string,
): boolean {
  if (!term) return true;
  const number = invoice.number?.toLowerCase() ?? "";
  if (number.includes(term)) return true;
  if (invoice.deal && dealIds.has(invoice.deal)) return true;
  if (invoice.company && companyIds.has(invoice.company)) return true;
  if (dealTitle?.toLowerCase().includes(term)) return true;
  if (companyName?.toLowerCase().includes(term)) return true;
  return false;
}

export function canReadQuoteRow(
  quote: Doc<"quotes">,
  user: Doc<"users">,
  isAdmin: boolean,
  accessible: Id<"groups">[],
  accessibleDealIds: Set<Id<"deals">> | null,
) {
  if (!rowInAccessibleGroups(quote, accessible)) return false;
  if (isAdmin) return true;
  if (quote.createdBy === user._id) return true;
  if (accessibleDealIds?.has(quote.deal)) return true;
  return false;
}

export function canReadInvoiceRow(
  invoice: Doc<"invoices">,
  user: Doc<"users">,
  isAdmin: boolean,
  accessible: Id<"groups">[],
  accessibleDealIds: Set<Id<"deals">> | null,
) {
  if (!rowInAccessibleGroups(invoice, accessible)) return false;
  if (isAdmin) return true;
  if (invoice.createdBy === user._id) return true;
  if (invoice.deal && accessibleDealIds?.has(invoice.deal)) return true;
  return false;
}

export function quoteMatchesStatusFilter(
  quote: Doc<"quotes">,
  statusFilter: string | undefined,
) {
  if (!statusFilter || statusFilter === "all") return true;
  if (statusFilter === "invoiced") {
    return quote.status === "invoiced" || quote.invoiced === true;
  }
  return (quote.status ?? "draft") === statusFilter;
}

export function invoiceMatchesStatusFilter(
  invoice: Doc<"invoices">,
  statusFilter: string | undefined,
) {
  if (!statusFilter || statusFilter === "all") return true;
  return (invoice.status ?? "draft") === statusFilter;
}

export function productMatchesStatusFilter(
  product: Doc<"products">,
  statusFilter: string | undefined,
  isAdmin: boolean,
) {
  if (!statusFilter || statusFilter === "all") {
    if (isAdmin) return true;
    return product.status === "active";
  }
  return (product.status ?? "draft") === statusFilter;
}

export function productMatchesSearch(
  product: Doc<"products">,
  term: string,
) {
  if (!term) return true;
  const name = product.name.toLowerCase();
  const code = product.code?.toLowerCase() ?? "";
  return name.includes(term) || code.includes(term);
}

export function companyMatchesSearch(company: Doc<"companies">, term: string) {
  if (!term) return true;
  const name = company.name.toLowerCase();
  const email = company.email?.toLowerCase() ?? "";
  const phone = company.phoneNumber?.toLowerCase() ?? "";
  const taxNumber = company.taxNumber?.toLowerCase() ?? "";
  const nationalAddress = company.nationalAddress?.toLowerCase() ?? "";
  return (
    name.includes(term) ||
    email.includes(term) ||
    phone.includes(term) ||
    taxNumber.includes(term) ||
    nationalAddress.includes(term)
  );
}

export function voucherMatchesSearch(
  voucher: Doc<"receiptVouchers">,
  term: string,
  companyName?: string,
) {
  if (!term) return true;
  const number = voucher.number?.toLowerCase() ?? "";
  if (number.includes(term)) return true;
  if (companyName?.toLowerCase().includes(term)) return true;
  return false;
}

export function resolveGroupIdsForList(
  orgGroupId: Id<"groups"> | "all" | undefined,
  accessible: Id<"groups">[],
): Id<"groups">[] {
  if (orgGroupId && orgGroupId !== "all") return [orgGroupId];
  return accessible;
}

const FILTERED_CURSOR_PREFIX = "fc:";

type ParsedFilteredCursor = { dbCursor: string | null; skip: number };

function parseFilteredCursor(raw: string | null): ParsedFilteredCursor {
  if (!raw) return { dbCursor: null, skip: 0 };
  if (!raw.startsWith(FILTERED_CURSOR_PREFIX)) {
    return { dbCursor: raw, skip: 0 };
  }
  const body = raw.slice(FILTERED_CURSOR_PREFIX.length);
  const sep = body.indexOf("|");
  if (sep < 0) return { dbCursor: raw, skip: 0 };
  const skip = Number.parseInt(body.slice(0, sep), 10);
  const db = body.slice(sep + 1);
  return {
    dbCursor: db.length > 0 ? db : null,
    skip: Number.isFinite(skip) ? skip : 0,
  };
}

function encodeFilteredCursor(dbCursor: string | null, skip: number): string {
  if (!skip) return dbCursor ?? "";
  return `${FILTERED_CURSOR_PREFIX}${skip}|${dbCursor ?? ""}`;
}

/** Cursor pagination with an in-memory predicate (for search / visibility). */
export async function paginateWithPredicate<T extends { _id: string }>(
  fetchPage: (
    opts: PaginationOptions,
  ) => Promise<PaginationResult<T>>,
  paginationOpts: PaginationOptions,
  predicate: (row: T) => boolean,
  batchMultiplier = 8,
): Promise<PaginationResult<T>> {
  const target = paginationOpts.numItems;
  const parsed = parseFilteredCursor(paginationOpts.cursor);
  let dbCursor = parsed.dbCursor;
  let skip = parsed.skip;
  const page: T[] = [];

  while (page.length < target) {
    const batchStart = dbCursor;
    const batch = await fetchPage({
      ...paginationOpts,
      numItems: Math.max(target * batchMultiplier, 50),
      cursor: dbCursor,
    });

    const matched = batch.page.filter(predicate);

    let index = 0;
    while (index < matched.length && page.length < target) {
      if (skip > 0) {
        skip--;
        index++;
        continue;
      }
      page.push(matched[index]!);
      index++;
    }

    if (page.length >= target) {
      if (index < matched.length) {
        return {
          page,
          isDone: false,
          continueCursor: encodeFilteredCursor(batchStart, index),
        };
      }
      return {
        page,
        isDone: batch.isDone,
        continueCursor: batch.continueCursor,
      };
    }

    dbCursor = batch.continueCursor;
    skip = 0;

    if (batch.isDone) {
      return {
        page,
        isDone: true,
        continueCursor: batch.continueCursor,
      };
    }
  }

  return { page, isDone: true, continueCursor: "" };
}

export { orgGroupFilterValidator, filterByOrgGroup };
