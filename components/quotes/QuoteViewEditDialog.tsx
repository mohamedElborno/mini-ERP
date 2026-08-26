"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  IconFileInvoice,
  IconHistory,
  IconReceipt,
  IconX,
} from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  calculateFinancialDocument,
  convertAmountFromDefaultToCurrencyNumber,
} from "@/convex/quoteFinance";
import { formatQuoteWithRevision } from "@/lib/quoteDisplay";
import { inputCls, labelCls } from "./quoteFormShared";
import {
  buildLineTaxesPayload,
  buildShippingTaxesPayload,
  dateToNoonMs,
  emptyLine,
  newLineKey,
  type EnrichedDeal,
  type LineItemForm,
} from "./quoteFormShared";
import { QuoteFormMetaSection, type QuotePaymentMethod } from "./QuoteFormMetaSection";
import { QuoteFormTotalsSection } from "./QuoteFormTotalsSection";
import { QuoteLineItemsSection } from "./QuoteLineItemsSection";
import { QuoteTaxTemplateSection } from "./QuoteTaxTemplateSection";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";
import { CreateInvoicePreviewDialog } from "./CreateInvoicePreviewDialog";
import { PrintDocumentButton } from "@/components/print/PrintDocumentButton";
import { PublicViewLinkSection } from "@/components/print/PublicViewLinkSection";

type QuoteStatus = NonNullable<Doc<"quotes">["status"]>;
const STATUSES = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
] as const;

type ManualQuoteStatus = (typeof STATUSES)[number];

function toManualQuoteStatus(
  status: QuoteStatus | undefined,
): ManualQuoteStatus {
  if (status && (STATUSES as readonly string[]).includes(status)) {
    return status as ManualQuoteStatus;
  }
  return "draft";
}

type Props = {
  open: boolean;
  onClose: () => void;
  quoteId: Id<"quotes"> | null;
  dealTitle: string;
  onUpdated?: () => void;
  /** يفتح نافذة سجل الأحداث (نفس الزر في الجدول) */
  onOpenActivityLog?: () => void;
};

function lineDocToForm(
  li: NonNullable<Doc<"quotes">["lineItems"]>[number],
): LineItemForm {
  return {
    key: newLineKey(),
    product: li.product,
    productName: "",
    productCode: "",
    qty: li.quantity,
    price: li.price,
    discount: li.discount ?? 0,
    taxIds: li.taxes?.map((x) => x.taxId) ?? [],
  };
}

