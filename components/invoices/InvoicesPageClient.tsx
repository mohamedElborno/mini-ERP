"use client";

import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconEye, IconCash, IconReceipt, IconList } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { InvoiceViewDialog } from "@/components/invoices/InvoiceViewDialog";
import { InvoiceReceiptVouchersDialog } from "@/components/invoices/InvoiceReceiptVouchersDialog";
import { AddReceiptVoucherDialog } from "@/components/receiptVouchers/AddReceiptVoucherDialog";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";
import {
  FilterableKpiCards,
  ListSearchInput,
  PageNavigationBar,
} from "@/components/ui/list-page-controls";
import {
  totalForStatusFilter,
  useConvexPagedQuery,
} from "@/lib/useConvexPagedQuery";

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = NonNullable<Doc<"invoices">["status"]>;
type InvoiceListRow = Doc<"invoices"> & {
  dealTitle?: string;
  companyName?: string | null;
};

const MANUAL_STATUSES = [
  "draft",
  "sent",
  "overdue",
  "void",
] as const;

type ManualInvoiceStatus = (typeof MANUAL_STATUSES)[number];

const PAYMENT_STATUSES: InvoiceStatus[] = ["paid", "partially_paid"];

// ─── Error Boundary ───────────────────────────────────────────────────────────

class InvoicesErrorBoundary extends Component<
  { children: ReactNode; fallbackTitle: string },
  { message: string | null }
