import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { logAudit } from "./auditLog";
import {
  calculateFinancialDocument,
  withUnitPriceFromCatalog,
} from "./quoteFinance";
import {
  filterByOrgGroup,
  getAccessibleOrgGroupIds,
  getSettingsByGroup,
  orgGroupFilterValidator,
  resolveOrgGroupFilter,
  resolveOrgGroupForCreate,
} from "./orgGroupHelpers";
import {
  addReservationsForQuoteProductLines,
  canOversellQuotes,
  releaseReservationsForQuoteProductLines,
  toProductLineRefs,
} from "./inventoryReservations";
import {
  canReadQuoteRow,
  getListAuth,
  listSearchValidator,
  loadAccessibleDealIds,
  loadCompanyNameMap,
  loadDealTitleMap,
  normalizeSearch,
  paginateWithPredicate,
  quoteMatchesSearch,
  quoteMatchesStatusFilter,
  resolveCompanyIdsForSearch,
  resolveDealIdsForSearch,
  resolveGroupIdsForList,
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

  return user;
}

async function hasInvoiceForQuote(ctx: MutationCtx, quoteId: Id<"quotes">) {
  return (
    (await ctx.db
      .query("invoices")
      .withIndex("by_quote", (q) => q.eq("quote", quoteId))
      .first()) != null
  );
}

function displayNameForUser(u: Doc<"users"> | null | undefined): string {
  if (!u) return "—";
  const n = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (n.length > 0) return n;
  return (u.email as string) || "—";
}

// ─── قراءة عرض سعر (صلاحية quotes:read) ────────────────────────────────────

async function loadQuoteIfReadable(
  ctx: QueryCtx,
  id: Id<"quotes">,
): Promise<Doc<"quotes"> | null> {
  const currentUser = await requirePermission(ctx, "quotes:read");
  const quote = await ctx.db.get(id);
  if (!quote) return null;
  const role = await ctx.db.get(currentUser.role as Id<"roles">);
  if (role?.permissions.includes("admin:all")) return quote;
  if (quote.createdBy === currentUser._id) return quote;
  const deal = await ctx.db.get(quote.deal);
  if (!deal) return null;
  if (deal.owner === currentUser._id) return quote;
  if (currentUser.group && deal.group === currentUser.group) return quote;
  return null;
}

const quoteProductLineInput = v.object({
  product: v.id("products"),
  quantity: v.number(),
  price: v.number(),
  discount: v.optional(v.number()),
  taxes: v.optional(
    v.array(
      v.object({
        taxId: v.id("taxes"),
        rate: v.number(),
        name: v.optional(v.string()),
      }),
    ),
  ),
});

const quoteServiceLineInput = v.object({
  service: v.id("services"),
  duration: v.optional(v.number()),
  quantity: v.number(),
  price: v.number(),
  discount: v.optional(v.number()),
});

const quoteShippingTaxInput = v.array(
  v.object({
    taxId: v.id("taxes"),
    rate: v.number(),
    name: v.optional(v.string()),
  }),
);

const quotePaymentMethodValidator = v.union(
  v.literal("immediate"),
  v.literal("on_credit"),
);

// ============================================================================
// 2. POST (Create a new quote)
// ============================================================================

