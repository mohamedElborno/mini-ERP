"use client";

import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconFileInvoice, IconEye, IconHistory } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { AddQuoteDialog } from "@/components/quotes/AddQuoteDialog";
import { QuoteAuditLogDialog } from "@/components/quotes/QuoteAuditLogDialog";
import { QuoteViewEditDialog } from "@/components/quotes/QuoteViewEditDialog";
import { formatQuoteWithRevision } from "@/lib/quoteDisplay";
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

type QuoteStatus = NonNullable<Doc<"quotes">["status"]>;
type QuoteListRow = Doc<"quotes"> & {
  dealTitle?: string;
  companyName?: string | null;
};

const STATUSES = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
] as const;

type ManualQuoteStatus = (typeof STATUSES)[number];

// ─── Error Boundary ───────────────────────────────────────────────────────────

class QuotesErrorBoundary extends Component<
  { children: ReactNode; fallbackTitle: string },
  { message: string | null }
> {
  state = { message: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { message: e.message };
  }
  componentDidCatch(e: Error, i: ErrorInfo) {
    console.error("Quotes page error:", e, i.componentStack);
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

function statusBadgeClass(status: QuoteStatus | undefined) {
  switch (status) {
    case "invoiced":
      return "bg-violet-500/15 text-violet-800 dark:text-violet-300";
    case "accepted":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "rejected":
      return "bg-destructive/15 text-destructive";
    case "sent":
      return "bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "expired":
      return "bg-muted text-muted-foreground";
    case "draft":
    default:
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

// ─── Quotes Table ─────────────────────────────────────────────────────────────

function QuotesTable({
  quotes,
  locale,
  onStatusChange,
  onViewQuote,
  onOpenAudit,
  pendingId,
}: {
  quotes: QuoteListRow[];
  locale: string;
  onStatusChange: (id: Id<"quotes">, status: ManualQuoteStatus) => void;
  onViewQuote: (id: Id<"quotes">, dealTitle: string) => void;
  onOpenAudit: (id: Id<"quotes">) => void;
  pendingId: Id<"quotes"> | null;
}) {
  const t = useTranslations("quotesPage");

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

  if (quotes.length === 0) {
    return (
      <div className="border-border bg-card/40 text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
        <IconFileInvoice className="mx-auto mb-3 h-8 w-8 opacity-30" />
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
                {t("colExpiry")}
              </th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">
                {t("colTotal")}
              </th>
              <th className="w-24 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {quotes.map((quote) => {
              const status = quote.status ?? "draft";
              const isInvoicedLocked =
                quote.invoiced === true || quote.status === "invoiced";
              return (
                <tr
                  key={quote._id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  {/* Number */}
                  <td className="px-4 py-3">
                    <span className="text-foreground font-mono font-medium">
                      {formatQuoteWithRevision(quote.number, quote.revision)}
                    </span>
                    {quote.description && (
                      <p className="text-muted-foreground line-clamp-1 text-xs">
                        {quote.description}
                      </p>
                    )}
                  </td>

                  {/* Deal */}
                  <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                    {quote.dealTitle ?? "—"}
                  </td>

                  {/* Status badge + changer */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}
                      >
                        {t(`status.${status}`)}
                      </span>
                      {isInvoicedLocked ? null : (
                        <select
                          className="border-input bg-background text-foreground focus-visible:ring-ring max-w-[120px] rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2"
                          value={status}
                          disabled={pendingId === quote._id}
                          aria-label={t("changeStatus")}
                          onChange={(e) =>
                            onStatusChange(
                              quote._id,
                              e.target.value as ManualQuoteStatus,
                            )
                          }
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {t(`status.${s}`)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>

                  {/* Issue date */}
                  <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                    {dateFmt(quote.issueDate)}
                  </td>

                  {/* Expiry date */}
                  <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                    {dateFmt(quote.expirationDate)}
                  </td>

                  {/* Total */}
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {moneyFmt(quote.total)}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => onOpenAudit(quote._id)}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-muted"
                        title={t("auditLogOpenButton")}
                        aria-label={t("auditLogOpenButton")}
                      >
                        <IconHistory className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onViewQuote(quote._id, quote.dealTitle ?? "—")}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-muted"
                        title={t("viewQuote")}
                        aria-label={t("viewQuote")}
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

// ─── Quotes Query Body ────────────────────────────────────────────────────────

function QuotesQueryBody() {
  const t = useTranslations("quotesPage");
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
    api.quotes.getQuoteListStats,
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

  const pagination = useConvexPagedQuery<QuoteListRow>(
    api.quotes.listQuotesPaginated,
    listArgs,
    {
      totalItems: searchDebounced.trim()
        ? undefined
        : totalForStatusFilter(stats, statusFilter),
    },
  );

  const updateQuote = useMutation(api.quotes.updateQuote);
  const [pendingId, setPendingId] = useState<Id<"quotes"> | null>(null);
  const [quoteDetail, setQuoteDetail] = useState<{
    id: Id<"quotes">;
    dealTitle: string;
  } | null>(null);
  const [auditQuoteId, setAuditQuoteId] = useState<Id<"quotes"> | null>(null);

  if (authLoading || !isAuthenticated || stats === undefined || pagination.isLoading) {
    return (
      <div className="border-border bg-muted/30 h-48 animate-pulse rounded-xl border" />
    );
  }

  const kpiCards = [
    { id: "all", label: tList("filterAll"), value: stats.total },
    { id: "draft", label: t("kpiDraft"), value: stats.draft },
    { id: "sent", label: t("kpiSent"), value: stats.sent },
    { id: "accepted", label: t("kpiAccepted"), value: stats.accepted },
    { id: "invoiced", label: t("kpiInvoiced"), value: stats.invoiced },
  ];

  const handleStatusChange = async (
    id: Id<"quotes">,
    status: ManualQuoteStatus,
  ) => {
    setPendingId(id);
    try {
      await updateQuote({ id, status });
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
      />
      <ListSearchInput
        value={searchInput}
        onChange={setSearchInput}
        placeholder={tList("searchQuotes")}
      />
      <QuotesTable
        quotes={pagination.page}
        locale={locale}
        onStatusChange={handleStatusChange}
        onViewQuote={(id, dealTitle) => setQuoteDetail({ id, dealTitle })}
        onOpenAudit={setAuditQuoteId}
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
      <QuoteViewEditDialog
        open={quoteDetail !== null}
        onClose={() => setQuoteDetail(null)}
        quoteId={quoteDetail?.id ?? null}
        dealTitle={quoteDetail?.dealTitle ?? ""}
        onOpenActivityLog={() => {
          if (quoteDetail) setAuditQuoteId(quoteDetail.id);
        }}
      />
      <QuoteAuditLogDialog
        open={auditQuoteId !== null}
        onClose={() => setAuditQuoteId(null)}
        quoteId={auditQuoteId}
      />
    </>
  );
}

// ─── Page Root ────────────────────────────────────────────────────────────────

export default function QuotesPageClient() {
  const t = useTranslations("quotesPage");
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
        </div>
        <button
          className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          onClick={() => setDialogOpen(true)}
        >
          {t("addQuote")}
        </button>
      </div>

      <AddQuoteDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => setDialogOpen(false)}
      />

      <QuotesErrorBoundary fallbackTitle={t("errorTitle")}>
        <QuotesQueryBody />
      </QuotesErrorBoundary>
    </div>
  );
}