> {
  state = { message: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { message: e.message };
  }
  componentDidCatch(e: Error, i: ErrorInfo) {
    console.error("Invoices page error:", e, i.componentStack);
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadgeClass(status: InvoiceStatus | undefined) {
  switch (status) {
    case "paid":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "sent":
      return "bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "partially_paid":
      return "bg-violet-500/15 text-violet-800 dark:text-violet-300";
    case "overdue":
      return "bg-amber-500/15 text-amber-900 dark:text-amber-200";
    case "void":
      return "bg-muted text-muted-foreground";
    case "draft":
    default:
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

// ─── Invoices Table ───────────────────────────────────────────────────────────

function InvoicesTable({
  invoices,
  locale,
  onStatusChange,
  onViewInvoice,
  onAddReceiptVoucher,
  onViewReceiptVouchers,
  pendingId,
}: {
  invoices: InvoiceListRow[];
  locale: string;
  onStatusChange: (id: Id<"invoices">, status: ManualInvoiceStatus) => void;
  onViewInvoice: (id: Id<"invoices">) => void;
  onAddReceiptVoucher: (id: Id<"invoices">) => void;
  onViewReceiptVouchers: (id: Id<"invoices">) => void;
  pendingId: Id<"invoices"> | null;
}) {
  const t = useTranslations("invoicesPage");

  const dateFmt = (ms: number | undefined) =>
    ms == null
      ? "—"
      : new Date(ms).toLocaleDateString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

  const moneyFmt = (n: number | undefined) =>
    n == null
      ? "—"
      : new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);

  if (invoices.length === 0) {
    return (
      <div className="border-border bg-card/40 text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
        <IconReceipt className="mx-auto mb-3 h-8 w-8 opacity-30" />
        {t("empty")}
      </div>
    );
  }

  const textAlign = locale === "ar" ? "right" : "left";
  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <table className={`w-full min-w-[800px] text-${textAlign} text-sm`}>
          <thead className="border-border bg-muted/40 border-b">
            <tr>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colNumber")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colDeal")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colStatus")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colIssueDate")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colDueDate")}
              </th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">
                {t("colTotal")}
              </th>
              <th className="w-28 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {invoices.map((inv) => {
              const status = inv.status ?? "draft";
              return (
                <tr
                  key={inv._id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="text-foreground font-mono font-medium">
                      {inv.number ?? "—"}
                    </span>
                    {inv.description && (
                      <p className="text-muted-foreground line-clamp-1 text-xs">
                        {inv.description}
                      </p>
                    )}
                  </td>

                  <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                    {inv.dealTitle ?? "—"}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}
                      >
                        {t(`status.${status}`)}
                      </span>
                      {inv.onCredit && (
                        <span className="inline-flex rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                          {t("onCreditBadge")}
                        </span>
                      )}
                      {!PAYMENT_STATUSES.includes(status) && (
                        <select
                          className="border-input bg-background text-foreground focus-visible:ring-ring max-w-[140px] rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2"
                          value={status}
                          disabled={pendingId === inv._id}
                          aria-label={t("changeStatus")}
                          onChange={(e) =>
                            onStatusChange(
                              inv._id,
                              e.target.value as ManualInvoiceStatus,
                            )
                          }
                        >
                          {MANUAL_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {t(`status.${s}`)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>

                  <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                    {dateFmt(inv.issueDate)}
                  </td>

                  <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                    {dateFmt(inv.dueDate)}
                  </td>

                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {moneyFmt(inv.total)}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onViewReceiptVouchers(inv._id)}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-muted"
                        title={t("viewReceiptVouchers")}
                        aria-label={t("viewReceiptVouchers")}
                      >
                        <IconList className="h-4 w-4" />
                      </button>
                      {status !== "void" && status !== "paid" && (
                        <button
                          type="button"
                          onClick={() => onAddReceiptVoucher(inv._id)}
                          className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-muted"
                          title={t("addReceiptVoucher")}
                          aria-label={t("addReceiptVoucher")}
                        >
                          <IconCash className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onViewInvoice(inv._id)}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-muted"
                        title={t("viewInvoice")}
                        aria-label={t("viewInvoice")}
                      >
                        <IconEye className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Query Body ───────────────────────────────────────────────────────────────

function InvoicesQueryBody({
  createReceiptVoucherOpen,
  receiptVoucherInvoiceId,
  onOpenCreateReceiptVoucher,
  onCloseCreateReceiptVoucher,
}: {
  createReceiptVoucherOpen: boolean;
  receiptVoucherInvoiceId: Id<"invoices"> | null;
  onOpenCreateReceiptVoucher: (invoiceId?: Id<"invoices">) => void;
  onCloseCreateReceiptVoucher: () => void;
}) {
  const t = useTranslations("invoicesPage");
  const tList = useTranslations("listPages");
  const locale = useLocale();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();

  const { orgGroupFilter } = useOrgGroup();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const stats = useQuery(
    api.invoices.getInvoiceListStats,
    authLoading || !isAuthenticated ? "skip" : { orgGroupId: orgGroupFilter },
  );

  const listArgs =
    authLoading || !isAuthenticated
      ? "skip"
      : {
          orgGroupId: orgGroupFilter,
          statusFilter: statusFilter === "all" ? undefined : statusFilter,
          search: searchDebounced.trim() || undefined,
        };

  const pagination = useConvexPagedQuery<InvoiceListRow>(
    api.invoices.listInvoicesPaginated,
    listArgs,
    {
      totalItems: searchDebounced.trim()
        ? undefined
        : totalForStatusFilter(stats, statusFilter),
    },
  );

  const updateInvoiceStatus = useMutation(api.invoices.updateInvoiceStatus);
  const [pendingId, setPendingId] = useState<Id<"invoices"> | null>(null);
  const [viewInvoiceId, setViewInvoiceId] = useState<Id<"invoices"> | null>(
    null,
  );
  const [receiptVouchersInvoiceId, setReceiptVouchersInvoiceId] =
    useState<Id<"invoices"> | null>(null);

  if (authLoading || !isAuthenticated || stats === undefined || pagination.isLoading) {
    return (
      <div className="border-border bg-muted/30 h-48 animate-pulse rounded-xl border" />
    );
  }

  const kpiCards = [
    { id: "all", label: tList("filterAll"), value: stats.total },
    { id: "draft", label: t("kpiDraft"), value: stats.draft },
    { id: "sent", label: t("kpiSent"), value: stats.sent },
    { id: "paid", label: t("kpiPaid"), value: stats.paid },
  ];

  const handleStatusChange = async (
    id: Id<"invoices">,
    status: ManualInvoiceStatus,
  ) => {
    setPendingId(id);
    try {
      await updateInvoiceStatus({ id, status });
      toast.success(t("statusUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <FilterableKpiCards
        cards={kpiCards}
        activeId={statusFilter}
        onSelect={setStatusFilter}
        columnsClassName="grid-cols-2 sm:grid-cols-4"
      />
      <ListSearchInput
        value={searchInput}
        onChange={setSearchInput}
        placeholder={tList("searchInvoices")}
      />
      <InvoicesTable
        invoices={pagination.page}
        locale={locale}
        onStatusChange={handleStatusChange}
        onViewInvoice={(id) => setViewInvoiceId(id)}
        onAddReceiptVoucher={(id) => onOpenCreateReceiptVoucher(id)}
        onViewReceiptVouchers={(id) => setReceiptVouchersInvoiceId(id)}
        pendingId={pendingId}
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
      <InvoiceViewDialog
        open={viewInvoiceId !== null}
        onClose={() => setViewInvoiceId(null)}
        invoiceId={viewInvoiceId}
        onViewReceiptVouchers={(id) => {
          setViewInvoiceId(null);
          setReceiptVouchersInvoiceId(id);
        }}
      />
      <InvoiceReceiptVouchersDialog
        open={receiptVouchersInvoiceId !== null}
        onClose={() => setReceiptVouchersInvoiceId(null)}
        invoiceId={receiptVouchersInvoiceId}
        onAddReceiptVoucher={(id) => onOpenCreateReceiptVoucher(id)}
      />
      <AddReceiptVoucherDialog
        open={createReceiptVoucherOpen}
        onClose={onCloseCreateReceiptVoucher}
        defaultInvoiceId={receiptVoucherInvoiceId ?? undefined}
      />
    </>
  );
}

// ─── Page Root ────────────────────────────────────────────────────────────────

export default function InvoicesPageClient() {
  const t = useTranslations("invoicesPage");
  const [receiptVoucherInvoiceId, setReceiptVoucherInvoiceId] =
    useState<Id<"invoices"> | null>(null);
  const [createReceiptVoucherOpen, setCreateReceiptVoucherOpen] = useState(false);

  const openCreateReceiptVoucher = (invoiceId?: Id<"invoices">) => {
    setReceiptVoucherInvoiceId(invoiceId ?? null);
    setCreateReceiptVoucherOpen(true);
  };

  const closeCreateReceiptVoucher = () => {
    setCreateReceiptVoucherOpen(false);
    setReceiptVoucherInvoiceId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => openCreateReceiptVoucher()}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
        >
          <IconCash className="h-4 w-4" />
          {t("addReceiptVoucherTitle")}
        </button>
      </div>

      <InvoicesErrorBoundary fallbackTitle={t("errorTitle")}>
        <InvoicesQueryBody
          createReceiptVoucherOpen={createReceiptVoucherOpen}
          receiptVoucherInvoiceId={receiptVoucherInvoiceId}
          onOpenCreateReceiptVoucher={openCreateReceiptVoucher}
          onCloseCreateReceiptVoucher={closeCreateReceiptVoucher}
        />
      </InvoicesErrorBoundary>
    </div>
  );
}
