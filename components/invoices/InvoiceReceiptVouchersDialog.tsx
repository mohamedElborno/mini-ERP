"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { IconCash, IconPlus, IconX } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

type Props = {
  open: boolean;
  onClose: () => void;
  invoiceId: Id<"invoices"> | null;
  onAddReceiptVoucher?: (invoiceId: Id<"invoices">) => void;
};

function allocationForInvoice(
  voucher: Doc<"receiptVouchers">,
  invoiceId: Id<"invoices">,
) {
  return (voucher.allocations ?? []).find((a) => a.invoiceId === invoiceId)
    ?.amount;
}

export function InvoiceReceiptVouchersDialog({
  open,
  onClose,
  invoiceId,
  onAddReceiptVoucher,
}: Props) {
  const t = useTranslations("invoicesPage");
  const trv = useTranslations("receiptVouchersPage");
  const locale = useLocale();

  const paymentInfo = useQuery(
    api.receiptVouchers.getInvoicePaymentInfo,
    open && invoiceId ? { invoiceId } : "skip",
  );

  const vouchers = useQuery(
    api.receiptVouchers.getReceiptVouchers,
    open && invoiceId ? { invoiceId } : "skip",
  ) as Doc<"receiptVouchers">[] | undefined;

  if (!open || !invoiceId) return null;

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

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 min-h-screen min-w-screen bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="bg-card border-border relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border shadow-2xl"
        role="dialog"
        aria-labelledby="invoice-rv-title"
      >
        <div className="border-border flex shrink-0 items-center gap-3 border-b px-5 py-4">
          <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <IconCash className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="invoice-rv-title" className="text-base font-semibold">
              {t("linkedReceiptVouchersTitle")}
            </h2>
            {paymentInfo && (
              <p className="text-muted-foreground font-mono text-xs">
                {paymentInfo.number ?? "—"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5"
            aria-label={t("invoiceViewClose")}
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {paymentInfo && (
          <div className="border-border bg-muted/20 grid grid-cols-3 gap-3 border-b px-5 py-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">{t("colTotal")}</p>
              <p className="font-semibold tabular-nums">
                {fmtMoney(paymentInfo.total)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">
                {t("paidAmount")}
              </p>
              <p className="font-semibold tabular-nums">
                {fmtMoney(paymentInfo.paidTotal)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">
                {t("outstandingAmount")}
              </p>
              <p className="font-semibold tabular-nums">
                {fmtMoney(paymentInfo.outstanding)}
              </p>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {vouchers === undefined && (
            <p className="text-muted-foreground text-sm">
              {t("invoiceDetailLoading")}
            </p>
          )}

          {vouchers?.length === 0 && (
            <p className="text-muted-foreground text-center text-sm">
              {t("linkedReceiptVouchersEmpty")}
            </p>
          )}

          {vouchers && vouchers.length > 0 && (
            <ul className="space-y-3">
              {vouchers.map((v) => {
                const allocated = allocationForInvoice(v, invoiceId);
                return (
                  <li
                    key={v._id}
                    className="border-border rounded-xl border p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono font-medium">
                        {v.number ?? "—"}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {fmtDate(v.issueDate)}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">
                          {trv("colAmount")}:{" "}
                        </span>
                        <span className="tabular-nums">
                          {fmtMoney(v.amount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          {t("allocatedToInvoice")}:{" "}
                        </span>
                        <span className="tabular-nums font-medium">
                          {fmtMoney(allocated)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          {trv("colPaymentMethod")}:{" "}
                        </span>
                        {trv(`paymentMethod.${v.paymentMethod}`)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          {trv("colRemaining")}:{" "}
                        </span>
                        <span className="tabular-nums">
                          {fmtMoney(v.remainingAmount)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-border flex shrink-0 justify-end gap-2 border-t px-5 py-3">
          {onAddReceiptVoucher &&
            paymentInfo &&
            paymentInfo.outstanding > 0 && (
              <button
                type="button"
                onClick={() => {
                  onAddReceiptVoucher(invoiceId);
                  onClose();
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
              >
                <IconPlus className="h-4 w-4" />
                {t("addReceiptVoucher")}
              </button>
            )}
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