export function QuoteViewEditDialog({
  open,
  onClose,
  quoteId,
  dealTitle,
  onUpdated,
  onOpenActivityLog,
}: Props) {
  const t = useTranslations("quotesPage");
  const locale = useLocale();
  const { isAuthenticated } = useConvexAuth();
  const { orgGroupFilter, effectiveOrgGroupId } = useOrgGroup();

  const detail = useQuery(
    api.quotes.getQuoteWithDetails,
    open && quoteId ? { id: quoteId } : "skip",
  );
  const quote = detail?.quote;
  const hasInvoice = detail?.hasInvoice ?? false;
  const hasPublicViewLink = detail?.hasPublicViewLink ?? false;
  const catalogOrgGroupId = quote?.group ?? orgGroupFilter;
  const settingsOrgGroupId = quote?.group ?? effectiveOrgGroupId ?? "all";

  const products = useQuery(
    api.products.getProducts,
    open && isAuthenticated ? { orgGroupId: catalogOrgGroupId } : "skip",
  );
  const servicesList = useQuery(
    api.services.getServices,
    open && isAuthenticated ? { orgGroupId: catalogOrgGroupId } : "skip",
  );
  const currencies = useQuery(
    api.currencies.getCurrencies,
    open && isAuthenticated ? { orgGroupId: catalogOrgGroupId } : "skip",
  );
  const taxesList = useQuery(
    api.taxes.getTaxes,
    open && isAuthenticated ? { orgGroupId: catalogOrgGroupId } : "skip",
  );
  const settings = useQuery(
    api.settings.getSettings,
    open && isAuthenticated ? { orgGroupId: settingsOrgGroupId } : "skip",
  );
  const deals = useQuery(
    api.deals.getDealsWithDetails,
    open && isAuthenticated ? { orgGroupId: orgGroupFilter } : "skip",
  ) as EnrichedDeal[] | undefined;
  const currentUser = useQuery(
    api.users.getCurrentUser,
    open && isAuthenticated ? {} : "skip",
  );

  const updateQuote = useMutation(api.quotes.updateQuote);
  const createInvoice = useMutation(api.invoices.createInvoice);

  const canEdit = useMemo(() => {
    const perms = currentUser?.roleDetails?.permissions ?? [];
    return perms.includes("admin:all") || perms.includes("quotes:update");
  }, [currentUser]);

  const canEditQuote = canEdit && !hasInvoice;

  const canCreateInvoice = useMemo(() => {
    const perms = currentUser?.roleDetails?.permissions ?? [];
    return perms.includes("admin:all") || perms.includes("invoices:create");
  }, [currentUser]);

  const showCreateInvoice =
    canCreateInvoice &&
    !hasInvoice &&
    quote &&
    (quote.status === "accepted" || quote.status === "sent");

  const canOversellQuotes = useMemo(() => {
    const perms = currentUser?.roleDetails?.permissions ?? [];
    return perms.includes("admin:all") || perms.includes("quotes:oversell");
  }, [currentUser]);

  const allowPerLineTaxes = settings?.allowPerLineTaxes ?? false;

  const defaultCurrencyId = useMemo(() => {
    if (!currencies?.length) return undefined;
    const fromSettings = settings?.defaultCurrency;
    if (fromSettings) return fromSettings;
    return currencies.find((c) => c.default)?._id;
  }, [settings?.defaultCurrency, currencies]);

  const [number, setNumber] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ManualQuoteStatus>("draft");
  const [issueDate, setIssueDate] = useState<Date | undefined>(undefined);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [expirationDate, setExpirationDate] = useState<Date | undefined>();
  const [currencyId, setCurrencyId] = useState<Id<"currencies"> | "">("");
  const [taxTemplateIds, setTaxTemplateIds] = useState<Id<"taxes">[]>([]);
  const [generalDiscount, setGeneralDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [lines, setLines] = useState<LineItemForm[]>([]);
  const [shippingTaxIds, setShippingTaxIds] = useState<Id<"taxes">[]>([]);
  const [paymentMethod, setPaymentMethod] =
    useState<QuotePaymentMethod>("immediate");
  const [saving, setSaving] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);

  useEffect(() => {
    const q = detail?.quote;
    if (!open || !q) return;
    setNumber(q.number ?? "");
    setDescription(q.description ?? "");
    setStatus(toManualQuoteStatus(q.status));
    setIssueDate(q.issueDate != null ? new Date(q.issueDate) : new Date());
    setDueDate(q.dueDate != null ? new Date(q.dueDate) : undefined);
    setExpirationDate(
      q.expirationDate != null ? new Date(q.expirationDate) : undefined,
    );
    setCurrencyId(q.currency ?? (defaultCurrencyId as Id<"currencies">) ?? "");
    setGeneralDiscount(q.discount ?? 0);
    setShipping(q.shippingAmount ?? 0);
    if (q.lineItems && q.lineItems.length > 0) {
      setLines(q.lineItems.map(lineDocToForm));
      const fromLine = q.lineItems[0]?.taxes;
      if (fromLine && fromLine.length > 0) {
        setTaxTemplateIds(
          fromLine.map((t) => t.taxId).filter(Boolean) as Id<"taxes">[],
        );
      } else {
        setTaxTemplateIds([]);
      }
    } else {
      setLines([emptyLine()]);
      setTaxTemplateIds([]);
    }
    setShippingTaxIds(
      (q.shippingTaxes?.map((x) => x.taxId).filter(Boolean) ??
        []) as Id<"taxes">[],
    );
    setPaymentMethod(q.paymentMethod ?? "immediate");
  }, [open, detail?.quote?._id, detail?.quote?.updatedAt, defaultCurrencyId]);

  useEffect(() => {
    if (allowPerLineTaxes) return;
    setLines((prev) =>
      prev.map((line) => ({ ...line, taxIds: [...taxTemplateIds] })),
    );
  }, [allowPerLineTaxes, taxTemplateIds]);

  useEffect(() => {
    if (!open || !quoteId || !products?.length) return;
    setLines((prev) =>
      prev.map((l) => {
        if (!l.product) return l;
        const p = products.find((x) => x._id === l.product);
        return p ? { ...l, productName: p.name, productCode: p.code ?? "" } : l;
      }),
    );
  }, [open, quoteId, products?.length, products]);

  const getLinePriceForProduct = useCallback(
    (prod: Doc<"products">) => {
      if (!currencyId || !currencies) return prod.price ?? 0;
      return convertAmountFromDefaultToCurrencyNumber(
        prod.price ?? 0,
        currencyId,
        defaultCurrencyId,
        currencies,
      );
    },
    [currencyId, currencies, defaultCurrencyId],
  );

  const repriceAllLines = useCallback(
    (newCurrency: Id<"currencies">) => {
      if (!products?.length || !currencies) return;
      setLines((prev) =>
        prev.map((line) => {
          if (!line.product) return line;
          const prod = products.find((p) => p._id === line.product);
          if (!prod) return line;
          return {
            ...line,
            price: convertAmountFromDefaultToCurrencyNumber(
              prod.price ?? 0,
              newCurrency,
              defaultCurrencyId,
              currencies,
            ),
          };
        }),
      );
    },
    [products, currencies, defaultCurrencyId],
  );

  const applyTaxTemplateToAllLines = useCallback(() => {
    setLines((prev) =>
      prev.map((line) => ({
        ...line,
        taxIds: [...taxTemplateIds],
      })),
    );
  }, [taxTemplateIds]);

  const financialPreview = useMemo(() => {
    const shippingTaxPayload = buildShippingTaxesPayload(
      shippingTaxIds,
      taxesList,
    );
    const raw = lines
      .filter((l) => l.product)
      .map((l) => {
        const taxIds = allowPerLineTaxes ? l.taxIds : taxTemplateIds;
        const taxes = buildLineTaxesPayload(taxIds, taxesList);
        return {
          product: l.product,
          quantity: l.qty,
          price: l.price,
          discount: l.discount > 0 ? l.discount : undefined,
          ...(taxes ? { taxes } : {}),
        };
      });
    if (raw.length === 0) {
      return calculateFinancialDocument(
        [],
        [],
        generalDiscount,
        shipping,
        shippingTaxPayload,
      );
    }
    return calculateFinancialDocument(
      raw as never,
      [],
      generalDiscount,
      shipping,
      shippingTaxPayload,
    );
  }, [lines, taxesList, generalDiscount, shipping, shippingTaxIds, allowPerLineTaxes, taxTemplateIds]);

  const handleLineChange = (key: string, patch: Partial<LineItemForm>) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  };

  const toggleTaxTemplate = (id: Id<"taxes">) => {
    setTaxTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleLineTax = (key: string, id: Id<"taxes">) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const has = l.taxIds.includes(id);
        return {
          ...l,
          taxIds: has ? l.taxIds.filter((x) => x !== id) : [...l.taxIds, id],
        };
      }),
    );
  };

  const toggleShippingTax = (id: Id<"taxes">) => {
    setShippingTaxIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const productName = (id: Id<"products">) =>
    products?.find((p) => p._id === id)?.name ?? id;

  const fmt = (n: number | undefined) =>
    n == null
      ? "—"
      : new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);

  const handleClose = () => {
    setInvoicePreviewOpen(false);
    onClose();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteId || !canEditQuote) return;
    if (!currencyId) {
      toast.error(t("createCurrencyRequired"));
      return;
    }
    setSaving(true);
    try {
      const exp = expirationDate
        ? new Date(
            expirationDate.getFullYear(),
            expirationDate.getMonth(),
            expirationDate.getDate(),
            12,
            0,
            0,
            0,
          ).getTime()
        : undefined;
      const validLines = lines
        .filter((l) => l.product !== "")
        .map((l) => {
          const taxIds = allowPerLineTaxes ? l.taxIds : taxTemplateIds;
          const taxes = buildLineTaxesPayload(taxIds, taxesList);
          return {
            product: l.product as Id<"products">,
            quantity: l.qty,
            price: l.price,
            discount: l.discount > 0 ? l.discount : undefined,
            ...(taxes ? { taxes } : {}),
          };
        });
      const shippingTaxPayload =
        buildShippingTaxesPayload(shippingTaxIds, taxesList);

      await updateQuote({
        id: quoteId,
        status,
        description: description.trim() || undefined,
        expirationDate: exp,
        paymentMethod,
        financialUpdate: {
          lineItems: validLines,
          currency: currencyId,
          issueDate: dateToNoonMs(issueDate) ?? Date.now(),
          dueDate: dateToNoonMs(dueDate),
          discount: generalDiscount,
          shippingAmount: shipping,
          shippingTaxes: shippingTaxPayload ?? [],
        },
      });
      toast.success(t("quoteDetailSaved"));
      onUpdated?.();
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmCreateInvoice = async () => {
    if (!quoteId || !quote || invoicing) return;
    setInvoicing(true);
    try {
      await createInvoice({ quote: quoteId });
      toast.success(
        quote.paymentMethod === "on_credit"
          ? t("invoiceCreatedOnCreditFromQuote")
          : t("invoiceCreatedFromQuote"),
      );
      setInvoicePreviewOpen(false);
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setInvoicing(false);
    }
  };

  if (!open || !quoteId) return null;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-20 md:pb-4">
      <div
        className="absolute inset-0 min-h-screen min-w-screen bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="bg-card border-border relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border shadow-2xl">
        <div className="border-border flex shrink-0 items-center gap-3 border-b px-6 py-4">
          <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <IconFileInvoice className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t("quoteDetailTitle")}</h2>
            <p className="text-muted-foreground truncate text-xs">
              <span className="font-mono">
                {formatQuoteWithRevision(quote?.number, quote?.revision)}
              </span>
              {dealTitle ? ` · ${dealTitle}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onOpenActivityLog && (
              <button
                type="button"
                onClick={onOpenActivityLog}
                className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5 transition-colors"
                title={t("auditLogOpenButton")}
                aria-label={t("auditLogOpenButton")}
              >
                <IconHistory className="h-5 w-5" />
              </button>
            )}
            {quoteId && <PrintDocumentButton type="quote" id={quoteId} size="sm" />}
            <button
              type="button"
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5 transition-colors"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        </div>

        {detail === undefined && (
          <div className="text-muted-foreground p-6 text-sm">
            {t("quoteDetailLoading")}
          </div>
        )}

        {detail === null && (
          <div className="text-destructive p-6 text-sm">
            {t("quoteDetailNotFound")}
          </div>
        )}

        {quote && !canEditQuote && (
          <form className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {hasInvoice && (
                <div
                  role="status"
                  className="border-border bg-amber-500/10 text-amber-900 dark:text-amber-200 rounded-lg border px-3 py-2 text-sm"
                >
                  {t("quoteLockedByInvoice")}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className={labelCls}>{t("colDeal")}</p>
                  <p className="text-foreground text-sm font-medium">
                    {dealTitle || "—"}
                  </p>
                </div>
                <div>
                  <p className={labelCls}>{t("colStatus")}</p>
                  <p className="text-foreground text-sm">
                    {t(`status.${quote.status ?? "draft"}`)}
                  </p>
                </div>
              </div>

              {quote.lineItems && quote.lineItems.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">
                    {t("lineItemsTitle")}
                  </p>
                  <div className="border-border max-h-48 overflow-y-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-start font-medium">
                            {t("colProduct")}
                          </th>
                          <th className="px-3 py-2 text-end font-medium">
                            {t("colQty")}
                          </th>
                          <th className="px-3 py-2 text-end font-medium">
                            {t("colUnitPrice")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-border divide-y">
                        {quote.lineItems.map((li, i) => (
                          <tr key={i}>
                            <td className="text-foreground max-w-[180px] truncate px-3 py-2">
                              {productName(li.product)}
                            </td>
                            <td className="text-foreground px-3 py-2 text-end tabular-nums">
                              {li.quantity}
                            </td>
                            <td className="text-foreground px-3 py-2 text-end tabular-nums">
                              {fmt(li.price)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="border-border bg-muted/30 space-y-1.5 rounded-xl border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("summarySubtotal")}
                  </span>
                  <span className="tabular-nums">{fmt(quote.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("summaryTax")}
                  </span>
                  <span className="tabular-nums">{fmt(quote.taxAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("summaryTotal")}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {fmt(quote.total)}
                  </span>
                </div>
              </div>

              {quoteId && (
                <PublicViewLinkSection
                  type="quote"
                  documentId={quoteId}
                  hasPublicViewLink={hasPublicViewLink}
                />
              )}
            </div>
            <div className="border-border flex shrink-0 justify-end gap-2 border-t px-6 py-4">
              <button
                type="button"
                onClick={handleClose}
                className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm"
              >
                {t("createCancel")}
              </button>
            </div>
          </form>
        )}

        {quote && canEditQuote && (
          <form
            onSubmit={handleSave}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <QuoteFormMetaSection
                dealId={quote.deal}
                onDealChange={() => undefined}
                deals={deals}
                dealReadOnly
                dealTitleReadOnly={dealTitle}
                currencyId={currencyId}
                onCurrencyChange={setCurrencyId}
                onRepriceAllLines={repriceAllLines}
                currencies={currencies}
                number={number}
                onNumberChange={setNumber}
                numberReadOnly
                issueDate={issueDate}
                onIssueDateChange={setIssueDate}
                dueDate={dueDate}
                onDueDateChange={setDueDate}
                expirationDate={expirationDate}
                onExpirationDateChange={setExpirationDate}
                description={description}
                onDescriptionChange={setDescription}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
              />

              <div>
                <p className={labelCls}>{t("colStatus")}</p>
                <select
                  className={inputCls}
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as ManualQuoteStatus)
                  }
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </select>
              </div>

              <QuoteTaxTemplateSection
                taxesList={taxesList}
                taxTemplateIds={taxTemplateIds}
                allowPerLineTaxes={allowPerLineTaxes}
                onToggleTax={toggleTaxTemplate}
                onApplyToAllLines={
                  allowPerLineTaxes ? applyTaxTemplateToAllLines : undefined
                }
              />

              <div className="border-border border-t" />

              <QuoteLineItemsSection
                lines={lines}
                onAddLine={() =>
                  setLines((p) => [...p, emptyLine(taxTemplateIds)])
                }
                onStartFirstLine={() => setLines([emptyLine(taxTemplateIds)])}
                products={products}
                taxesList={taxesList}
                getLinePriceForProduct={getLinePriceForProduct}
                onLineChange={handleLineChange}
                onRemoveLine={(key) =>
                  setLines((p) => p.filter((l) => l.key !== key))
                }
                onToggleLineTax={toggleLineTax}
                allowPerLineTaxes={allowPerLineTaxes}
                canOversellQuotes={canOversellQuotes}
              />

              <div className="border-border border-t" />

              <QuoteFormTotalsSection
                generalDiscount={generalDiscount}
                onGeneralDiscountChange={setGeneralDiscount}
                shipping={shipping}
                onShippingChange={setShipping}
                financialPreview={financialPreview}
                taxesList={taxesList}
                shippingTaxIds={shippingTaxIds}
                onToggleShippingTax={toggleShippingTax}
              />

              {quoteId && (
                <PublicViewLinkSection
                  type="quote"
                  documentId={quoteId}
                  hasPublicViewLink={hasPublicViewLink}
                />
              )}
            </div>

            <div className="border-border flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-6 py-4">
              <div className="flex flex-wrap gap-2">
                {showCreateInvoice && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setInvoicePreviewOpen(true)}
                    className="border-border bg-card text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    <IconReceipt className="h-4 w-4 shrink-0" />
                    {t("createInvoiceFromQuote")}
                  </button>
                )}
              </div>
              <div className="flex shrink-0 gap-2 ms-auto">
                <button
                  type="button"
                  onClick={handleClose}
                  className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm"
                >
                  {t("createCancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving || invoicing}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {saving ? t("saving") : t("saveChanges")}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>

    {quote && invoicePreviewOpen && (
      <CreateInvoicePreviewDialog
        open={invoicePreviewOpen}
        onClose={() => setInvoicePreviewOpen(false)}
        onConfirm={handleConfirmCreateInvoice}
        confirming={invoicing}
        quote={quote}
        dealTitle={dealTitle}
        products={products}
        services={servicesList}
        currencies={currencies}
      />
    )}
    </>
  );
}

