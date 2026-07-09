"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconCash, IconX } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  convertAmountFromCurrencyToDefault,
} from "@/convex/quoteFinance";
import { QuoteDatePickerField } from "@/components/quotes/QuoteDatePickerField";
import { dateToNoonMs, inputCls, labelCls, numInputCls } from "@/components/quotes/quoteFormShared";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";

type PaymentMethod =
  | "cash"
  | "bank_transfer"
  | "check"
  | "credit_card"
  | "other";

type VoucherContext =
  | "general_credit"
  | "invoice_payment"
  | "deal_advance"
  | "quote_advance";

type AllocationRow = {
  invoiceId: Id<"invoices">;
  amount: number;
  amountInDefaultCurrency?: number;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  /** Pre-selected invoice when opened from the invoices page */
  defaultInvoiceId?: Id<"invoices">;
  defaultDealId?: Id<"deals">;
  defaultQuoteId?: Id<"quotes">;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "bank_transfer",
  "check",
  "credit_card",
  "other",
];

/** Payment methods that may have optional tax */
const TAX_SUGGESTED_METHODS: PaymentMethod[] = ["credit_card", "bank_transfer"];

/** Payment methods that require a bank account */
const BANK_ACCOUNT_METHODS: PaymentMethod[] = ["bank_transfer", "credit_card"];

const VOUCHER_CONTEXTS: VoucherContext[] = [
  "general_credit",
  "invoice_payment",
  "deal_advance",
  "quote_advance",
];

