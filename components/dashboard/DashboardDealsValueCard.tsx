"use client";

import { IconTrophy } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface DealsValueSummary {
  totalValue: number;
  wonValue: number;
  wonInvoicesValue: number | null;
}

interface Props {
  dealsTotal: number | null;
  wonDealsCount: number | null;
  lostDealsCount: number | null;
  dealsValueSummary: DealsValueSummary | null;
  formatMoney: (v: number | null | undefined) => string;
  formatInt: (v: number | null | undefined) => string;
}

export function DashboardDealsValueCard({
  dealsTotal,
  wonDealsCount,
  lostDealsCount,
  dealsValueSummary,
  formatMoney,
  formatInt,
}: Props) {
  const t = useTranslations("dashboardHome");

  const total = dealsTotal ?? 0;
  const won = wonDealsCount ?? 0;
  const lost = lostDealsCount ?? 0;
  const inProgress = Math.max(0, total - won - lost);
  const closed = won + lost;
  const winRate = closed > 0 ? Math.round((won / closed) * 100) : null;

  const wonInvoicesValue = dealsValueSummary?.wonInvoicesValue ?? null;
  const diff =
    wonInvoicesValue != null && dealsValueSummary != null
      ? wonInvoicesValue - dealsValueSummary.wonValue
      : null;

  return (
    <div className="border-border bg-card rounded-xl border p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <IconTrophy className="text-muted-foreground size-4" />
        <span className="text-sm font-medium text-muted-foreground">
          {t("dealsPerformanceTitle")}
        </span>
        {winRate != null && (
          <span className="text-muted-foreground border-border ms-auto rounded-md border px-2 py-0.5 text-xs">
            {t("dealsWinRateBadge", { rate: winRate })}
          </span>
        )}
      </div>

      {/* 3 value columns — border-s is RTL-aware (left in LTR, right in RTL) */}
      <div className="grid grid-cols-3">
        <ValueItem
          label={t("dealsPipelineValue")}
          value={formatMoney(dealsValueSummary?.totalValue)}
          className="pe-4"
        />
        <ValueItem
          label={t("dealsWonExpectedValue")}
          value={formatMoney(dealsValueSummary?.wonValue)}
          className="border-border border-s px-4"
        />
        <ValueItem
          label={t("dealsWonActualValue")}
          value={wonInvoicesValue != null ? formatMoney(wonInvoicesValue) : "—"}
          className="border-border border-s ps-4"
          hint={
            diff != null
              ? diff > 0.5
                ? t("dealsActualHigher", { diff: formatMoney(diff) })
                : diff < -0.5
                  ? t("dealsActualLower", { diff: formatMoney(Math.abs(diff)) })
                  : t("dealsActualMatch")
              : undefined
          }
        />
      </div>

      {/* Footer count badges */}
      <div className="border-border mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t pt-4">
        <CountStat label={t("dealsTotalCountLabel")} value={formatInt(total)} />
        <CountStat
          label={t("dealsWonCountLabel")}
          value={formatInt(won)}
          accent="positive"
        />
        <CountStat
          label={t("dealsInProgressLabel")}
          value={formatInt(inProgress)}
        />
        <CountStat
          label={t("dealsLostCountLabel")}
          value={formatInt(lost)}
          accent="negative"
        />
      </div>
    </div>
  );
}

function ValueItem({
  label,
  value,
  className,
  hint,
}: {
  label: string;
  value: string;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-muted-foreground mb-1 truncate text-xs">{label}</p>
      <p className="text-foreground truncate text-xl font-semibold tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="text-muted-foreground mt-0.5 truncate text-xs">{hint}</p>
      )}
    </div>
  );
}

function CountStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "positive" | "negative";
}) {
  return (
    <span className="text-muted-foreground flex items-baseline gap-1 text-sm">
      <span>{label}:</span>
      <span
        className={cn(
          "font-semibold",
          accent === "positive" && "text-emerald-600 dark:text-emerald-400",
          accent === "negative" && "text-rose-600 dark:text-rose-400",
          !accent && "text-foreground",
        )}
      >
        {value}
      </span>
    </span>
  );
}
