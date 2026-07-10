"use client";

import { useLocale, useTranslations } from "next-intl";
import { useConvexAuth, useQuery } from "convex/react";
import { IconReceipt, IconList, IconX } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatQuoteWithRevision } from "@/lib/quoteDisplay";
import { labelCls } from "@/components/quotes/quoteFormShared";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";
import { PrintDocumentButton } from "@/components/print/PrintDocumentButton";

type Props = {
  open: boolean;
  onClose: () => void;
  invoiceId: Id<"invoices"> | null;
  onViewReceiptVouchers?: (invoiceId: Id<"invoices">) => void;
};

export function InvoiceViewDialog({
  open,
  onClose,
  invoiceId,
  onViewReceiptVouchers,
}: Props) {
  const t = useTranslations("invoicesPage");
  const tq = useTranslations("quotesPage");
  const locale = useLocale();
  const { isAuthenticated } = useConvexAuth();
  const { orgGroupFilter } = useOrgGroup();

  const detail = useQuery(
    api.invoices.getInvoiceWithDetails,
    open && invoiceId ? { id: invoiceId } : "skip",
  );

  const invoice = detail?.invoice;
  const catalogOrgGroupId = invoice?.group ?? orgGroupFilter;

  const products = useQuery(
    api.products.getProducts,
    open && invoiceId && isAuthenticated
      ? { orgGroupId: catalogOrgGroupId }
      : "skip",
  );
  const services = useQuery(
    api.services.getServices,
    open && invoiceId && isAuthenticated
      ? { orgGroupId: catalogOrgGroupId }
      : "skip",
  );
  const currencies = useQuery(
    api.currencies.getCurrencies,
    open && invoiceId && isAuthenticated
      ? { orgGroupId: catalogOrgGroupId }
      : "skip",
  );

  const paymentInfo = useQuery(
    api.receiptVouchers.getInvoicePaymentInfo,
    open && invoiceId && isAuthenticated ? { invoiceId } : "skip",
  );

  const linkedVouchers = useQuery(
    api.receiptVouchers.getReceiptVouchers,
    open && invoiceId && isAuthenticated ? { invoiceId } : "skip",
  );

  const currencyRow = currencies?.find((c) => c._id === invoice?.currency);

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

  const productLabel = (id: Id<"products">) =>
    products?.find((p) => p._id === id)?.name ?? String(id);

  const serviceLabel = (id: Id<"services">) =>
    services?.find((s) => s._id === id)?.name ?? String(id);

  if (!open || !invoiceId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 min-h-screen min-w-screen bg-black/60 backdrop-blur-sm"
        aria-label={t("invoiceViewCloseBackdrop")}
        onClick={onClose}
      />
      <div
        className="bg-card border-border relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border shadow-2xl"
        role="dialog"
        aria-labelledby="invoice-view-title"
      >
        <div className="border-border flex shrink-0 items-start gap-3 border-b px-5 py-4">
          <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <IconReceipt className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="invoice-view-title"
              className="text-base font-semibold leading-tight"
            >
              {t("invoiceDetailTitle")}
            </h2>
            {invoice && (
              <p className="text-muted-foreground mt-1 font-mono text-xs">
                {invoice.number ?? "—"}
                {detail?.dealTitle ? ` · ${detail.dealTitle}` : ""}
              </p>
            )}
          </div>
          {invoiceId && <PrintDocumentButton type="invoice" id={invoiceId} size="sm" />}
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 rounded-lg p-1.5 transition-colors"
            aria-label={tq("createCancel")}
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {detail === undefined && (
            <p className="text-muted-foreground">{t("invoiceDetailLoading")}</p>
          )}
          {detail === null && (
            <p className="text-destructive">{t("invoiceDetailNotFound")}</p>
          )}

          {invoice && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className={labelCls}>{t("colStatus")}</p>
                  <p className="text-foreground">
                    {t(`status.${invoice.status ?? "draft"}`)}
                  </p>
                </div>
                <div>
                  <p className={labelCls}>{tq("invoicePreviewCurrency")}</p>
                  <p className="text-foreground">
                    {currencyRow
                      ? `${currencyRow.symbol ?? ""} ${currencyRow.name}`.trim()
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className={labelCls}>{tq("createIssueDate")}</p>
                  <p className="text-foreground">
                    {fmtDate(invoice.issueDate)}
                  </p>
                </div>
                <div>
                  <p className={labelCls}>{tq("createDueDate")}</p>
                  <p className="text-foreground">{fmtDate(invoice.dueDate)}</p>
                </div>
                {(detail?.quoteNumber || detail?.quoteRevision != null) && (
                  <div className="sm:col-span-2">
                    <p className={labelCls}>{t("linkedQuote")}</p>
                    <p className="text-foreground font-mono">
                      {formatQuoteWithRevision(
                        detail.quoteNumber ?? "",
                        detail.quoteRevision,
                      )}
                    </p>
                  </div>
                )}
                {invoice.description && (
                  <div className="sm:col-span-2">
                    <p className={labelCls}>{tq("createDescription")}</p>
                    <p className="text-foreground whitespace-pre-wrap">
                      {invoice.description}
                    </p>
                  </div>
                )}
              </div>

              {invoice.lineItems && invoice.lineItems.length > 0 && (
                <div>
                  <p className="mb-2 font-medium">{tq("lineItemsTitle")}</p>
                  <div className="border-border max-h-52 overflow-x-auto overflow-y-auto rounded-lg border">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-start font-medium">
                            {tq("colProduct")}
                          </th>
                          <th className="px-3 py-2 text-end font-medium">
                            {tq("colQty")}
                          </th>
                          <th className="px-3 py-2 text-end font-medium">
                            {tq("colUnitPrice")}
                          </th>
                          <th className="px-3 py-2 text-end font-medium">
                            {tq("invoicePreviewColSubtotalExTax")}
                          </th>
                          <th className="px-3 py-2 text-end font-medium">
                            {tq("invoicePreviewColLineTax")}
                          </th>
                          <th className="px-3 py-2 text-end font-medium">
                            {tq("invoicePreviewColTotalInclTax")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-border divide-y">
                        {invoice.lineItems.map((row, i) => (
                          <tr key={i}>
                            <td className="text-foreground max-w-[160px] truncate px-3 py-2">
                              {productLabel(row.product)}
                            </td>
                            <td className="text-foreground px-3 py-2 text-end tabular-nums">
                              {row.quantity}
                            </td>
                            <td className="text-foreground px-3 py-2 text-end tabular-nums">
                              {fmtMoney(row.priceAfterDiscount ?? row.price)}
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

              {invoice.services && invoice.services.length > 0 && (
                <div>
                  <p className="mb-2 font-medium">
                    {tq("invoicePreviewServices")}
                  </p>
                  <div className="border-border max-h-44 overflow-x-auto overflow-y-auto rounded-lg border">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-start font-medium">
                            {tq("invoicePreviewServiceName")}
                          </th>
                          <th className="px-3 py-2 text-end font-medium">
                            {tq("colQty")}
                          </th>
                          <th className="px-3 py-2 text-end font-medium">
                            {tq("colUnitPrice")}
                          </th>
                          <th className="px-3 py-2 text-end font-medium">
                            {tq("invoicePreviewColSubtotalExTax")}
                          </th>
                          <th className="px-3 py-2 text-end font-medium">
                            {tq("invoicePreviewColLineTax")}
                          </th>
                          <th className="px-3 py-2 text-end font-medium">
                            {tq("invoicePreviewColTotalInclTax")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-border divide-y">
                        {invoice.services.map((row, i) => (
                          <tr key={i}>
                            <td className="text-foreground max-w-[160px] truncate px-3 py-2">
                              {serviceLabel(row.service)}
                            </td>
                            <td className="text-foreground px-3 py-2 text-end tabular-nums">
                              {row.quantity}
                            </td>
                            <td className="text-foreground px-3 py-2 text-end tabular-nums">
                              {fmtMoney(row.priceAfterDiscount ?? row.price)}
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
                    {tq("summarySubtotal")}
                  </span>
                  <span className="tabular-nums">
                    {fmtMoney(invoice.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {tq("generalDiscount")}
                  </span>
                  <span className="tabular-nums">
                    {fmtMoney(invoice.discount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {tq("shippingAmount")}
                  </span>
                  <span className="tabular-nums">
                    {fmtMoney(invoice.shippingAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {tq("summaryTax")}
                  </span>
                  <span className="tabular-nums">
                    {fmtMoney(invoice.taxAmount)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>{tq("summaryTotal")}</span>
                  <span className="tabular-nums">
                    {fmtMoney(invoice.total)}
                  </span>
                </div>
              </div>

              {(paymentInfo || (linkedVouchers && linkedVouchers.length > 0)) && (
                <div className="border-border space-y-3 rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{t("linkedReceiptVouchersTitle")}</p>
                    {onViewReceiptVouchers && invoiceId && (
                      <button
                        type="button"
                        onClick={() => onViewReceiptVouchers(invoiceId)}
                        className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium"
                      >
                        <IconList className="h-3.5 w-3.5" />
                        {t("viewReceiptVouchers")}
                      </button>
                    )}
                  </div>
                  {paymentInfo && (
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <p className={labelCls}>{t("paidAmount")}</p>
                        <p className="tabular-nums font-medium">
                          {fmtMoney(paymentInfo.paidTotal)}
                        </p>
                      </div>
                      <div>
                        <p className={labelCls}>{t("outstandingAmount")}</p>
                        <p className="tabular-nums font-medium">
                          {fmtMoney(paymentInfo.outstanding)}
                        </p>
                      </div>
                      <div>
                        <p className={labelCls}>{t("receiptVoucherCount")}</p>
                        <p className="font-medium">
                          {linkedVouchers?.length ?? 0}
                        </p>
                      </div>
                    </div>
                  )}
                  {linkedVouchers && linkedVouchers.length > 0 && (
                    <ul className="space-y-2">
                      {linkedVouchers.map((v) => (
                        <li
                          key={v._id}
                          className="bg-muted/20 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
                        >
                          <span className="font-mono">{v.number ?? "—"}</span>
                          <span className="text-muted-foreground tabular-nums text-xs">
                            {fmtMoney(
                              (v.allocations ?? []).find(
                                (a) => a.invoiceId === invoiceId,
                              )?.amount,
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {linkedVouchers?.length === 0 && (
                    <p className="text-muted-foreground text-sm">
                      {t("linkedReceiptVouchersEmpty")}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-border flex shrink-0 justify-end border-t px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm"
          >
            {t("invoiceViewClose")}
          </button>
        </div>
      </div>
    </div>
  );
}