export function AddReceiptVoucherDialog({
  open,
  onClose,
  onCreated,
  defaultInvoiceId,
  defaultDealId,
  defaultQuoteId,
}: Props) {
  const t = useTranslations("receiptVouchersPage");
  const locale = useLocale();
  const { isAuthenticated } = useConvexAuth();

  const [submitting, setSubmitting] = useState(false);
  const [entryMode, setEntryMode] = useState<"new" | "existing">("new");
  const [existingVoucherId, setExistingVoucherId] = useState<
    Id<"receiptVouchers"> | ""
  >("");
  const [existingAllocation, setExistingAllocation] = useState("");
  const [voucherContext, setVoucherContext] =
    useState<VoucherContext>("general_credit");
  const [companyId, setCompanyId] = useState<Id<"companies"> | "">("");
  const [contactId, setContactId] = useState<Id<"contacts"> | "">("");
  const [dealId, setDealId] = useState<Id<"deals"> | "">("");
  const [quoteId, setQuoteId] = useState<Id<"quotes"> | "">("");
  const [amount, setAmount] = useState("");
  const [currencyId, setCurrencyId] = useState<Id<"currencies"> | "">("");
  const [amountInDefault, setAmountInDefault] = useState("");
  const [exchangeRateManual, setExchangeRateManual] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [bankAccountId, setBankAccountId] = useState<Id<"bankAccounts"> | "">(
    "",
  );
  const [applyPaymentTax, setApplyPaymentTax] = useState(false);
  const [paymentTaxRate, setPaymentTaxRate] = useState("");
  const [issueDate, setIssueDate] = useState<Date | undefined>(() => new Date());
  const [description, setDescription] = useState("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Id<"invoices">[]>(
    [],
  );
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const isFromExternal = Boolean(
    defaultInvoiceId || defaultDealId || defaultQuoteId,
  );
  const lockedContext: VoucherContext | null = defaultInvoiceId
    ? "invoice_payment"
    : defaultDealId
      ? "deal_advance"
      : defaultQuoteId
        ? "quote_advance"
        : null;

  const { orgGroupFilter, orgGroupIdForCreate, effectiveOrgGroupId } =
    useOrgGroup();

  const companies = useQuery(
    api.companies.getCompanies,
    isAuthenticated ? { orgGroupId: orgGroupFilter } : "skip",
  );
  const contacts = useQuery(
    api.contacts.getContacts,
    isAuthenticated && companyId ? { companyId } : "skip",
  );
  const currencies = useQuery(
    api.currencies.getCurrencies,
    isAuthenticated ? { orgGroupId: orgGroupFilter } : "skip",
  );
  const settings = useQuery(
    api.settings.getSettings,
    isAuthenticated ? { orgGroupId: effectiveOrgGroupId ?? "all" } : "skip",
  );
  const taxesList = useQuery(
    api.taxes.getTaxes,
    isAuthenticated ? { orgGroupId: orgGroupFilter } : "skip",
  );
  const bankAccounts = useQuery(
    api.bankAccounts.getBankAccounts,
    isAuthenticated ? { activeOnly: true, orgGroupId: orgGroupFilter } : "skip",
  );
  const deals = useQuery(
    api.deals.getDealsWithDetails,
    isAuthenticated ? { orgGroupId: orgGroupFilter } : "skip",
  );
  const quotes = useQuery(
    api.quotes.getQuotes,
    isAuthenticated ? { orgGroupId: orgGroupFilter } : "skip",
  );
  const companyInvoices = useQuery(
    api.invoices.getInvoices,
    isAuthenticated && companyId
      ? { companyId, orgGroupId: orgGroupFilter }
      : "skip",
  ) as Doc<"invoices">[] | undefined;

  const linkableVouchers = useQuery(
    api.receiptVouchers.getLinkableReceiptVouchers,
    isAuthenticated &&
      isFromExternal &&
      entryMode === "existing" &&
      companyId
      ? {
          companyId,
          requireRemaining: lockedContext === "invoice_payment",
        }
      : "skip",
  );

  const defaultInvoiceInfo = useQuery(
    api.receiptVouchers.getInvoicePaymentInfo,
    open && defaultInvoiceId ? { invoiceId: defaultInvoiceId } : "skip",
  );

  const createVoucher = useMutation(api.receiptVouchers.createReceiptVoucher);
  const applyExistingVoucher = useMutation(
    api.receiptVouchers.applyExistingReceiptVoucher,
  );

  const defaultCurrencyId = useMemo(() => {
    if (!currencies?.length) return undefined;
    if (settings?.defaultCurrency) return settings.defaultCurrency;
    return currencies.find((c) => c.default)?._id;
  }, [settings?.defaultCurrency, currencies]);

  const isNonDefaultCurrency = Boolean(
    currencyId && defaultCurrencyId && currencyId !== defaultCurrencyId,
  );

  const selectedCurrency = useMemo(
    () => (currencies ?? []).find((c) => c._id === currencyId),
    [currencies, currencyId],
  );
  const defaultCurrency = useMemo(
    () => (currencies ?? []).find((c) => c._id === defaultCurrencyId),
    [currencies, defaultCurrencyId],
  );
  const exchangeRatePreview = useMemo(() => {
    if (!isNonDefaultCurrency || !selectedCurrency?.exchangeRate) return null;
    return {
      symbol: selectedCurrency.symbol,
      rate: selectedCurrency.exchangeRate,
      defaultSymbol: defaultCurrency?.symbol ?? "—",
    };
  }, [isNonDefaultCurrency, selectedCurrency, defaultCurrency]);

  const requiresBankAccount = BANK_ACCOUNT_METHODS.includes(paymentMethod);
  const effectiveContext = lockedContext ?? voucherContext;
  const showInvoiceReferencePicker =
    !defaultInvoiceId &&
    !isFromExternal &&
    (effectiveContext === "invoice_payment" ||
      effectiveContext === "deal_advance" ||
      effectiveContext === "quote_advance");
  const showDealField =
    effectiveContext === "deal_advance" && !defaultDealId;
  const showQuoteField =
    effectiveContext === "quote_advance" && !defaultQuoteId;
  const lockCompanyFields = isFromExternal && Boolean(companyId);

  const companyDeals = useMemo(
    () =>
      (deals ?? []).filter(
        (d) => !companyId || d.company === companyId,
      ),
    [deals, companyId],
  );

  const companyQuotes = useMemo(
    () =>
      (quotes ?? []).filter(
        (q) => !companyId || q.company === companyId,
      ),
    [quotes, companyId],
  );

  const resetForm = useCallback(() => {
    setEntryMode("new");
    setExistingVoucherId("");
    setExistingAllocation("");
    setVoucherContext("general_credit");
    setCompanyId("");
    setContactId("");
    setDealId("");
    setQuoteId("");
    setAmount("");
    setCurrencyId(defaultCurrencyId ?? "");
    setAmountInDefault("");
    setExchangeRateManual(false);
    setPaymentMethod("cash");
    setBankAccountId("");
    setApplyPaymentTax(false);
    setPaymentTaxRate("");
    setIssueDate(new Date());
    setDescription("");
    setSelectedInvoiceIds([]);
    setAllocations({});
  }, [defaultCurrencyId]);

  useEffect(() => {
    if (!open) return;
    resetForm();
    if (defaultCurrencyId) setCurrencyId(defaultCurrencyId);
  }, [open, resetForm, defaultCurrencyId]);

  useEffect(() => {
    if (!requiresBankAccount || !bankAccounts?.length) return;
    const primary = bankAccounts.find((b) => b.isPrimary);
    if (primary) setBankAccountId(primary._id);
  }, [requiresBankAccount, bankAccounts]);

  useEffect(() => {
    if (!open || !defaultInvoiceInfo) return;
    setVoucherContext("invoice_payment");
    if (defaultInvoiceInfo.company) {
      setCompanyId(defaultInvoiceInfo.company);
    }
    if (defaultInvoiceInfo.contact) {
      setContactId(defaultInvoiceInfo.contact);
    }
    if (defaultInvoiceInfo.currency) {
      setCurrencyId(defaultInvoiceInfo.currency);
    }
    setSelectedInvoiceIds([defaultInvoiceInfo.invoiceId]);
    if (defaultInvoiceInfo.outstanding > 0) {
      setAmount(String(defaultInvoiceInfo.outstanding));
      setExistingAllocation(String(defaultInvoiceInfo.outstanding));
      setAllocations({
        [defaultInvoiceInfo.invoiceId]: String(defaultInvoiceInfo.outstanding),
      });
    }
  }, [open, defaultInvoiceInfo]);

  const selectedExistingVoucher = useMemo(
    () => (linkableVouchers ?? []).find((v) => v._id === existingVoucherId),
    [linkableVouchers, existingVoucherId],
  );

  useEffect(() => {
    if (!selectedExistingVoucher || lockedContext !== "invoice_payment") return;
    if (defaultInvoiceInfo?.outstanding && defaultInvoiceInfo.outstanding > 0) {
      const suggested = Math.min(
        selectedExistingVoucher.remainingAmount,
        defaultInvoiceInfo.outstanding,
      );
      setExistingAllocation(String(suggested));
    } else {
      setExistingAllocation(String(selectedExistingVoucher.remainingAmount));
    }
  }, [selectedExistingVoucher, lockedContext, defaultInvoiceInfo]);

  useEffect(() => {
    if (!open || !defaultInvoiceId || entryMode === "existing") return;
    if (!amount) return;
    setAllocations({ [defaultInvoiceId]: amount });
    setSelectedInvoiceIds([defaultInvoiceId]);
  }, [open, defaultInvoiceId, amount, entryMode]);

  useEffect(() => {
    if (!open || !defaultDealId || !deals?.length) return;
    const deal = deals.find((d) => d._id === defaultDealId);
    if (!deal) return;
    setVoucherContext("deal_advance");
    setDealId(defaultDealId);
    if (deal.company) setCompanyId(deal.company);
    if (deal.contact) setContactId(deal.contact);
  }, [open, defaultDealId, deals]);

  useEffect(() => {
    if (!open || !defaultQuoteId || !quotes?.length) return;
    const quote = quotes.find((q) => q._id === defaultQuoteId);
    if (!quote) return;
    setVoucherContext("quote_advance");
    setQuoteId(defaultQuoteId);
    if (quote.company) setCompanyId(quote.company);
    if (quote.contact) setContactId(quote.contact);
    if (quote.deal) setDealId(quote.deal);
    if (quote.currency) setCurrencyId(quote.currency);
  }, [open, defaultQuoteId, quotes]);

  const recalcDefaultAmount = useCallback(
    (amt: number, curId: Id<"currencies">) => {
      if (!currencies || !defaultCurrencyId || curId === defaultCurrencyId) {
        setAmountInDefault("");
        return;
      }
      const converted = convertAmountFromCurrencyToDefault(
        amt,
        curId,
        defaultCurrencyId,
        currencies,
      );
      setAmountInDefault(String(converted));
    },
    [currencies, defaultCurrencyId],
  );

  useEffect(() => {
    if (!open || exchangeRateManual || !amount || !currencyId) return;
    const n = parseFloat(amount);
    if (!Number.isFinite(n)) return;
    recalcDefaultAmount(n, currencyId);
  }, [open, amount, currencyId, exchangeRateManual, recalcDefaultAmount]);

  useEffect(() => {
    if (TAX_SUGGESTED_METHODS.includes(paymentMethod) && taxesList?.length) {
      const vat = taxesList.find(
        (tx) =>
          tx.rate != null &&
          (tx.name?.toLowerCase().includes("vat") ||
            tx.code?.toLowerCase().includes("vat")),
      );
      if (vat?.rate != null && !paymentTaxRate) {
        setPaymentTaxRate(String(vat.rate));
      }
    }
  }, [paymentMethod, taxesList, paymentTaxRate]);

  const parsedAmount = parseFloat(amount) || 0;

  const paymentTaxAmount = useMemo(() => {
    if (!applyPaymentTax || !paymentTaxRate) return 0;
    const rate = parseFloat(paymentTaxRate);
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return (parsedAmount * rate) / 100;
  }, [applyPaymentTax, paymentTaxRate, parsedAmount]);

  const netAmount = Math.max(0, parsedAmount - paymentTaxAmount);

  const usedAmount = useMemo(() => {
    return selectedInvoiceIds.reduce((sum, invId) => {
      const v = parseFloat(allocations[invId] ?? "0");
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);
  }, [selectedInvoiceIds, allocations]);

  const remainingAmount = netAmount - usedAmount;

  const toggleInvoice = (invId: Id<"invoices">) => {
    setSelectedInvoiceIds((prev) => {
      if (prev.includes(invId)) {
        const next = prev.filter((id) => id !== invId);
        setAllocations((a) => {
          const copy = { ...a };
          delete copy[invId];
          return copy;
        });
        return next;
      }
      return [...prev, invId];
    });
  };

  const handleApplyExisting = async () => {
    if (!existingVoucherId || !effectiveContext) {
      toast.error(t("validationExistingVoucher"));
      return;
    }
    if (lockedContext === "invoice_payment") {
      if (!defaultInvoiceId) {
        toast.error(t("validationInvoiceReference"));
        return;
      }
      const allocAmt = parseFloat(existingAllocation);
      if (!Number.isFinite(allocAmt) || allocAmt <= 0) {
        toast.error(t("validationAmount"));
        return;
      }
      if (
        selectedExistingVoucher &&
        allocAmt > selectedExistingVoucher.remainingAmount + 0.001
      ) {
        toast.error(t("validationAllocationExceeds"));
        return;
      }
    }

    setSubmitting(true);
    try {
      await applyExistingVoucher({
        voucherId: existingVoucherId,
        voucherContext: effectiveContext,
        invoiceId: defaultInvoiceId,
        dealId: defaultDealId || dealId || undefined,
        quoteId: defaultQuoteId || quoteId || undefined,
        allocationAmount:
          lockedContext === "invoice_payment"
            ? parseFloat(existingAllocation)
            : undefined,
      });
      toast.success(t("appliedExisting"));
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!companyId || !contactId || !currencyId) {
      toast.error(t("validationRequired"));
      return;
    }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error(t("validationAmount"));
      return;
    }
    if (isNonDefaultCurrency) {
      const defAmt = parseFloat(amountInDefault);
      if (!Number.isFinite(defAmt) || defAmt <= 0) {
        toast.error(t("validationDefaultAmount"));
        return;
      }
    }
    if (usedAmount > netAmount + 0.001) {
      toast.error(t("validationAllocationExceeds"));
      return;
    }
    if (netAmount <= 0) {
      toast.error(t("validationNetAmount"));
      return;
    }
    if (requiresBankAccount && !bankAccountId) {
      toast.error(t("validationBankAccount"));
      return;
    }
    if (effectiveContext === "deal_advance" && !dealId) {
      toast.error(t("validationDeal"));
      return;
    }
    if (effectiveContext === "quote_advance" && !quoteId) {
      toast.error(t("validationQuote"));
      return;
    }
    if (
      effectiveContext === "invoice_payment" &&
      selectedInvoiceIds.length === 0
    ) {
      toast.error(t("validationInvoiceReference"));
      return;
    }

    const allocationRows: AllocationRow[] = [];
    for (const invId of selectedInvoiceIds) {
      const allocAmt = parseFloat(allocations[invId] ?? "0");
      if (allocAmt > 0) {
        const row: AllocationRow = { invoiceId: invId, amount: allocAmt };
        if (isNonDefaultCurrency && defaultCurrencyId && currencies) {
          row.amountInDefaultCurrency = convertAmountFromCurrencyToDefault(
            allocAmt,
            currencyId,
            defaultCurrencyId,
            currencies,
          );
        }
        allocationRows.push(row);
      }
    }

    let taxRate: number | undefined;
    let taxAmount: number | undefined;
    if (applyPaymentTax && paymentTaxRate) {
      taxRate = parseFloat(paymentTaxRate);
      if (Number.isFinite(taxRate) && taxRate > 0) {
        taxAmount = paymentTaxAmount;
      }
    }

    let exchangeRateUsed: number | undefined;
    if (isNonDefaultCurrency && amountInDefault) {
      const defAmt = parseFloat(amountInDefault);
      if (defAmt > 0) {
        exchangeRateUsed = defAmt / amt;
      }
    }

    setSubmitting(true);
    try {
      await createVoucher({
        company: companyId,
        contact: contactId,
        voucherContext: effectiveContext,
        ...(orgGroupIdForCreate ? { orgGroupId: orgGroupIdForCreate } : {}),
        deal: dealId || undefined,
        quote: quoteId || undefined,
        amount: amt,
        currency: currencyId,
        amountInDefaultCurrency: isNonDefaultCurrency
          ? parseFloat(amountInDefault)
          : undefined,
        exchangeRateUsed,
        paymentMethod,
        bankAccount: bankAccountId || undefined,
        paymentMethodTaxRate: taxRate,
        paymentMethodTaxAmount: taxAmount,
        references:
          showInvoiceReferencePicker && selectedInvoiceIds.length > 0
            ? selectedInvoiceIds
            : defaultInvoiceId
              ? [defaultInvoiceId]
              : undefined,
        allocations: allocationRows.length > 0 ? allocationRows : undefined,
        issueDate: issueDate ? dateToNoonMs(issueDate) : Date.now(),
        description: description.trim() || undefined,
      });
      toast.success(t("created"));
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  const dialogTitle = isFromExternal
    ? entryMode === "existing"
      ? t("applyExistingTitle")
      : t("linkReceiptTitle")
    : t("createTitle");

  const submitLabel =
    entryMode === "existing" && isFromExternal ? t("apply") : t("create");

  const handlePrimaryAction = () => {
    if (isFromExternal && entryMode === "existing") {
      void handleApplyExisting();
    } else {
      void handleSubmit();
    }
  };

  if (!open) return null;

  const eligibleInvoices = (companyInvoices ?? []).filter(
    (inv) => inv.status !== "void" && inv.status !== "paid",
  );

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 min-h-screen min-w-screen bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="bg-card border-border relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border shadow-2xl"
        role="dialog"
        aria-labelledby="add-rv-title"
      >
        <div className="border-border flex shrink-0 items-center gap-3 border-b px-5 py-4">
          <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <IconCash className="h-5 w-5" />
          </div>
          <h2 id="add-rv-title" className="flex-1 text-base font-semibold">
            {dialogTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5"
            aria-label={t("cancel")}
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {isFromExternal && lockedContext && (
            <div className="bg-muted/40 border-border rounded-xl border px-4 py-3">
              <p className="text-muted-foreground text-xs">
                {t("fieldVoucherContext")}
              </p>
              <p className="mt-1 text-sm font-medium">
                {t(`voucherContext.${lockedContext}`)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t(`voucherContextHint.${lockedContext}`)}
              </p>
            </div>
          )}

          {isFromExternal && (
            <div>
              <label className={labelCls}>{t("fieldEntryMode")}</label>
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEntryMode("new")}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    entryMode === "new"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {t("entryModeNew")}
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode("existing")}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    entryMode === "existing"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {t("entryModeExisting")}
                </button>
              </div>
            </div>
          )}

          {isFromExternal && entryMode === "existing" && (
            <div className="space-y-4">
              {!companyId ? (
                <p className="text-muted-foreground text-sm">
                  {t("selectCompanyFirstForExisting")}
                </p>
              ) : (linkableVouchers ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("noLinkableVouchers")}
                </p>
              ) : (
                <>
                  <div>
                    <label className={labelCls}>
                      {t("fieldExistingVoucher")}
                    </label>
                    <select
                      className={inputCls}
                      value={existingVoucherId}
                      onChange={(e) =>
                        setExistingVoucherId(
                          e.target.value as Id<"receiptVouchers"> | "",
                        )
                      }
                    >
                      <option value="">{t("selectExistingVoucher")}</option>
                      {(linkableVouchers ?? []).map((v) => (
                        <option key={v._id} value={v._id}>
                          {v.number ?? "—"} — {v.remainingAmount.toFixed(2)}{" "}
                          {t("remainingAmount").toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  {lockedContext === "invoice_payment" && (
                    <div>
                      <label className={labelCls}>
                        {t("allocationAmount")}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={numInputCls}
                        value={existingAllocation}
                        onChange={(e) =>
                          setExistingAllocation(e.target.value)
                        }
                      />
                      {selectedExistingVoucher && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          {t("existingVoucherRemaining", {
                            amount:
                              selectedExistingVoucher.remainingAmount.toFixed(
                                2,
                              ),
                          })}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {(!isFromExternal || entryMode === "new") && (
            <>
          {!isFromExternal && (
          <div>
            <label className={labelCls}>{t("fieldVoucherContext")}</label>
            <select
              className={inputCls}
              value={voucherContext}
              onChange={(e) => {
                const ctx = e.target.value as VoucherContext;
                setVoucherContext(ctx);
                if (ctx === "general_credit") {
                  setSelectedInvoiceIds([]);
                  setAllocations({});
                  setDealId("");
                  setQuoteId("");
                }
                if (ctx === "invoice_payment") {
                  setDealId("");
                  setQuoteId("");
                }
              }}
            >
              {VOUCHER_CONTEXTS.map((ctx) => (
                <option key={ctx} value={ctx}>
                  {t(`voucherContext.${ctx}`)}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground mt-1 text-xs">
              {t(`voucherContextHint.${voucherContext}`)}
            </p>
          </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>{t("fieldCompany")}</label>
              <select
                className={inputCls}
                value={companyId}
                disabled={lockCompanyFields}
                onChange={(e) => {
                  setCompanyId(e.target.value as Id<"companies"> | "");
                  setContactId("");
                  setDealId("");
                  setQuoteId("");
                  setSelectedInvoiceIds([]);
                  setAllocations({});
                  setExistingVoucherId("");
                }}
              >
                <option value="">{t("selectCompany")}</option>
                {(companies ?? []).map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("fieldContact")}</label>
              <select
                className={inputCls}
                value={contactId}
                disabled={!companyId || lockCompanyFields}
                onChange={(e) =>
                  setContactId(e.target.value as Id<"contacts"> | "")
                }
              >
                <option value="">{t("selectContact")}</option>
                {(contacts ?? []).map((c) => (
                  <option key={c._id} value={c._id}>
                    {[c.firstName, c.lastName].filter(Boolean).join(" ") ||
                      c.email ||
                      "—"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showDealField && (
            <div>
              <label className={labelCls}>{t("fieldDeal")}</label>
              <select
                className={inputCls}
                value={dealId}
                disabled={!companyId}
                onChange={(e) =>
                  setDealId(e.target.value as Id<"deals"> | "")
                }
              >
                <option value="">{t("selectDeal")}</option>
                {companyDeals.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showQuoteField && (
            <div>
              <label className={labelCls}>{t("fieldQuote")}</label>
              <select
                className={inputCls}
                value={quoteId}
                disabled={!companyId}
                onChange={(e) => {
                  const id = e.target.value as Id<"quotes"> | "";
                  setQuoteId(id);
                  const q = companyQuotes.find((x) => x._id === id);
                  if (q?.deal) setDealId(q.deal);
                }}
              >
                <option value="">{t("selectQuote")}</option>
                {companyQuotes.map((q) => (
                  <option key={q._id} value={q._id}>
                    {q.number ?? q._id}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>{t("fieldAmount")}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={numInputCls}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>{t("fieldCurrency")}</label>
              <select
                className={inputCls}
                value={currencyId}
                onChange={(e) => {
                  const newCur = e.target.value as Id<"currencies">;
                  setCurrencyId(newCur);
                  setExchangeRateManual(false);
                  if (amount && currencies && defaultCurrencyId) {
                    const n = parseFloat(amount);
                    if (Number.isFinite(n)) recalcDefaultAmount(n, newCur);
                  }
                }}
              >
                <option value="">{t("selectCurrency")}</option>
                {(currencies ?? []).map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isNonDefaultCurrency && (
            <div>
              <label className={labelCls}>{t("fieldAmountInDefault")}</label>
              {exchangeRatePreview && (
                <p className="text-muted-foreground mb-1 text-xs">
                  {t("exchangeRatePreview", exchangeRatePreview)}
                </p>
              )}
              <input
                type="number"
                min="0"
                step="0.01"
                className={numInputCls}
                value={amountInDefault}
                onChange={(e) => {
                  setExchangeRateManual(true);
                  setAmountInDefault(e.target.value);
                }}
              />
              <p className="text-muted-foreground mt-1 text-xs">
                {t("fieldAmountInDefaultHint", {
                  symbol: defaultCurrency?.symbol ?? "—",
                })}
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>{t("fieldPaymentMethod")}</label>
              <select
                className={inputCls}
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value as PaymentMethod);
                  if (
                    !BANK_ACCOUNT_METHODS.includes(
                      e.target.value as PaymentMethod,
                    )
                  ) {
                    setBankAccountId("");
                  }
                }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`paymentMethod.${m}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("fieldIssueDate")}</label>
              <QuoteDatePickerField
                value={issueDate}
                onChange={setIssueDate}
                placeholder={t("fieldIssueDate")}
                locale={locale}
              />
            </div>
          </div>

          {requiresBankAccount && (
            <div>
              <label className={labelCls}>{t("fieldBankAccount")}</label>
              <select
                className={inputCls}
                value={bankAccountId}
                onChange={(e) =>
                  setBankAccountId(e.target.value as Id<"bankAccounts"> | "")
                }
              >
                <option value="">{t("selectBankAccount")}</option>
                {(bankAccounts ?? []).map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.bankName}
                    {b.isPrimary ? " ★" : ""} — {b.accountNumber} ({b.iban})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="border-border space-y-3 rounded-xl border p-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={applyPaymentTax}
                onChange={(e) => setApplyPaymentTax(e.target.checked)}
                className="rounded"
              />
              {t("fieldPaymentTaxOptional")}
            </label>
            {applyPaymentTax && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>{t("fieldPaymentTaxRate")}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={numInputCls}
                    value={paymentTaxRate}
                    onChange={(e) => setPaymentTaxRate(e.target.value)}
                    placeholder="%"
                  />
                </div>
                {paymentTaxRate && parsedAmount > 0 && (
                  <div>
                    <label className={labelCls}>{t("fieldPaymentTaxAmount")}</label>
                    <p className="text-foreground pt-2 text-sm tabular-nums font-medium">
                      {paymentTaxAmount.toFixed(2)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t("fieldPaymentTaxDeductedHint")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {showInvoiceReferencePicker &&
            companyId &&
            eligibleInvoices.length > 0 && (
            <div className="border-border space-y-3 rounded-xl border p-4">
              <p className="text-sm font-semibold">{t("fieldReferences")}</p>
              <p className="text-muted-foreground text-xs">
                {t("fieldReferencesHint")}
              </p>
              <ul className="space-y-2">
                {eligibleInvoices.map((inv) => {
                  const selected = selectedInvoiceIds.includes(inv._id);
                  return (
                    <li
                      key={inv._id}
                      className="border-border flex flex-wrap items-center gap-3 rounded-lg border p-3"
                    >
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleInvoice(inv._id)}
                          className="rounded"
                        />
                        <span className="font-mono font-medium">
                          {inv.number ?? "—"}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          ({inv.total?.toFixed(2) ?? "—"})
                        </span>
                      </label>
                      {selected && (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`${numInputCls} max-w-[120px]`}
                          placeholder={t("allocationAmount")}
                          value={allocations[inv._id] ?? ""}
                          onChange={(e) =>
                            setAllocations((a) => ({
                              ...a,
                              [inv._id]: e.target.value,
                            }))
                          }
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {parsedAmount > 0 && (
            <div className="bg-muted/30 border-border grid grid-cols-2 gap-3 rounded-xl border p-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground text-xs">{t("fieldGrossAmount")}</p>
                <p className="font-semibold tabular-nums">
                  {parsedAmount.toFixed(2)}
                </p>
              </div>
              {paymentTaxAmount > 0 && (
                <div>
                  <p className="text-muted-foreground text-xs">
                    {t("fieldPaymentTaxAmount")}
                  </p>
                  <p className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    −{paymentTaxAmount.toFixed(2)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground text-xs">{t("fieldNetAmount")}</p>
                <p className="font-semibold tabular-nums">
                  {netAmount.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">{t("usedAmount")}</p>
                <p className="font-semibold tabular-nums">
                  {usedAmount.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">
                  {t("remainingAmount")}
                </p>
                <p className="font-semibold tabular-nums">
                  {remainingAmount.toFixed(2)}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-muted-foreground text-xs">
                  {t("prepaidBalanceCredit")}
                </p>
                <p className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {Math.max(0, remainingAmount).toFixed(2)}
                </p>
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>{t("fieldDescription")}</label>
            <textarea
              className={`${inputCls} min-h-[72px] resize-y`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
            </>
          )}
        </div>

        <div className="border-border flex shrink-0 justify-end gap-2 border-t px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handlePrimaryAction}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {submitting ? t("saving") : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
