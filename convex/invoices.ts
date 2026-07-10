import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import {
  reconcileInvoiceCreditAfterPayment,
  releaseCreditForInvoice,
  reserveCreditForInvoice,
} from "./companyCredit";
import { logAudit } from "./auditLog";
import { calculateFinancialDocument } from "./financials";
import {
  filterByOrgGroup,
  getAccessibleOrgGroupIds,
  getDefaultCurrencyIdForGroup,
  getSettingsByGroup,
  orgGroupFilterValidator,
  resolveOrgGroupFilter,
} from "./orgGroupHelpers";
import {
  fulfillQuoteLinesOnInvoice,
  toProductLineRefs,
} from "./inventoryReservations";
import {
  canReadInvoiceRow,
  getListAuth,
  listSearchValidator,
  loadAccessibleDealIds,
  loadCompanyNameMap,
  loadDealTitleMap,
  normalizeSearch,
  paginateWithPredicate,
  invoiceMatchesSearch,
  invoiceMatchesStatusFilter,
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
  const has = role?.permissions.includes(permissionName);
  const isAdmin = role?.permissions.includes("admin:all");
  if (!role || (!has && !isAdmin)) {
    throw new Error(`Forbidden: Missing permission [${permissionName}]`);
  }

  return user;
}

async function loadInvoiceIfReadable(ctx: QueryCtx, id: Id<"invoices">) {
  const currentUser = await requirePermission(ctx, "invoices:read");
  const invoice = await ctx.db.get(id);
  if (!invoice) return null;
  const role = await ctx.db.get(currentUser.role as Id<"roles">);
  if (role?.permissions.includes("admin:all")) return invoice;
  if (invoice.createdBy === currentUser._id) return invoice;
  if (!invoice.deal) return null;
  const deal = await ctx.db.get(invoice.deal);
  if (!deal) return null;
  if (deal.owner === currentUser._id) return invoice;
  if (currentUser.group && deal.group === currentUser.group) return invoice;
  return null;
}

// ============================================================================
// 2. POST (Create a new invoice - usually converted from a quote)
// ============================================================================

