"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import {
  IconBuilding,
  IconCurrencyDollar,
  IconFileInvoice,
  IconFileText,
  IconReceipt,
  IconUserCheck,
} from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { DashboardCreditRadialCard } from "@/components/dashboard/DashboardCreditRadialCard";
import { DashboardDealsValueCard } from "@/components/dashboard/DashboardDealsValueCard";
import { DashboardDocumentSummaryCard } from "@/components/dashboard/DashboardDocumentSummaryCard";
import {
  DashboardPeriodPicker,
  periodFromCustomRange,
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

  const queryArgs = useMemo(() => {
    if (periodSelection.mode === "preset") {
      return {
        periodPreset: periodSelection.preset,
        orgGroupId: orgGroupFilter,
      };
    }
    const range = periodFromCustomRange(
      periodSelection.from,
      periodSelection.to,
    );
    return {
      periodStart: range.periodStart,
      periodEnd: range.periodEnd,
      orgGroupId: orgGroupFilter,
    };
  }, [periodSelection, orgGroupFilter]);

  const metrics = useQuery(
    api.dashboard.getDashboardMetrics,
    authLoading || !isAuthenticated ? "skip" : queryArgs,
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
        <div className="border-border bg-muted/30 h-40 animate-pulse rounded-xl border" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="border-border bg-muted/30 h-[300px] animate-pulse rounded-xl border lg:col-span-2" />
          <div className="border-border bg-muted/30 h-[300px] animate-pulse rounded-xl border" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6">
            <div className="border-border bg-muted/30 h-[180px] animate-pulse rounded-xl border" />
            <div className="border-border bg-muted/30 h-[180px] animate-pulse rounded-xl border" />
          </div>
          <div className="border-border bg-muted/30 h-[380px] animate-pulse rounded-xl border lg:col-span-2" />
        </div>
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

      {/* Top KPIs: 4 cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<IconBuilding className="size-5" />}
          label={t("kpiClients")}
          value={fmtInt(metrics.clientsCount)}
          muted={!metrics.canReadCompanies}
          hint={t("kpiClientsHint")}
        />
        <KpiCard
          icon={<IconUserCheck className="size-5" />}
          label={t("kpiActiveClients")}
          value={fmtInt(metrics.activeClientsCount)}
          muted={
            !metrics.canReadDeals &&
            !metrics.canReadInvoices &&
            !metrics.canReadQuotes &&
            !metrics.canReadReceiptVouchers
          }
          hint={t("kpiActiveClientsHint")}
        />
        <KpiCard
          icon={<IconCurrencyDollar className="size-5" />}
          label={t("kpiPaidSales")}
          value={fmtMoney(metrics.paidSalesTotal)}
          muted={!metrics.canReadReceiptVouchers}
          hint={t("kpiPaidSalesHint")}
        />
        <KpiCard
          icon={<IconReceipt className="size-5" />}
          label={t("kpiReceiptVouchers")}
          value={fmtInt(metrics.receiptVouchersCount)}
          muted={!metrics.canReadReceiptVouchers}
          hint={t("kpiReceiptVouchersHint")}
        />
      </div>

      {/* Deals unified card */}
      {metrics.canReadDeals ? (
        <DashboardDealsValueCard
          dealsTotal={metrics.dealsTotal}
          wonDealsCount={metrics.wonDealsCount}
          lostDealsCount={metrics.lostDealsCount}
          dealsValueSummary={metrics.dealsValueSummary}
          formatMoney={fmtMoney}
          formatInt={fmtInt}
        />
      ) : (
        <div className="border-border text-muted-foreground flex min-h-[140px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm">
          {t("dealsValueNoAccess")}
        </div>
      )}

      {/* Chart + Credit side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
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
        <div className="min-w-0">
          {metrics.canReadCompanies && metrics.creditSummary ? (
            <DashboardCreditRadialCard summary={metrics.creditSummary} />
          ) : (
            <div className="border-border text-muted-foreground flex min-h-[200px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm">
              {t("creditSummaryNoAccess")}
            </div>
          )}
        </div>
      </div>

      {/* Documents (quotes + invoices) beside activity */}
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
        {/* Quotes and invoices stacked */}
        <div className="flex flex-col gap-6">
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
            <div className="border-border text-muted-foreground flex min-h-[180px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm">
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
            <div className="border-border text-muted-foreground flex min-h-[180px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm">
              {t("invoicesSummaryNoAccess")}
            </div>
          )}
        </div>

        {/* Activity table — h-full so the card stretches to match the stacked cards */}
        <div className="min-w-0 lg:col-span-2 lg:h-full">
          {metrics.canReadActivity ? (
            <DashboardRecentActivityTable items={metrics.recentActivity} />
          ) : (
            <div className="border-border text-muted-foreground flex min-h-[160px] items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm">
              {t("activityNoAccess")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  muted,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  muted: boolean;
  hint?: string;
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
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </div>
  );
}