export const createQuote = mutation({
  args: {
    deal: v.id("deals"),
    number: v.optional(v.string()),
    description: v.optional(v.string()),
    issueDate: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    expirationDate: v.optional(v.number()),
    currency: v.optional(v.id("currencies")),
    paymentMethod: v.optional(quotePaymentMethodValidator),
    paymentTerms: v.optional(v.id("paymentTerms")),
    shippingTerms: v.optional(v.id("shippingTerms")),
    deliveryTerms: v.optional(v.id("deliveryTerms")),
    deliveryDate: v.optional(v.number()),

    // The arrays coming from the frontend (without totals)
    lineItems: v.optional(v.array(quoteProductLineInput)),
    services: v.optional(v.array(quoteServiceLineInput)),

    discount: v.optional(v.number()),
    shippingAmount: v.optional(v.number()),
    shippingTaxes: v.optional(quoteShippingTaxInput),
  },
  handler: async (ctx, args) => {
    const currentUser = await requirePermission(ctx, "quotes:create");

    const deal = await ctx.db.get(args.deal);
    if (!deal) throw new Error("Deal not found");
    const role = await ctx.db.get(currentUser.role as Id<"roles">);
    const isAdmin = role?.permissions.includes("admin:all") ?? false;
    const dealGroupId =
      deal.group ??
      (await resolveOrgGroupForCreate(ctx, currentUser, undefined, isAdmin));

    let quoteNumber = args.number?.trim() || "";
    if (!quoteNumber) {
      const settings = await getSettingsByGroup(ctx, dealGroupId);
      const mode = settings?.quoteNumberMode ?? "auto";
      if (mode === "auto") {
        quoteNumber = await ctx.runMutation(
          internal.settings.generateDocumentNumber,
          { type: "quote", groupId: dealGroupId },
        );
      }
    }

    const allCurrencies = await ctx.db.query("currencies").collect();
    const settingsDoc = await getSettingsByGroup(ctx, dealGroupId);
    const defaultCurrencyId =
      settingsDoc?.defaultCurrency ?? allCurrencies.find((c) => c.default)?._id;

    if ((args.lineItems?.length || args.services?.length) && !args.currency) {
      throw new Error(
        "Currency is required when the quote has products or services.",
      );
    }

    const normalizedLineItems: typeof args.lineItems = [];
    for (const li of args.lineItems ?? []) {
      const p = await ctx.db.get(li.product);
      if (!p) throw new Error("Product not found");
      normalizedLineItems.push(
        withUnitPriceFromCatalog(
          li,
          p.price ?? 0,
          args.currency!,
          defaultCurrencyId,
          allCurrencies,
        ),
      );
    }

    const normalizedServices: typeof args.services = [];
    for (const si of args.services ?? []) {
      const s = await ctx.db.get(si.service);
      if (!s) throw new Error("Service not found");
      normalizedServices.push(
        withUnitPriceFromCatalog(
          si,
          s.price ?? 0,
          args.currency!,
          defaultCurrencyId,
          allCurrencies,
        ),
      );
    }

    // 3. المحرك المالي (نفس نتيجة quoteFinance + financials)
    const shipTaxes = args.shippingTaxes ?? [];
    const financials = calculateFinancialDocument(
      normalizedLineItems,
      normalizedServices,
      args.discount,
      args.shippingAmount,
      shipTaxes,
    );

    const lineRefs = toProductLineRefs(normalizedLineItems);
    const allowOversell = await canOversellQuotes(ctx, currentUser._id);

    // 3b. حجز الكميات على المنتجات (نفس الـ transaction)
    await addReservationsForQuoteProductLines(ctx, lineRefs, allowOversell);

    // 4. حفظ المستند
    const quoteId = await ctx.db.insert("quotes", {
      deal: args.deal,
      company: deal.company,
      contact: deal.contact,
      group: dealGroupId,
      status: "draft",
      number: quoteNumber || undefined,
      description: args.description,
      issueDate: args.issueDate || Date.now(),
      dueDate: args.dueDate,
      expirationDate: args.expirationDate,
      currency: args.currency,
      paymentMethod: args.paymentMethod ?? "immediate",
      paymentTerms: args.paymentTerms,
      shippingTerms: args.shippingTerms,
      deliveryTerms: args.deliveryTerms,
      deliveryDate: args.deliveryDate,

      // The processed arrays (with taxAmount and subtotal for each line)
      lineItems: financials.processedLineItems,
      services: financials.processedServices,

      // The totals (100% accurate)
      subtotal: financials.subtotal,
      discount: args.discount || 0,
      shippingAmount: args.shippingAmount || 0,
      ...(shipTaxes.length > 0 && { shippingTaxes: shipTaxes }),

      taxAmount: financials.taxAmount,
      total: financials.total,

      revision: 0,
      createdBy: currentUser._id,
      updatedAt: Date.now(),
    });

    await logAudit(ctx, {
      entityId: quoteId,
      entityType: "quote",
      action: "CREATED",
      changes: {
        number: quoteNumber || null,
        deal: args.deal,
        status: "draft",
        revision: 0,
        total: financials.total,
      },
      performedBy: currentUser._id,
    });

    return quoteId;
  },
});

