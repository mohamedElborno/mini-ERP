"use client";

import { Component, type ErrorInfo, type ReactNode, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { AddDealDialog } from "@/components/deals/AddDealDialog";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";
import { DealsKanbanBoard } from "@/components/deals/DealsKanbanBoard";

// ─── Types ───────────────────────────────────────────────────────────────────

type DealStage = NonNullable<Doc<"deals">["stage"]>;

type EnrichedDeal = Doc<"deals"> & {
  contactName: string;
  companyName: string | null;
  currencySymbol?: string | null;
  currencyName?: string | null;
  valueInDefault?: number;
  defaultCurrencySymbol?: string | null;
};

// ─── Error Boundary ──────────────────────────────────────────────────────────

class DealsErrorBoundary extends Component<
  { children: ReactNode; fallbackTitle: string },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Deals page error:", error, info.componentStack);
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

const inputCls =
  "border-input bg-background text-foreground placeholder:text-muted-foreground " +
  "focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none " +
  "focus-visible:ring-2 disabled:opacity-50";

// ─── Loss Reason Dialog ──────────────────────────────────────────────────────

function LossReasonDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("dealsPage");
  const [reason, setReason] = useState("");

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm(reason.trim());
    setReason("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border-border w-full max-w-sm rounded-xl border p-6 shadow-xl">
        <h2 className="text-foreground mb-1 text-base font-semibold">
          {t("lossReasonTitle")}
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          {t("lossReasonHint")}
        </p>
        <textarea
          className={inputCls}
          rows={3}
          placeholder={t("lossReasonPlaceholder")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="border-border hover:bg-muted rounded-lg border px-4 py-1.5 text-sm transition-colors"
            onClick={onCancel}
          >
            {t("cancel")}
          </button>
          <button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg px-4 py-1.5 text-sm transition-colors"
            onClick={handleConfirm}
          >
            {t("confirmLost")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Cards ───────────────────────────────────────────────────────────────

function KpiCards({
  deals,
  locale,
}: {
  deals: EnrichedDeal[];
  locale: string;
}) {
  const t = useTranslations("dealsPage");

  const pipeline = deals
    .filter((d) => d.stage !== "won" && d.stage !== "lost")
    .reduce((sum, d) => sum + (d.valueInDefault ?? d.value ?? 0), 0);

  const wonCount = deals.filter((d) => d.stage === "won").length;
  const winRate =
    deals.length > 0 ? Math.round((wonCount / deals.length) * 100) : 0;

  const defaultSymbol =
    deals.find((d) => d.defaultCurrencySymbol)?.defaultCurrencySymbol ?? "";

  const moneyFmt = (n: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);

  const cards = [
    { label: t("kpiTotal"), value: deals.length.toString() },
    {
      label: t("kpiPipeline"),
      value: defaultSymbol
        ? `${moneyFmt(pipeline)} ${defaultSymbol}`
        : moneyFmt(pipeline),
    },
    { label: t("kpiWon"), value: wonCount.toString() },
    { label: t("kpiWinRate"), value: `${winRate}%` },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="border-border bg-card rounded-xl border p-4"
        >
          <p className="text-muted-foreground text-xs">{c.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Deals Query Body ─────────────────────────────────────────────────────────

function DealsQueryBody() {
  const t = useTranslations("dealsPage");
  const locale = useLocale();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();

  const { orgGroupFilter } = useOrgGroup();

  const deals = useQuery(
    api.deals.getDealsWithDetails,
    authLoading || !isAuthenticated ? "skip" : { orgGroupId: orgGroupFilter },
  ) as EnrichedDeal[] | undefined;

  const updateStage = useMutation(api.deals.updateDealStage);
  const [pendingId, setPendingId] = useState<Id<"deals"> | null>(null);
  const [lossTarget, setLossTarget] = useState<Id<"deals"> | null>(null);

  if (authLoading || !isAuthenticated || deals === undefined) {
    return (
      <div className="border-border bg-muted/30 h-48 animate-pulse rounded-xl border" />
    );
  }

  const applyStageChange = async (
    id: Id<"deals">,
    stage: DealStage,
    lossReason?: string,
  ) => {
    setPendingId(id);
    try {
      await updateStage({ id, stage, ...(lossReason ? { lossReason } : {}) });
      toast.success(t("stageUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setPendingId(null);
    }
  };

  const handleStageChange = (id: Id<"deals">, stage: DealStage) => {
    if (stage === "lost") {
      setLossTarget(id);
    } else {
      applyStageChange(id, stage);
    }
  };

  return (
    <>
      <KpiCards deals={deals} locale={locale} />
      <div className="border-border bg-card/30 rounded-2xl border p-3 shadow-sm">
        <p className="text-muted-foreground mb-3 px-1 text-xs">
          {t("kanbanHint")}
        </p>
        <DealsKanbanBoard
          deals={deals}
          onStageChange={handleStageChange}
          pendingId={pendingId}
        />
      </div>
      <LossReasonDialog
        open={lossTarget !== null}
        onConfirm={(reason) => {
          if (lossTarget) {
            applyStageChange(lossTarget, "lost", reason || undefined);
            setLossTarget(null);
          }
        }}
        onCancel={() => setLossTarget(null)}
      />
    </>
  );
}

// ─── Page Root ───────────────────────────────────────────────────────────────

export default function DealsPageClient() {
  const t = useTranslations("dealsPage");
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
          {t("createNewDeal")}
        </button>
      </div>

      {/* Add Deal Dialog */}
      <AddDealDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => setDialogOpen(false)}
      />

      {/* Deals List */}
      <DealsErrorBoundary fallbackTitle={t("errorTitle")}>
        <DealsQueryBody />
      </DealsErrorBoundary>
    </div>
  );
}
