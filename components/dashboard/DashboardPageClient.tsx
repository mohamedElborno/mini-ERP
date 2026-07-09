"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import {
  IconBuilding,
  IconCurrencyDollar,
  IconFileInvoice,
  IconFileText,
  IconListDetails,
  IconTrophy,
} from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { DashboardCreditRadialCard } from "@/components/dashboard/DashboardCreditRadialCard";
import { DashboardDealsRadialChart } from "@/components/dashboard/DashboardDealsRadialChart";
import { DashboardDocumentSummaryCard } from "@/components/dashboard/DashboardDocumentSummaryCard";
import {
  DashboardPeriodPicker,
  periodFromCustomRange,
  periodFromPreset,
  type DashboardPeriodSelection,
} from "@/components/dashboard/DashboardPeriodPicker";
import { DashboardRecentActivityTable } from "@/components/dashboard/DashboardRecentActivityTable";
import { DashboardSalesChart } from "@/components/dashboard/DashboardSalesChart";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";
import { cn } from "@/lib/utils";

export default function DashboardPageClient() {
  const t = useTranslations("dashboardHome");
  const locale = useLocale();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const { orgGroupFilter } = useOrgGroup();
  const [periodSelection, setPeriodSelection] =
    useState<DashboardPeriodSelection>({
      mode: "preset",
      preset: "30d",
    });

  const range = useMemo(() => {
    if (periodSelection.mode === "preset") {
      return periodFromPreset(periodSelection.preset);
    }
    return periodFromCustomRange(periodSelection.from, periodSelection.to);
  }, [periodSelection]);

  const metrics = useQuery(
    api.dashboard.getDashboardMetrics,
    authLoading || !isAuthenticated
      ? "skip"
      : { ...range, orgGroupId: orgGroupFilter },
  );

  const fmtMoney = (v: number | null | undefined) => {
    if (v == null) return "—";
    return v.toLocaleString(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const fmtInt = (v: number | null | undefined) => {
    if (v == null) return "—";
    return v.toLocaleString(locale);
  };

  if (authLoading || !isAuthenticated || metrics === undefined) {
    return (
      <div className="space-y-6 min-h-[calc(100vh-130px)]">
        <div className="bg-muted/40 h-10 max-w-md animate-pulse rounded-lg" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="border-border bg-muted/30 h-28 animate-pulse rounded-xl border"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="border-border bg-muted/30 h-[320px] animate-pulse rounded-xl border lg:col-span-3" />
          <div className="border-border bg-muted/30 h-[320px] animate-pulse rounded-xl border lg:col-span-1" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="border-border bg-muted/30 h-[220px] animate-pulse rounded-xl border" />
          <div className="border-border bg-muted/30 h-[220px] animate-pulse rounded-xl border" />
        </div>
        <div className="border-border bg-muted/30 h-64 animate-pulse rounded-xl border" />
      </div>
    );
  }

  return (
    <div className="space-y-8 min-h-[calc(100vh-122px)]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <DashboardPeriodPicker
        selection={periodSelection}
        onSelectionChange={setPeriodSelection}
        locale={locale}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<IconBuilding className="size-5" />}
          label={t("kpiClients")}
          value={fmtInt(metrics.clientsCount)}
          muted={!metrics.canReadCompanies}
        />
        <KpiCard
          icon={<IconListDetails className="size-5" />}
          label={t("kpiDeals")}
          value={fmtInt(metrics.dealsTotal)}
          muted={!metrics.canReadDeals}
        />
        <KpiCard
          icon={<IconTrophy className="size-5" />}
          label={t("kpiWonDeals")}
          value={fmtInt(metrics.wonDealsCount)}
          muted={!metrics.canReadDeals}
        />
        <KpiCard
          icon={<IconCurrencyDollar className="size-5" />}
          label={t("kpiPaidSales")}
          value={fmtMoney(metrics.paidSalesTotal)}
          muted={!metrics.canReadReceiptVouchers}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {metrics.canReadCompanies && metrics.creditSummary ? (
          <DashboardCreditRadialCard summary={metrics.creditSummary} />
        ) : (
          <div className="border-border text-muted-foreground flex min-h-[200px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm">
            {t("creditSummaryNoAccess")}
          </div>
        )}
        <KpiCard
          icon={<IconListDetails className="size-5" />}
          label={t("dealsTotalValue")}
          value={
            metrics.canReadDeals && metrics.dealsValueSummary
              ? fmtMoney(metrics.dealsValueSummary.totalValue)
              : "—"
          }
          muted={!metrics.canReadDeals}
        />
        <KpiCard
          icon={<IconTrophy className="size-5" />}
          label={t("dealsWonValue")}
          value={
            metrics.canReadDeals && metrics.dealsValueSummary
              ? fmtMoney(metrics.dealsValueSummary.wonValue)
              : "—"
          }
          muted={!metrics.canReadDeals}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="min-w-0 lg:col-span-3">
          {metrics.canReadReceiptVouchers ? (
            <DashboardSalesChart
              data={metrics.salesSeries}
              title={t("salesChartTitle")}
              description={t("salesChartDescription")}
              totalLabel={t("salesTotalLabel")}
              formattedTotal={fmtMoney(metrics.paidSalesTotal)}
              locale={locale}
              salesLegendLabel={t("salesLegend")}
            />
          ) : (
            <div className="border-border text-muted-foreground flex min-h-[280px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm">
              {t("salesChartNoAccess")}
            </div>
          )}
        </div>
        <div className="min-w-0 lg:col-span-1">
          {metrics.canReadDeals ? (
            <DashboardDealsRadialChart
              won={metrics.wonDealsCount ?? 0}
              lost={metrics.lostDealsCount ?? 0}
            />
          ) : (
            <div className="border-border text-muted-foreground flex min-h-[140px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm">
              {t("dealsRadialNoAccess")}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {metrics.canReadQuotes && metrics.quoteSummary ? (
          <DashboardDocumentSummaryCard
            title={t("quotesSummaryTitle")}
            description={t("quotesSummaryDescription")}
            icon={<IconFileText className="size-5" />}
            stats={metrics.quoteSummary}
            labels={{
              count: t("summaryCount"),
              totalValue: t("summaryTotalValue"),
              approved: t("summaryApproved"),
              cancelled: t("summaryCancelled"),
            }}
            formatMoney={fmtMoney}
            formatInt={fmtInt}
          />
        ) : (
          <div className="border-border text-muted-foreground flex min-h-[200px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm">
            {t("quotesSummaryNoAccess")}
          </div>
        )}

        {metrics.canReadInvoices && metrics.invoiceSummary ? (
          <DashboardDocumentSummaryCard
            title={t("invoicesSummaryTitle")}
            description={t("invoicesSummaryDescription")}
            icon={<IconFileInvoice className="size-5" />}
            stats={metrics.invoiceSummary}
            labels={{
              count: t("summaryCount"),
              totalValue: t("summaryTotalValue"),
              approved: t("summaryApproved"),
              cancelled: t("summaryCancelled"),
            }}
            formatMoney={fmtMoney}
            formatInt={fmtInt}
          />
        ) : (
          <div className="border-border text-muted-foreground flex min-h-[200px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm">
            {t("invoicesSummaryNoAccess")}
          </div>
        )}
      </div>

      {metrics.canReadActivity ? (
        <DashboardRecentActivityTable items={metrics.recentActivity} />
      ) : (
        <div className="border-border text-muted-foreground flex min-h-[160px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm">
          {t("activityNoAccess")}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  muted,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  muted: boolean;
}) {
  return (
    <div
      className={cn(
        "border-border bg-card rounded-xl border p-5 shadow-sm",
        muted && "opacity-70",
      )}
    >
      <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