// ============================================================================
// 3. PUT (Update the quote status or data)
// ============================================================================

export const updateQuote = mutation({
  args: {
    id: v.id("quotes"),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("sent"),
        v.literal("accepted"),
        v.literal("rejected"),
        v.literal("expired"),
      ),
    ),
    description: v.optional(v.string()),
    expirationDate: v.optional(v.number()),
    paymentMethod: v.optional(quotePaymentMethodValidator),
    /** تعديل كامل: بنود، عملة، خصم، شحن (من شاشة التفصيل) */
    financialUpdate: v.optional(
      v.object({
        lineItems: v.array(quoteProductLineInput),
        services: v.optional(v.array(quoteServiceLineInput)),
        currency: v.id("currencies"),
        issueDate: v.optional(v.number()),
        dueDate: v.optional(v.number()),
        discount: v.optional(v.number()),
        shippingAmount: v.optional(v.number()),
        shippingTaxes: v.optional(quoteShippingTaxInput),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const currentUser = await requirePermission(ctx, "quotes:update");

    const quote = await ctx.db.get(args.id);
    if (!quote) throw new Error("Quote not found");

    if (quote.invoiced === true || (await hasInvoiceForQuote(ctx, args.id))) {
      throw new Error(
        "Cannot modify this quote: an invoice has already been issued against it.",
      );
    }

    const nextStatus = args.status !== undefined ? args.status : quote.status;
    const wasTerminal =
      quote.status === "rejected" || quote.status === "expired";
    const toTerminal = nextStatus === "rejected" || nextStatus === "expired";

    const allCurrencies = await ctx.db.query("currencies").collect();
    const settingsDoc = await getSettingsByGroup(ctx, quote.group ?? undefined);
    const defaultCurrencyId =
      settingsDoc?.defaultCurrency ?? allCurrencies.find((c) => c.default)?._id;
    const allowOversell = await canOversellQuotes(ctx, currentUser._id);

    const fin = args.financialUpdate;
    const hasFinancial = fin != null;

    if (hasFinancial) {
      const nLines = fin.lineItems?.length ?? 0;
      const nServices =
        fin.services != null
          ? fin.services.length
          : (quote.services?.length ?? 0);
      if ((nLines > 0 || nServices > 0) && !fin.currency) {
        throw new Error(
          "Currency is required when the quote has products or services.",
        );
      }

      await releaseReservationsForQuoteProductLines(
        ctx,
        toProductLineRefs(
          quote.lineItems?.map((l) => ({
            product: l.product,
            quantity: l.quantity,
          })),
        ),
      );

      const serviceArgs =
        fin.services != null
          ? fin.services
          : (quote.services?.map((s) => ({
              service: s.service,
              duration: s.duration,
              quantity: s.quantity,
              price: s.price,
              discount: s.discount,
            })) ?? []);

      const normalizedLineItems: (typeof fin.lineItems)[number][] = [];
      for (const li of fin.lineItems) {
        const p = await ctx.db.get(li.product);
        if (!p) throw new Error("Product not found");
        normalizedLineItems.push(
          withUnitPriceFromCatalog(
            li,
            p.price ?? 0,
            fin.currency,
            defaultCurrencyId,
            allCurrencies,
          ),
        );
      }
      const normalizedServices: Parameters<
        typeof calculateFinancialDocument
      >[1] = [];
      for (const si of serviceArgs) {
        const s = await ctx.db.get(si.service);
        if (!s) throw new Error("Service not found");
        normalizedServices.push(
          withUnitPriceFromCatalog(
            si,
            s.price ?? 0,
            fin.currency,
            defaultCurrencyId,
            allCurrencies,
          ) as NonNullable<
            Parameters<typeof calculateFinancialDocument>[1]
          >[number],
        );
      }

      const disc = fin.discount ?? 0;
      const ship = fin.shippingAmount ?? 0;
      const shipTaxes = fin.shippingTaxes ?? [];
      const financials = calculateFinancialDocument(
        normalizedLineItems,
        normalizedServices,
        disc,
        ship,
        shipTaxes,
      );

      const newLineRefs = toProductLineRefs(normalizedLineItems);
      if (!toTerminal) {
        await addReservationsForQuoteProductLines(
          ctx,
          newLineRefs,
          allowOversell,
        );
      }

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (args.status !== undefined && args.status !== quote.status) {
        changes.status = { from: quote.status ?? null, to: args.status };
      }
      if (
        args.description !== undefined &&
        args.description !== quote.description
      ) {
        changes.description = {
          from: quote.description ?? null,
          to: args.description,
        };
      }
      if (
        args.expirationDate !== undefined &&
        args.expirationDate !== quote.expirationDate
      ) {
        changes.expirationDate = {
          from: quote.expirationDate ?? null,
          to: args.expirationDate,
        };
      }
      changes.lineItems = {
        from: (quote.lineItems?.length ?? 0) as unknown,
        to: (financials.processedLineItems?.length ?? 0) as unknown,
      };
      changes.subtotal = {
        from: quote.subtotal ?? null,
        to: financials.subtotal,
      };
      changes.total = { from: quote.total ?? null, to: financials.total };

      const hasChange = true;
      const bumpRev =
        (quote.status === "sent" || quote.status === "accepted") && hasChange;
      const nextRevision = bumpRev
        ? (quote.revision ?? 0) + 1
        : (quote.revision ?? 0);
      if (bumpRev) {
        changes.revision = { from: quote.revision ?? 0, to: nextRevision };
      }

      const issueTime =
        fin.issueDate !== undefined ? fin.issueDate : quote.issueDate;
      const dueTime = fin.dueDate !== undefined ? fin.dueDate : quote.dueDate;

      await ctx.db.patch(args.id, {
        lineItems: financials.processedLineItems,
        services: financials.processedServices,
        subtotal: financials.subtotal,
        discount: disc,
        shippingAmount: ship,
        shippingTaxes: shipTaxes,
        taxAmount: financials.taxAmount,
        total: financials.total,
        currency: fin.currency,
        ...(issueTime !== undefined && { issueDate: issueTime }),
        ...(dueTime !== undefined && { dueDate: dueTime }),
        ...(args.status !== undefined && { status: args.status }),
        ...(args.description !== undefined && {
          description: args.description,
        }),
        ...(args.expirationDate !== undefined && {
          expirationDate: args.expirationDate,
        }),
        ...(args.paymentMethod !== undefined && {
          paymentMethod: args.paymentMethod,
        }),
        ...(bumpRev && { revision: nextRevision }),
        updatedBy: currentUser._id,
        updatedAt: Date.now(),
      });

      if (nextStatus === "sent" && quote.status !== "sent") {
        const d = await ctx.db.get(quote.deal);
        if (d) {
          const s = d.stage;
          if (
            s !== "won" &&
            s !== "lost" &&
            (s === "lead" || s === undefined)
          ) {
            await ctx.db.patch(quote.deal, {
              stage: "contacted",
              updatedBy: currentUser._id,
              updatedAt: Date.now(),
            });
          }
        }
      }

      await logAudit(ctx, {
        entityId: args.id,
        entityType: "quote",
        action: "UPDATED",
        changes,
        performedBy: currentUser._id,
      });

      return { success: true };
    }

    // بلا financialUpdate: حالة/وصف/انتهاء فقط (مثل تغيير الحالة من الجدول)
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (args.status !== undefined && args.status !== quote.status) {
      changes.status = { from: quote.status ?? null, to: args.status };
    }
    if (
      args.description !== undefined &&
      args.description !== quote.description
    ) {
      changes.description = {
        from: quote.description ?? null,
        to: args.description,
      };
    }
    if (
      args.expirationDate !== undefined &&
      args.expirationDate !== quote.expirationDate
    ) {
      changes.expirationDate = {
        from: quote.expirationDate ?? null,
        to: args.expirationDate,
      };
    }
    if (
      args.paymentMethod !== undefined &&
      args.paymentMethod !== quote.paymentMethod
    ) {
      changes.paymentMethod = {
        from: quote.paymentMethod ?? "immediate",
        to: args.paymentMethod,
      };
    }

    const hasChange = Object.keys(changes).length > 0;
    if (!hasChange) {
      return { success: true, skipped: true as const };
    }

    const toTerminalNoFin =
      args.status === "rejected" || args.status === "expired";
    if (toTerminalNoFin && !wasTerminal) {
      await releaseReservationsForQuoteProductLines(
        ctx,
        toProductLineRefs(
          quote.lineItems?.map((l) => ({
            product: l.product,
            quantity: l.quantity,
          })),
        ),
      );
    }

    const bumpRev =
      (quote.status === "sent" || quote.status === "accepted") && hasChange;
    const nextRevision = bumpRev
      ? (quote.revision ?? 0) + 1
      : (quote.revision ?? 0);
    if (bumpRev) {
      changes.revision = { from: quote.revision ?? 0, to: nextRevision };
    }

    await ctx.db.patch(args.id, {
      ...(args.status !== undefined && { status: args.status }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.expirationDate !== undefined && {
        expirationDate: args.expirationDate,
      }),
      ...(args.paymentMethod !== undefined && {
        paymentMethod: args.paymentMethod,
      }),
      ...(bumpRev && { revision: nextRevision }),
      updatedBy: currentUser._id,
      updatedAt: Date.now(),
    });

    if (nextStatus === "sent" && quote.status !== "sent") {
      const d = await ctx.db.get(quote.deal);
      if (d) {
        const s = d.stage;
        if (s !== "won" && s !== "lost" && (s === "lead" || s === undefined)) {
          await ctx.db.patch(quote.deal, {
            stage: "contacted",
            updatedBy: currentUser._id,
            updatedAt: Date.now(),
          });
        }
      }
    }

    await logAudit(ctx, {
      entityId: args.id,
      entityType: "quote",
      action: "UPDATED",
      changes,
      performedBy: currentUser._id,
    });

    return { success: true };
  },
});

// ============================================================================
// 4. GET (Get quotes by permissions and visibility)
// ============================================================================

/**
 * Get quotes list (Get Quotes List)
 * @description Applies visibility rules: The admin sees all, the employee sees the ones linked to their deals or their group's deals.
 */
export const getQuotes = query({
  args: {
    dealId: v.optional(v.id("deals")),
    orgGroupId: orgGroupFilterValidator,
  },
  handler: async (ctx, args) => {
    const currentUser = await requirePermission(ctx, "quotes:read");

    const role = await ctx.db.get(currentUser.role as Id<"roles">);
    const isAdmin = role?.permissions.includes("admin:all") ?? false;
    const accessible = await getAccessibleOrgGroupIds(
      ctx,
      currentUser,
      isAdmin,
    );
    const filter = resolveOrgGroupFilter(args.orgGroupId, accessible, isAdmin);

    let rows;
    if (args.dealId) {
      rows = await ctx.db
        .query("quotes")
        .withIndex("by_deal", (q) => q.eq("deal", args.dealId!))
        .order("desc")
        .collect();
    } else if (isAdmin) {
      rows = await ctx.db.query("quotes").order("desc").collect();
    } else {
      const myCreatedQuotes = await ctx.db
        .query("quotes")
        .withIndex("by_createdBy", (q) => q.eq("createdBy", currentUser._id))
        .collect();

      const groupDeals = await Promise.all(
        accessible.map((groupId) =>
          ctx.db
            .query("deals")
            .withIndex("by_group", (q) => q.eq("group", groupId))
            .collect(),
        ),
      );

      const quotesPromises = groupDeals.flat().map((deal) =>
        ctx.db
          .query("quotes")
          .withIndex("by_deal", (q) => q.eq("deal", deal._id))
          .collect(),
      );
      const myGroupQuotes = (await Promise.all(quotesPromises)).flat();

      const allAccessible = [...myCreatedQuotes, ...myGroupQuotes];
      rows = Array.from(
        new Map(allAccessible.map((item) => [item._id, item])).values(),
      );
      rows.sort((a, b) => b._creationTime - a._creationTime);
    }

    return filterByOrgGroup(rows, filter, accessible);
  },
});

export const listQuotesPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    orgGroupId: orgGroupFilterValidator,
    statusFilter: v.optional(v.string()),
    search: listSearchValidator,
  },
  handler: async (ctx, args) => {
    const { user, isAdmin, accessible } = await getListAuth(ctx, "quotes:read");
    const term = normalizeSearch(args.search);
    const groupIds = resolveGroupIdsForList(args.orgGroupId, accessible);
    const accessibleDealIds = await loadAccessibleDealIds(
      ctx,
      user,
      isAdmin,
      accessible,
    );
    const dealIds = await resolveDealIdsForSearch(ctx, term, groupIds);
    const companyIds = await resolveCompanyIdsForSearch(ctx, term, groupIds);
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
        statusFilter !== "all" &&
        statusFilter !== "invoiced"
      ) {
        return ctx.db
          .query("quotes")
          .withIndex("by_group_status", (q) =>
            q
              .eq("group", groupIds[0])
              .eq(
                "status",
                statusFilter as NonNullable<Doc<"quotes">["status"]>,
              ),
          )
          .order("desc")
          .paginate(opts);
      }
      if (groupIds.length === 1) {
        return ctx.db
          .query("quotes")
          .withIndex("by_group", (q) => q.eq("group", groupIds[0]))
          .order("desc")
          .paginate(opts);
      }
      return ctx.db.query("quotes").order("desc").paginate(opts);
    };

    const result = await paginateWithPredicate(
      buildFetch,
      args.paginationOpts,
      (quote) => {
        if (
          !canReadQuoteRow(quote, user, isAdmin, accessible, accessibleDealIds)
        ) {
          return false;
        }
        if (orgFilter !== "all" && orgFilter && quote.group !== orgFilter) {
          return false;
        }
        if (!quoteMatchesStatusFilter(quote, statusFilter)) return false;
        return quoteMatchesSearch(quote, term, dealIds, companyIds);
      },
    );

    const dealTitleMap = await loadDealTitleMap(
      ctx,
      result.page.map((q) => q.deal),
    );
    const companyTitleMap = await loadCompanyNameMap(
      ctx,
      result.page.map((q) => q.company),
    );

    return {
      ...result,
      page: result.page.map((quote) => ({
        ...quote,
        dealTitle: dealTitleMap.get(quote.deal) ?? "—",
        companyName: quote.company
          ? (companyTitleMap.get(quote.company) ?? null)
          : null,
      })),
    };
  },
});