export const createInvoice = mutation({
  args: {
    quote: v.id("quotes"), // The invoice in your schema requires a link to a quote
    deal: v.optional(v.id("deals")),
    number: v.optional(v.string()),
    description: v.optional(v.string()),
    issueDate: v.optional(v.number()),
    dueDate: v.optional(v.number()), // Due date
    currency: v.optional(v.id("currencies")),
    paymentTerms: v.optional(v.id("paymentTerms")),

    // We receive the raw arrays from the frontend to be calculated programmatically
    lineItems: v.optional(
      v.array(
        v.object({
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
        }),
      ),
    ),
    services: v.optional(
      v.array(
        v.object({
          service: v.id("services"),
          duration: v.optional(v.number()),
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
        }),
      ),
    ),

    discount: v.optional(v.number()),
    shippingAmount: v.optional(v.number()),
    shippingTaxes: v.optional(
      v.array(
        v.object({
          taxId: v.id("taxes"),
          rate: v.number(),
          name: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    // 1. Check the permissions
    const currentUser = await requirePermission(ctx, "invoices:create");

    // 2. Get the main quote to pull the client and company data
    const quote = await ctx.db.get(args.quote);
    if (!quote) throw new Error("Quote not found");

    if (quote.status === "rejected" || quote.status === "expired") {
      throw new Error(
        "Cannot create an invoice from a rejected or expired quote.",
      );
    }
    if (quote.status === "invoiced" || quote.invoiced === true) {
      throw new Error("This quote is already invoiced.");
    }

    const existingInvoice = await ctx.db
      .query("invoices")
      .withIndex("by_quote", (q) => q.eq("quote", args.quote))
      .first();
    if (existingInvoice) {
      throw new Error("An invoice for this quote already exists.");
    }

    const lineItemsInput =
      args.lineItems && args.lineItems.length > 0
        ? args.lineItems
        : (quote.lineItems?.map((li) => ({
            product: li.product,
            quantity: li.quantity,
            price: li.price,
            discount: li.discount,
            taxes: li.taxes,
          })) ?? []);

    const servicesInput =
      args.services && args.services.length > 0
        ? args.services
        : (quote.services?.map((si) => ({
            service: si.service,
            duration: si.duration,
            quantity: si.quantity,
            price: si.price,
            discount: si.discount,
            taxes: si.taxes,
          })) ?? []);

    const discountVal =
      args.discount !== undefined ? args.discount : (quote.discount ?? 0);
    const shippingVal =
      args.shippingAmount !== undefined
        ? args.shippingAmount
        : (quote.shippingAmount ?? 0);

    const shippingTaxesResolved =
      args.shippingTaxes !== undefined
        ? args.shippingTaxes
        : (quote.shippingTaxes ?? []);

    // 3. Pass the data to the financial engine to ensure accurate totals and tax distribution
    const financials = calculateFinancialDocument(
      lineItemsInput,
      servicesInput,
      discountVal,
      shippingVal,
      shippingTaxesResolved,
    );

    const dealDoc =
      args.deal || quote.deal
        ? await ctx.db.get(args.deal || quote.deal!)
        : null;
    const invoiceGroupId = quote.group ?? dealDoc?.group;

    let invoiceNumber = args.number?.trim() ?? "";
    if (!invoiceNumber) {
      const settings = await getSettingsByGroup(ctx, invoiceGroupId);
      const mode = settings?.invoiceNumberMode ?? "auto";
      if (mode === "auto" && invoiceGroupId) {
        invoiceNumber = await ctx.runMutation(
          internal.settings.generateDocumentNumber,
          { type: "invoice", groupId: invoiceGroupId },
        );
      }
    }
    if (!invoiceNumber) {
      invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    }

    const isOnCredit = quote.paymentMethod === "on_credit";

    if (isOnCredit) {
      if (!quote.company) {
        throw new Error(
          "On-credit invoices require a client company on the quote.",
        );
      }
      const company = await ctx.db.get(quote.company);
      if (!company || (company.creditLimit ?? 0) <= 0) {
        throw new Error(
          "This client has no credit limit. Configure credit terms on the company profile first.",
        );
      }
    }

    // 4. Save in the database

    const invoiceId = await ctx.db.insert("invoices", {
      quote: args.quote,
      deal: args.deal || quote.deal,
      company: quote.company,
      contact: quote.contact,
      group: quote.group ?? dealDoc?.group,
      status: isOnCredit ? "sent" : "draft",
      number: invoiceNumber,
      description: args.description,
      issueDate: args.issueDate ?? quote.issueDate ?? Date.now(),
      dueDate: args.dueDate ?? quote.dueDate,
      currency: args.currency ?? quote.currency,
      paymentTerms: args.paymentTerms ?? quote.paymentTerms,
      shippingTerms: quote.shippingTerms,
      deliveryTerms: quote.deliveryTerms,
      deliveryDate: quote.deliveryDate,

      // The arrays after the precise calculation
      lineItems: financials.processedLineItems,
      services: financials.processedServices,

      // The final totals
      subtotal: financials.subtotal,
      discount: discountVal,
      shippingAmount: shippingVal,
      taxAmount: financials.taxAmount,
      total: financials.total,

      createdBy: currentUser._id,
      updatedAt: Date.now(),
    });

    if (isOnCredit) {
      await reserveCreditForInvoice(ctx, invoiceId, currentUser._id);
    }

    await ctx.db.patch(args.quote, {
      status: "invoiced",
      invoiced: true,
      updatedBy: currentUser._id,
      updatedAt: Date.now(),
    });

    await logAudit(ctx, {
      entityId: args.quote as string,
      entityType: "quote",
      action: "UPDATED",
      changes: {
        status: { from: quote.status ?? null, to: "invoiced" as const },
        invoiced: { from: quote.invoiced ?? false, to: true },
        invoiceId: { from: null, to: String(invoiceId) },
        invoiceNumber: { from: null, to: invoiceNumber },
      },
      performedBy: currentUser._id,
    });

    // 5. Reduce inventory and cancel the reservation associated with the product lines
    const productLines = args.lineItems?.length
      ? args.lineItems
      : (quote.lineItems as typeof args.lineItems);
    await fulfillQuoteLinesOnInvoice(
      ctx,
      toProductLineRefs(
        productLines?.map((l) => ({
          product: l.product,
          quantity: l.quantity,
        })),
      ),
      currentUser._id,
    );

    return invoiceId;
  },
});

// ============================================================================
// 3. PUT (Update the invoice status - for collection)
// ============================================================================

export const updateInvoiceStatus = mutation({
  args: {
    id: v.id("invoices"),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("overdue"),
      v.literal("void"),
    ),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await requirePermission(ctx, "invoices:update");

    const invoice = await ctx.db.get(args.id);
    if (!invoice) throw new Error("Invoice not found");

    if (invoice.status === "paid" || invoice.status === "partially_paid") {
      throw new Error(
        "Paid status is managed automatically from receipt vouchers.",
      );
    }

    const prevStatus = invoice.status;

    await ctx.db.patch(args.id, {
      status: args.status,
      ...(args.description !== undefined && { description: args.description }),
      updatedBy: currentUser._id,
      updatedAt: Date.now(),
    });

    if (args.status === "sent" && prevStatus === "draft" && invoice.company) {
      await reserveCreditForInvoice(ctx, args.id, currentUser._id);
    }

    if (args.status === "void" && prevStatus !== "void") {
      await releaseCreditForInvoice(
        ctx,
        args.id,
        currentUser._id,
        "invoice_void",
      );
    }

    return { success: true };
  },
});

// ============================================================================
// 4. GET (Get the invoices with visibility protection)
// ============================================================================

export const getInvoices = query({
  args: {
    dealId: v.optional(v.id("deals")),
    companyId: v.optional(v.id("companies")),
    orgGroupId: orgGroupFilterValidator,
  },
  handler: async (ctx, args) => {
    const currentUser = await requirePermission(ctx, "invoices:read");

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
        .query("invoices")
        .withIndex("by_deal", (q) => q.eq("deal", args.dealId!))
        .order("desc")
        .collect();
    } else if (args.companyId) {
      rows = await ctx.db
        .query("invoices")
        .withIndex("by_company", (q) => q.eq("company", args.companyId!))
        .order("desc")
        .collect();
    } else if (isAdmin) {
      rows = await ctx.db.query("invoices").order("desc").collect();
    } else {
      const myCreatedInvoices = await ctx.db
        .query("invoices")
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

      const invoicesPromises = groupDeals.flat().map((deal) =>
        ctx.db
          .query("invoices")
          .withIndex("by_deal", (q) => q.eq("deal", deal._id))
          .collect(),
      );
      const myGroupInvoices = (await Promise.all(invoicesPromises)).flat();

      const allAccessible = [...myCreatedInvoices, ...myGroupInvoices];
      rows = Array.from(
        new Map(allAccessible.map((item) => [item._id, item])).values(),
      );
      rows.sort((a, b) => b._creationTime - a._creationTime);
    }

    return filterByOrgGroup(rows, filter, accessible);
  },
});

export const listInvoicesPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    orgGroupId: orgGroupFilterValidator,
    statusFilter: v.optional(v.string()),
    search: listSearchValidator,
  },
  handler: async (ctx, args) => {
    const { user, isAdmin, accessible } = await getListAuth(
      ctx,
      "invoices:read",
    );
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
      if (groupIds.length === 1 && statusFilter && statusFilter !== "all") {
        return ctx.db
          .query("invoices")
          .withIndex("by_group_status", (q) =>
            q
              .eq("group", groupIds[0])
              .eq(
                "status",
                statusFilter as NonNullable<Doc<"invoices">["status"]>,
              ),
          )
          .order("desc")
          .paginate(opts);
      }
      if (groupIds.length === 1) {
        return ctx.db
          .query("invoices")
          .withIndex("by_group", (q) => q.eq("group", groupIds[0]))
          .order("desc")
          .paginate(opts);
      }
      return ctx.db.query("invoices").order("desc").paginate(opts);
    };

    const result = await paginateWithPredicate(
      buildFetch,
      args.paginationOpts,
      (invoice) => {
        if (
          !canReadInvoiceRow(
            invoice,
            user,
            isAdmin,
            accessible,
            accessibleDealIds,
          )
        ) {
          return false;
        }
        if (orgFilter !== "all" && orgFilter && invoice.group !== orgFilter) {
          return false;
        }
        if (!invoiceMatchesStatusFilter(invoice, statusFilter)) return false;
        return invoiceMatchesSearch(invoice, term, dealIds, companyIds);
      },
    );

    const dealTitleMap = await loadDealTitleMap(
      ctx,
      result.page.map((i) => i.deal).filter((id): id is Id<"deals"> => !!id),
    );
    const companyTitleMap = await loadCompanyNameMap(
      ctx,
      result.page.map((i) => i.company),
    );

    return {
      ...result,
      page: result.page.map((invoice) => ({
        ...invoice,
        dealTitle: invoice.deal ? (dealTitleMap.get(invoice.deal) ?? "—") : "—",
        companyName: invoice.company
          ? (companyTitleMap.get(invoice.company) ?? null)
          : null,
      })),
    };
  },
});

