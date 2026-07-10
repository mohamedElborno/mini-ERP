"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { IconFileInvoice, IconX } from "@tabler/icons-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  calculateFinancialDocument,
  convertAmountFromDefaultToCurrencyNumber,
} from "@/convex/quoteFinance";
import {
  buildLineTaxesPayload,
  buildShippingTaxesPayload,
  dateToNoonMs,
  emptyLine,
  type EnrichedDeal,
  type LineItemForm,
} from "./quoteFormShared";
import { QuoteFormMetaSection, type QuotePaymentMethod } from "./QuoteFormMetaSection";
import { QuoteFormTotalsSection } from "./QuoteFormTotalsSection";
import { QuoteLineItemsSection } from "./QuoteLineItemsSection";
import { QuoteTaxTemplateSection } from "./QuoteTaxTemplateSection";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  defaultDealId?: Id<"deals">;
}

export function AddQuoteDialog({
  open,
  onClose,
  onCreated,
  defaultDealId,
}: Props) {
  const t = useTranslations("quotesPage");
  const { isAuthenticated } = useConvexAuth();
  const { orgGroupFilter, effectiveOrgGroupId } = useOrgGroup();

  const [submitting, setSubmitting] = useState(false);
  const [dealId, setDealId] = useState<Id<"deals"> | "">(defaultDealId ?? "");
  const [number, setNumber] = useState("");
  const [description, setDescription] = useState("");
  const [issueDate, setIssueDate] = useState<Date | undefined>(
    () => new Date(),
  );
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [expirationDate, setExpirationDate] = useState<Date | undefined>(
    undefined,
  );
  const [currencyId, setCurrencyId] = useState<Id<"currencies"> | "">("");
  const [taxTemplateIds, setTaxTemplateIds] = useState<Id<"taxes">[]>([]);
  const [generalDiscount, setGeneralDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [shippingTaxIds, setShippingTaxIds] = useState<Id<"taxes">[]>([]);
  const [lines, setLines] = useState<LineItemForm[]>([]);
  const [paymentMethod, setPaymentMethod] =
    useState<QuotePaymentMethod>("immediate");

  const deals = useQuery(
    api.deals.getDealsWithDetails,
    isAuthenticated ? { orgGroupId: orgGroupFilter } : "skip",
  ) as EnrichedDeal[] | undefined;

  const products = useQuery(
    api.products.getProducts,
    isAuthenticated ? { orgGroupId: orgGroupFilter } : "skip",
  );

  const settings = useQuery(
    api.settings.getSettings,
    isAuthenticated ? { orgGroupId: effectiveOrgGroupId ?? "all" } : "skip",
  );
  const currencies = useQuery(
    api.currencies.getCurrencies,
    isAuthenticated ? { orgGroupId: orgGroupFilter } : "skip",
  );
  const taxesList = useQuery(
    api.taxes.getTaxes,
    isAuthenticated ? { orgGroupId: orgGroupFilter } : "skip",
  );
  const currentUser = useQuery(
    api.users.getCurrentUser,
    isAuthenticated ? {} : "skip",
  );

  const createQuote = useMutation(api.quotes.createQuote);

  const canOversellQuotes = useMemo(() => {
    const perms = currentUser?.roleDetails?.permissions ?? [];
    return (
      perms.includes("admin:all") || perms.includes("quotes:oversell")
    );
  }, [currentUser]);

  const defaultCurrencyId = useMemo(() => {
    if (!currencies?.length) return undefined;
    const fromSettings = settings?.defaultCurrency;
    if (fromSettings) return fromSettings;
    return currencies.find((c) => c.default)?._id;
  }, [settings?.defaultCurrency, currencies]);

  useEffect(() => {
    if (!open || !defaultCurrencyId) return;
    setCurrencyId(defaultCurrencyId);
  }, [open, defaultCurrencyId]);

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
        const taxes = buildLineTaxesPayload(l.taxIds, taxesList);
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
  }, [
    lines,
    taxesList,
    generalDiscount,
    shipping,
    shippingTaxIds,
  ]);

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

  const toggleShippingTax = (id: Id<"taxes">) => {
    setShippingTaxIds((prev) =>
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

  const handleClose = () => {
    setDealId(defaultDealId ?? "");
    setNumber("");
    setDescription("");
    setIssueDate(new Date());
    setDueDate(undefined);
    setExpirationDate(undefined);
    setCurrencyId("");
    setTaxTemplateIds([]);
    setShippingTaxIds([]);
    setGeneralDiscount(0);
    setShipping(0);
    setLines([]);
    setPaymentMethod("immediate");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealId) {
      toast.error(t("createRequiredError"));
      return;
    }
    if (!currencyId) {
      toast.error(t("createCurrencyRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const validLines = lines
        .filter((l) => l.product !== "")
        .map((l) => {
          const taxes = buildLineTaxesPayload(l.taxIds, taxesList);
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

      await createQuote({
        deal: dealId as Id<"deals">,
        currency: currencyId,
        paymentMethod,
        issueDate: dateToNoonMs(issueDate) ?? Date.now(),
        dueDate: dateToNoonMs(dueDate),
        expirationDate: dateToNoonMs(expirationDate),
        ...(number.trim() ? { number: number.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(validLines.length > 0 ? { lineItems: validLines } : {}),
        ...(generalDiscount > 0 ? { discount: generalDiscount } : {}),
        ...(shipping > 0 ? { shippingAmount: shipping } : {}),
        ...(shippingTaxPayload ? { shippingTaxes: shippingTaxPayload } : {}),
      });
      toast.success(t("quoteCreated"));
      onCreated?.();
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-20 md:pb-4">
      <div
        className="absolute inset-0 min-h-screen min-w-screen bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="bg-card border-border relative z-10 flex w-full max-w-2xl flex-col rounded-2xl border shadow-2xl">
        <div className="border-border flex items-center gap-3 border-b px-6 py-4">
          <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <IconFileInvoice className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold">
              {t("createSectionTitle")}
            </h2>
            <p className="text-muted-foreground text-xs">
              {t("createSubtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5 transition-colors"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex max-h-[calc(85vh-4rem)] flex-col overflow-hidden md:max-h-[85vh]"
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <QuoteFormMetaSection
              dealId={dealId}
              onDealChange={setDealId}
              deals={deals}
              currencyId={currencyId}
              onCurrencyChange={setCurrencyId}
              onRepriceAllLines={repriceAllLines}
              currencies={currencies}
              number={number}
              onNumberChange={setNumber}
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

            <QuoteTaxTemplateSection
              taxesList={taxesList}
              taxTemplateIds={taxTemplateIds}
              onToggleTax={toggleTaxTemplate}
              onApplyToAllLines={applyTaxTemplateToAllLines}
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
          </div>

          <div className="border-border flex justify-end gap-2 border-t px-6 py-4">
            <button
              type="button"
              className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm transition-colors"
              onClick={handleClose}
            >
              {t("createCancel")}
            </button>
            <button
              type="submit"
              disabled={submitting || !dealId || !currencyId}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? t("creating") : t("createSubmit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