export const getQuoteListStats = query({
  args: { orgGroupId: orgGroupFilterValidator },
  handler: async (ctx, args) => {
    const { user, isAdmin, accessible } = await getListAuth(ctx, "quotes:read");
    const accessibleDealIds = await loadAccessibleDealIds(
      ctx,
      user,
      isAdmin,
      accessible,
    );
    const orgFilter = resolveOrgGroupFilter(
      args.orgGroupId,
      accessible,
      isAdmin,
    );
    const groupIds = resolveGroupIdsForList(args.orgGroupId, accessible);

    let rows: Doc<"quotes">[];
    if (groupIds.length === 1) {
      rows = await ctx.db
        .query("quotes")
        .withIndex("by_group", (q) => q.eq("group", groupIds[0]))
        .collect();
    } else if (isAdmin) {
      rows = await ctx.db.query("quotes").collect();
    } else {
      const myCreated = await ctx.db
        .query("quotes")
        .withIndex("by_createdBy", (q) => q.eq("createdBy", user._id))
        .collect();
      const fromDeals: Doc<"quotes">[] = [];
      if (accessibleDealIds) {
        for (const dealId of accessibleDealIds) {
          const qs = await ctx.db
            .query("quotes")
            .withIndex("by_deal", (q) => q.eq("deal", dealId))
            .collect();
          fromDeals.push(...qs);
        }
      }
      rows = Array.from(
        new Map(
          [...myCreated, ...fromDeals].map((item) => [item._id, item]),
        ).values(),
      );
    }

    rows = rows.filter((q) =>
      canReadQuoteRow(q, user, isAdmin, accessible, accessibleDealIds),
    );
    if (orgFilter !== "all" && orgFilter) {
      rows = rows.filter((q) => q.group === orgFilter);
    }

    return {
      total: rows.length,
      draft: rows.filter((q) => q.status === "draft").length,
      sent: rows.filter((q) => q.status === "sent").length,
      accepted: rows.filter((q) => q.status === "accepted").length,
      invoiced: rows.filter(
        (q) => q.status === "invoiced" || q.invoiced === true,
      ).length,
    };
  },
});