export const getInvoiceListStats = query({
  args: { orgGroupId: orgGroupFilterValidator },
  handler: async (ctx, args) => {
    const { user, isAdmin, accessible } = await getListAuth(
      ctx,
      "invoices:read",
    );
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

    let rows: Doc<"invoices">[];
    if (groupIds.length === 1) {
      rows = await ctx.db
        .query("invoices")
        .withIndex("by_group", (q) => q.eq("group", groupIds[0]))
        .collect();
    } else if (isAdmin) {
      rows = await ctx.db.query("invoices").collect();
    } else {
      const myCreated = await ctx.db
        .query("invoices")
        .withIndex("by_createdBy", (q) => q.eq("createdBy", user._id))
        .collect();
      const fromDeals: Doc<"invoices">[] = [];
      if (accessibleDealIds) {
        for (const dealId of accessibleDealIds) {
          const invs = await ctx.db
            .query("invoices")
            .withIndex("by_deal", (q) => q.eq("deal", dealId))
            .collect();
          fromDeals.push(...invs);
        }
      }
      rows = Array.from(
        new Map(
          [...myCreated, ...fromDeals].map((item) => [item._id, item]),
        ).values(),
      );
    }

    rows = rows.filter((inv) =>
      canReadInvoiceRow(inv, user, isAdmin, accessible, accessibleDealIds),
    );
    if (orgFilter !== "all" && orgFilter) {
      rows = rows.filter((inv) => inv.group === orgFilter);
    }

    return {
      total: rows.length,
      draft: rows.filter((i) => (i.status ?? "draft") === "draft").length,
      sent: rows.filter((i) => i.status === "sent").length,
      paid: rows.filter((i) => i.status === "paid").length,
      partially_paid: rows.filter((i) => i.status === "partially_paid").length,
    };
  },
});

