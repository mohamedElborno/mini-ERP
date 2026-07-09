"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconReceipt, IconX } from "@tabler/icons-react";
import { calculateFinancialDocument } from "@/convex/quoteFinance";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatQuoteWithRevision } from "@/lib/quoteDisplay";
import { labelCls } from "./quoteFormShared";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
  quote: Doc<"quotes">;
  dealTitle: string;
  products: Doc<"products">[] | undefined;
  services: Doc<"services">[] | undefined;
  currencies: Doc<"currencies">[] | undefined;
};

export function CreateInvoicePreviewDialog({
  open,
  onClose,
  onConfirm,
  confirming,
  quote,
  dealTitle,
  products,
  services,
  currencies,
}: Props) {
  const t = useTranslations("quotesPage");
  const locale = useLocale();

  const financials = useMemo(() => {
    const lineItems =
      quote.lineItems?.map((li) => ({
        product: li.product,
        quantity: li.quantity,
        price: li.price,
        discount: li.discount,
        taxes: li.taxes,
      })) ?? [];
    const svc =
      quote.services?.map((s) => ({
        service: s.service,
        duration: s.duration,
        quantity: s.quantity,
        price: s.price,
        discount: s.discount,
        taxes: s.taxes,
      })) ?? [];
    return calculateFinancialDocument(
      lineItems as never,
      svc as never,
      quote.discount ?? 0,
      quote.shippingAmount ?? 0,
      quote.shippingTaxes ?? [],
    );
  }, [quote]);

  const currencyRow = currencies?.find((c) => c._id === quote.currency);

  const fmtMoney = (n: number | undefined) =>
    n == null || !Number.isFinite(n)
      ? "—"
      : new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);

  const fmtDate = (ms: number | undefined) =>
    ms == null
      ? "—"
      : new Date(ms).toLocaleDateString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

  const productLabel = (id: Doc<"products">["_id"]) =>
    products?.find((p) => p._id === id)?.name ?? String(id);

  const serviceLabel = (id: Doc<"services">["_id"]) =>
    services?.find((s) => s._id === id)?.name ?? String(id);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 min-h-screen min-w-screen bg-black/60 backdrop-blur-sm"
        aria-label={t("invoicePreviewCloseBackdrop")}
        onClick={onClose}
      />
      <div
        className="bg-card border-border relative z-10 flex max-h-[88vh] w-full max-w-4xl flex-col rounded-2xl border shadow-2xl"
        role="dialog"
        aria-labelledby="invoice-preview-title"
      >
        <div className="border-border flex shrink-0 items-start gap-3 border-b px-5 py-4">
          <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <IconReceipt className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="invoice-preview-title"
              className="text-base font-semibold leading-tight"
            >
              {t("invoicePreviewTitle")}
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("invoicePreviewSubtitle")}
            </p>
            <p className="text-muted-foreground mt-1 font-mono text-xs">
              {formatQuoteWithRevision(quote.number, quote.revision)} ·{" "}
              {dealTitle || "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 rounded-lg p-1.5 transition-colors disabled:opacity-50"
            aria-label={t("createCancel")}
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <p className="text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 text-xs">
            {t("invoicePreviewSavedQuoteNote")}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className={labelCls}>{t("invoicePreviewNumber")}</p>
              <p className="text-foreground">{t("invoicePreviewNumberAuto")}</p>
            </div>
            <div>
              <p className={labelCls}>{t("invoicePreviewCurrency")}</p>
              <p className="text-foreground">
                {currencyRow
                  ? `${currencyRow.symbol ?? ""} ${currencyRow.name}`.trim()
                  : "—"}
              </p>
            </div>
            <div>
              <p className={labelCls}>{t("createPaymentMethod")}</p>
              <p className="text-foreground text-sm">
                {quote.paymentMethod === "on_credit"
                  ? t("paymentMethodOnCredit")
                  : t("paymentMethodImmediate")}
              </p>
            </div>
            <div>
              <p className={labelCls}>{t("createIssueDate")}</p>
              <p className="text-foreground">{fmtDate(quote.issueDate)}</p>
            </div>
            <div>
              <p className={labelCls}>{t("createDueDate")}</p>
              <p className="text-foreground">{fmtDate(quote.dueDate)}</p>
            </div>
            {quote.description && (
              <div className="sm:col-span-2">
                <p className={labelCls}>{t("createDescription")}</p>
                <p className="text-foreground whitespace-pre-wrap">
                  {quote.description}
                </p>
              </div>
            )}
          </div>

          {financials.processedLineItems.length > 0 && (
            <div>
              <p className="mb-2 font-medium">{t("lineItemsTitle")}</p>
              <div className="border-border max-h-48 overflow-x-auto overflow-y-auto rounded-lg border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-center font-medium">
                        {t("colProduct")}
                      </th>
                      <th className="px-3 py-2 text-center font-medium">
                        {t("colQty")}
                      </th>
                      <th className="px-3 py-2 text-center font-medium">
                        {t("colUnitPrice")}
                      </th>
                      <th className="px-3 py-2 text-center font-medium">
                        {t("invoicePreviewColSubtotalExTax")}
                      </th>
                      <th className="px-3 py-2 text-center font-medium">
                        {t("invoicePreviewColLineTax")}
                      </th>
                      <th className="px-3 py-2 text-center font-medium">
                        {t("invoicePreviewColTotalInclTax")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {financials.processedLineItems.map((row, i) => (
                      <tr key={i}>
                        <td className="text-foreground max-w-[160px] truncate px-3 py-2 text-center">
                          {productLabel(row.product)}
                        </td>
                        <td className="text-foreground px-3 py-2 text-center tabular-nums">
                          {row.quantity}
                        </td>
                        <td className="text-foreground px-3 py-2 text-center tabular-nums">
                          {fmtMoney(row.priceAfterDiscount)}
                        </td>
                        <td className="text-foreground px-3 py-2 text-center tabular-nums">
                          {fmtMoney(row.subtotal)}
                        </td>
                        <td className="text-foreground px-3 py-2 text-center tabular-nums">
                          {fmtMoney(row.taxAmount)}
                        </td>
                        <td className="text-foreground px-3 py-2 text-center tabular-nums font-medium">
                          {fmtMoney(row.totalAfterTax)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {financials.processedServices.length > 0 && (
            <div>
              <p className="mb-2 font-medium">{t("invoicePreviewServices")}</p>
              <div className="border-border max-h-48 overflow-x-auto overflow-y-auto rounded-lg border">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">
                        {t("invoicePreviewServiceName")}
                      </th>
                      <th className="px-3 py-2 text-end font-medium">
                        {t("colQty")}
                      </th>
                      <th className="px-3 py-2 text-end font-medium">
                        {t("colUnitPrice")}
                      </th>
                      <th className="px-3 py-2 text-end font-medium">
                        {t("invoicePreviewColSubtotalExTax")}
                      </th>
                      <th className="px-3 py-2 text-end font-medium">
                        {t("invoicePreviewColLineTax")}
                      </th>
                      <th className="px-3 py-2 text-end font-medium">
                        {t("invoicePreviewColTotalInclTax")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {financials.processedServices.map((row, i) => (
                      <tr key={i}>
                        <td className="text-foreground max-w-[160px] truncate px-3 py-2">
                          {serviceLabel(row.service)}
                        </td>
                        <td className="text-foreground px-3 py-2 text-end tabular-nums">
                          {row.quantity}
                        </td>
                        <td className="text-foreground px-3 py-2 text-end tabular-nums">
                          {fmtMoney(row.priceAfterDiscount)}
                        </td>
                        <td className="text-foreground px-3 py-2 text-end tabular-nums">
                          {fmtMoney(row.subtotal)}
                        </td>
                        <td className="text-foreground px-3 py-2 text-end tabular-nums">
                          {fmtMoney(row.taxAmount)}
                        </td>
                        <td className="text-foreground px-3 py-2 text-end tabular-nums font-medium">
                          {fmtMoney(row.totalAfterTax)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="border-border bg-muted/30 space-y-1.5 rounded-xl border p-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("summarySubtotal")}
              </span>
              <span className="tabular-nums">
                {fmtMoney(financials.subtotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("generalDiscount")}
              </span>
              <span className="tabular-nums">
                {fmtMoney(quote.discount ?? 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("shippingAmount")}
              </span>
              <span className="tabular-nums">
                {fmtMoney(quote.shippingAmount ?? 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("summaryTax")}</span>
              <span className="tabular-nums">
                {fmtMoney(financials.taxAmount)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>{t("summaryTotal")}</span>
              <span className="tabular-nums">{fmtMoney(financials.total)}</span>
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            {quote.paymentMethod === "on_credit"
              ? t("invoicePreviewOnCreditHint")
              : t("invoicePreviewQuoteInvoicedHint")}
          </p>
        </div>

        <div className="border-border flex shrink-0 flex-wrap justify-end gap-2 border-t px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
          >
            {t("invoicePreviewCancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <IconReceipt className="h-4 w-4" />
            {confirming ? t("creatingInvoice") : t("invoicePreviewConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