/** عرض سعر واحد — نفس قواعد الرؤية */
export const getQuoteById = query({
  args: { id: v.id("quotes") },
  handler: async (ctx, args) => {
    return await loadQuoteIfReadable(ctx, args.id);
  },
});

/** عرض سعر + هل يوجد فاتورة (للشاشة التفصيلية — بدون سجل التدقيق) */
export const getQuoteWithDetails = query({
  args: { id: v.id("quotes") },
  handler: async (ctx, args) => {
    const quote = await loadQuoteIfReadable(ctx, args.id);
    if (!quote) return null;
    const hasInvoice =
      quote.invoiced === true ||
      (await ctx.db
        .query("invoices")
        .withIndex("by_quote", (q) => q.eq("quote", args.id))
        .first()) != null;
    return { quote, hasInvoice };
  },
});

/** سجل تدقيق عرض سعر: أسماء المستخدمين + ميتا المستند */
export const getQuoteAuditLog = query({
  args: { id: v.id("quotes") },
  handler: async (ctx, args) => {
    const quote = await loadQuoteIfReadable(ctx, args.id);
    if (!quote) return null;

    const creator = await ctx.db.get(quote.createdBy);
    const lastEditor = quote.updatedBy
      ? await ctx.db.get(quote.updatedBy)
      : null;

    const raw = await ctx.db
      .query("auditLogs")
      .withIndex("by_entity", (q) => q.eq("entityId", args.id as string))
      .collect();
    const filtered = raw.filter(
      (row) =>
        row.entityType === "quote" && row.entityId === (args.id as string),
    );
    const rows = filtered.sort((a, b) => b.timestamp - a.timestamp);

    const nameCache = new Map<string, string>();
    const nameFor = async (userId: Id<"users">) => {
      const key = userId;
      if (nameCache.has(key)) return nameCache.get(key)!;
      const u = await ctx.db.get(userId);
      const n = displayNameForUser(u);
      nameCache.set(key, n);
      return n;
    };

    const entries = await Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        action: row.action,
        timestamp: row.timestamp,
        changes: row.changes,
        performedById: row.performedBy,
        performedByName: await nameFor(row.performedBy),
      })),
    );

    return {
      quoteNumber: quote.number,
      revision: quote.revision,
      documentCreatedByName: displayNameForUser(creator),
      documentLastUpdatedByName: lastEditor
        ? displayNameForUser(lastEditor)
        : null,
      documentCreatedAt: quote._creationTime,
      documentUpdatedAt: quote.updatedAt ?? null,
      entries,
    };
  },
});

