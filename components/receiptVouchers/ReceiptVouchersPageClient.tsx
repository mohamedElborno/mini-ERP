"use client";

import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import {
  IconCash,
  IconHistory,
  IconPlus,
} from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { AddReceiptVoucherDialog } from "./AddReceiptVoucherDialog";
import { ReceiptVoucherAuditLogDialog } from "./ReceiptVoucherAuditLogDialog";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";
import {
  ListSearchInput,
  PageNavigationBar,
} from "@/components/ui/list-page-controls";
import { useConvexPagedQuery } from "@/lib/useConvexPagedQuery";

type VoucherListRow = Doc<"receiptVouchers"> & {
  companyName?: string;
  currencySymbol?: string | null;
};

class RvErrorBoundary extends Component<
  { children: ReactNode; fallbackTitle: string },
  { message: string | null }
> {
  state = { message: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { message: e.message };
  }
  componentDidCatch(e: Error, i: ErrorInfo) {
    console.error("Receipt vouchers page error:", e, i.componentStack);
  }
  render() {
    if (this.state.message) {
      return (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/10 text-destructive rounded-xl border p-4 text-sm"
        >
          <p className="font-medium">{this.props.fallbackTitle}</p>
          <p className="text-muted-foreground mt-1">{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function VouchersTable({
  vouchers,
  locale,
  defaultCurrencySymbol,
  onAudit,
}: {
  vouchers: VoucherListRow[];
  locale: string;
  defaultCurrencySymbol: string;
  onAudit: (id: Id<"receiptVouchers">) => void;
}) {
  const t = useTranslations("receiptVouchersPage");

  const dateFmt = (ms: number | undefined) =>
    ms == null
      ? "—"
      : new Date(ms).toLocaleDateString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

  if (vouchers.length === 0) {
    return (
      <div className="border-border bg-card/40 text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
        <IconCash className="mx-auto mb-3 h-8 w-8 opacity-30" />
        {t("empty")}
      </div>
    );
  }

  const textAlign = locale === "ar" ? "right" : "left";
  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <table className={`w-full min-w-[900px] text-${textAlign} text-sm`}>
          <thead className="border-border bg-muted/40 border-b">
            <tr>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colNumber")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colCompany")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colPaymentMethod")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colIssueDate")}
              </th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">
                {t("colAmount")}
              </th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">
                {t("colUsed")}
              </th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">
                {t("colRemaining")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colReferences")}
              </th>
              <th className="w-14 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {vouchers.map((v) => (
              <tr key={v._id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono font-medium">
                  {v.number ?? "—"}
                </td>
                <td className="text-muted-foreground px-4 py-3 text-xs">
                  {v.companyName ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs">
                  {t(`paymentMethod.${v.paymentMethod}`)}
                </td>
                <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                  {dateFmt(v.issueDate)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  <div>
                    {v.amount.toFixed(2)}
                    {v.currencySymbol ? ` ${v.currencySymbol}` : ""}
                  </div>
                  {v.amountInDefaultCurrency != null && v.currencySymbol && (
                    <div className="text-muted-foreground text-xs font-normal">
                      {t("amountInDefaultShort", {
                        amount: v.amountInDefaultCurrency.toFixed(2),
                        symbol: defaultCurrencySymbol,
                      })}
                    </div>
                  )}
                </td>
                <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                  {v.usedAmount.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {v.remainingAmount.toFixed(2)}
                </td>
                <td className="text-muted-foreground px-4 py-3 text-xs">
                  {v.references?.length ?? 0}
                </td>
                <td className="px-2 py-3">
                  <button
                    type="button"
                    onClick={() => onAudit(v._id)}
                    className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-lg p-2 hover:bg-muted"
                    title={t("auditLogOpenButton")}
                    aria-label={t("auditLogOpenButton")}
                  >
                    <IconHistory className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RvQueryBody({
  createOpen,
  onCloseCreate,
}: {
  createOpen: boolean;
  onCloseCreate: () => void;
}) {
  const t = useTranslations("receiptVouchersPage");
  const tList = useTranslations("listPages");
  const locale = useLocale();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();

  const { orgGroupFilter } = useOrgGroup();
  const currencies = useQuery(
    api.currencies.getCurrencies,
    authLoading || !isAuthenticated ? "skip" : { orgGroupId: orgGroupFilter },
  );
  const defaultCurrencySymbol =
    currencies?.find((c) => c.default)?.symbol ?? "—";
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const stats = useQuery(
    api.receiptVouchers.getReceiptVoucherListStats,
    authLoading || !isAuthenticated ? "skip" : { orgGroupId: orgGroupFilter },
  );

  const listArgs =
    authLoading || !isAuthenticated
      ? "skip"
      : {
          orgGroupId: orgGroupFilter,
          search: searchDebounced.trim() || undefined,
        };

  const pagination = useConvexPagedQuery<VoucherListRow>(
    api.receiptVouchers.listReceiptVouchersPaginated,
    listArgs,
    {
      totalItems: searchDebounced.trim() ? undefined : stats?.total,
    },
  );

  const [auditId, setAuditId] = useState<Id<"receiptVouchers"> | null>(null);

  if (
    authLoading ||
    !isAuthenticated ||
    stats === undefined ||
    pagination.isLoading
  ) {
    return (
      <div className="border-border bg-muted/30 h-48 animate-pulse rounded-xl border" />
    );
  }

  const kpiCards = [
    { label: t("kpiTotal"), value: stats.total },
    { label: t("kpiTotalAmount"), value: stats.totalAmount.toFixed(2) },
    { label: t("kpiUsed"), value: stats.totalUsed.toFixed(2) },
    { label: t("kpiRemaining"), value: stats.totalRemaining.toFixed(2) },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpiCards.map((c) => (
          <div
            key={c.label}
            className="border-border bg-card rounded-xl border p-4"
          >
            <p className="text-muted-foreground text-xs">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {c.value}
            </p>
          </div>
        ))}
      </div>
      <ListSearchInput
        value={searchInput}
        onChange={setSearchInput}
        placeholder={tList("searchVouchers")}
      />
      <VouchersTable
        vouchers={pagination.page}
        locale={locale}
        defaultCurrencySymbol={defaultCurrencySymbol}
        onAudit={(id) => setAuditId(id)}
      />
      <PageNavigationBar
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        rangeStart={pagination.rangeStart}
        rangeEnd={pagination.rangeEnd}
        totalItems={pagination.totalItems}
        pageSize={pagination.pageSize}
        onPageSizeChange={pagination.setPageSize}
        canGoPrev={pagination.canGoPrev}
        canGoNext={pagination.canGoNext}
        onPrev={pagination.goPrev}
        onNext={pagination.goNext}
      />
      <ReceiptVoucherAuditLogDialog
        open={auditId !== null}
        onClose={() => setAuditId(null)}
        voucherId={auditId}
      />
      <AddReceiptVoucherDialog
        open={createOpen}
        onClose={onCloseCreate}
      />
    </>
  );
}

export default function ReceiptVouchersPageClient() {
  const t = useTranslations("receiptVouchersPage");
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
        >
          <IconPlus className="h-4 w-4" />
          {t("createButton")}
        </button>
      </div>

      <RvErrorBoundary fallbackTitle={t("errorTitle")}>
        <RvQueryBody
          createOpen={createOpen}
          onCloseCreate={() => setCreateOpen(false)}
        />
      </RvErrorBoundary>
    </div>
  );
}