/** تفاصيل فاتورة واحدة مع صلاحية القراءة */
export const getInvoiceWithDetails = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await loadInvoiceIfReadable(ctx, args.id);
    if (!invoice) return null;
    const quote = await ctx.db.get(invoice.quote);
    const deal = invoice.deal ? await ctx.db.get(invoice.deal) : null;
    return {
      invoice,
      quoteNumber: quote?.number ?? null,
      quoteRevision: quote?.revision,
      dealTitle: deal?.title ?? null,
    };
  },
});

/** Full invoice data for PDF printing */
export const getInvoiceForPrint = query({
  args: { id: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await loadInvoiceIfReadable(ctx, args.id);
    if (!invoice) return null;

    const company = invoice.company ? await ctx.db.get(invoice.company) : null;
    const contact = await ctx.db.get(invoice.contact);
    const group = invoice.group ? await ctx.db.get(invoice.group) : null;
    const currency = invoice.currency
      ? await ctx.db.get(invoice.currency)
      : null;
    const quote = await ctx.db.get(invoice.quote);

    // Product names
    const productMap = new Map<string, string>();
    for (const item of invoice.lineItems ?? []) {
      if (!productMap.has(item.product)) {
        const p = await ctx.db.get(item.product);
        if (p) productMap.set(item.product, p.name);
      }
    }
    // Service names
    const serviceMap = new Map<string, string>();
    for (const item of invoice.services ?? []) {
      if (!serviceMap.has(item.service)) {
        const s = await ctx.db.get(item.service);
        if (s) serviceMap.set(item.service, s.name);
      }
    }
    // Terms
    const paymentTerms = invoice.paymentTerms
      ? await ctx.db.get(invoice.paymentTerms)
      : null;
    const shippingTerms = invoice.shippingTerms
      ? await ctx.db.get(invoice.shippingTerms)
      : null;
    const deliveryTerms = invoice.deliveryTerms
      ? await ctx.db.get(invoice.deliveryTerms)
      : null;

    return {
      invoice,
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
      quoteRef: quote
        ? { number: quote.number, revision: quote.revision }
        : null,
      lineItems: (invoice.lineItems ?? []).map((item, i) => ({
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
      services: (invoice.services ?? []).map((item, i) => ({
        index: (invoice.lineItems?.length ?? 0) + i + 1,
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