/** Full quote data for PDF printing */
export const getQuoteForPrint = query({
  args: { id: v.id("quotes") },
  handler: async (ctx, args) => {
    const quote = await loadQuoteIfReadable(ctx, args.id);
    if (!quote) return null;

    const company = quote.company ? await ctx.db.get(quote.company) : null;
    const contact = await ctx.db.get(quote.contact);
    const group = quote.group ? await ctx.db.get(quote.group) : null;
    const currency = quote.currency ? await ctx.db.get(quote.currency) : null;
    const deal = await ctx.db.get(quote.deal);

    // Product names
    const productMap = new Map<string, string>();
    for (const item of quote.lineItems ?? []) {
      if (!productMap.has(item.product)) {
        const p = await ctx.db.get(item.product);
        if (p) productMap.set(item.product, p.name);
      }
    }
    // Service names
    const serviceMap = new Map<string, string>();
    for (const item of quote.services ?? []) {
      if (!serviceMap.has(item.service)) {
        const s = await ctx.db.get(item.service);
        if (s) serviceMap.set(item.service, s.name);
      }
    }
    // Terms
    const paymentTerms = quote.paymentTerms
      ? await ctx.db.get(quote.paymentTerms)
      : null;
    const shippingTerms = quote.shippingTerms
      ? await ctx.db.get(quote.shippingTerms)
      : null;
    const deliveryTerms = quote.deliveryTerms
      ? await ctx.db.get(quote.deliveryTerms)
      : null;

    return {
      quote,
      company: company
        ? {
            name: company.name,
            address: company.address,
            city: company.city,
            country: company.country,
            phone: company.phoneNumber,
            email: company.email,
          }
        : null,
      contact: contact
        ? {
            name:
              [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
              contact.email ||
              "—",
            email: contact.email,
            phone: contact.phoneNumber,
            jobTitle: contact.jobTitle,
          }
        : null,
      group: group ? { name: group.name } : null,
      currency: currency
        ? { symbol: currency.symbol, name: currency.name }
        : null,
      dealTitle: deal?.title ?? null,
      lineItems: (quote.lineItems ?? []).map((item, i) => ({
        index: i + 1,
        name: productMap.get(item.product) ?? "—",
        quantity: item.quantity,
        price: item.price,
        discount: item.discount ?? 0,
        priceAfterDiscount: item.priceAfterDiscount ?? item.price,
        subtotal: item.subtotal ?? 0,
        taxes: item.taxes ?? [],
        taxAmount: item.taxAmount ?? 0,
        total: item.totalAfterTax ?? 0,
      })),
      services: (quote.services ?? []).map((item, i) => ({
        index: (quote.lineItems?.length ?? 0) + i + 1,
        name: serviceMap.get(item.service) ?? "—",
        quantity: item.quantity,
        price: item.price,
        discount: item.discount ?? 0,
        priceAfterDiscount: item.priceAfterDiscount ?? item.price,
        subtotal: item.subtotal ?? 0,
        taxes: item.taxes ?? [],
        taxAmount: item.taxAmount ?? 0,
        total: item.totalAfterTax ?? 0,
      })),
      paymentTermsName: paymentTerms?.name ?? null,
      shippingTermsName: shippingTerms?.name ?? null,
      deliveryTermsName: deliveryTerms?.name ?? null,
    };
  },
});
