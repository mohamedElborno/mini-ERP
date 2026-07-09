"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { IconArrowLeft } from "@tabler/icons-react";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatQuoteWithRevision } from "@/lib/quoteDisplay";
import { cn } from "@/lib/utils";

function stageBadgeClass(
  stage: "lead" | "contacted" | "negotiation" | "won" | "lost" | undefined,
) {
  switch (stage) {
    case "won":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "lost":
      return "bg-destructive/15 text-destructive";
    case "negotiation":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "contacted":
      return "bg-sky-500/15 text-sky-800 dark:text-sky-300";
    case "lead":
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function DealDetailPageClient() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const dealId = id as Id<"deals"> | undefined;

  const t = useTranslations("dealsPage");
  const tq = useTranslations("quotesPage");
  const locale = useLocale();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();

  const data = useQuery(
    api.deals.getDealDetailPage,
    !authLoading && isAuthenticated && dealId
      ? { id: dealId }
      : "skip",
  );

  const dateFmt = (ms: number | undefined) =>
    ms == null
      ? "—"
      : new Date(ms).toLocaleDateString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

  const formatMoney = (n: number | undefined, symbol?: string) =>
    n == null
      ? "—"
      : `${symbol ? `${symbol} ` : ""}${new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n)}`;

  if (authLoading || !isAuthenticated) {
    return (
      <div className="border-border bg-muted/30 h-48 animate-pulse rounded-xl border" />
    );
  }

  if (!dealId) {
    return (
      <p className="text-destructive text-sm">{t("dealDetailInvalid")}</p>
    );
  }

  if (data === undefined) {
    return (
      <div className="border-border bg-muted/30 h-48 animate-pulse rounded-xl border" />
    );
  }

  if (data === null) {
    return (
      <div className="border-destructive/30 bg-destructive/5 rounded-xl border p-6 text-sm">
        <p className="text-destructive font-medium">{t("dealDetailNotFound")}</p>
        <Link
          href="/deals"
          className="text-primary mt-3 inline-flex items-center gap-1 text-sm font-medium"
        >
          <IconArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t("dealDetailBack")}
        </Link>
      </div>
    );
  }

  const { deal, contactName, companyName, quotes, invoices, metrics } = data;
  const stage = deal.stage ?? "lead";
  const dealCurrencySymbol =
    data.dealCurrencySymbol ?? data.defaultCurrencySymbol ?? "";
  const metricsCurrencySymbol = data.defaultCurrencySymbol ?? "";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/deals"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm"
        >
          <IconArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t("dealDetailBack")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {deal.title}
            </h1>
            {deal.description ? (
              <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
                {deal.description}
              </p>
            ) : null}
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 rounded-lg px-3 py-1 text-sm font-medium",
              stageBadgeClass(stage),
            )}
          >
            {t(`stage.${stage}`)}
          </span>
        </div>
      </div>

      <div className="border-border bg-card grid gap-4 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-muted-foreground text-xs font-medium">
            {t("colContact")}
          </p>
          <p className="text-foreground mt-0.5 text-sm font-medium">
            {contactName}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs font-medium">
            {t("colCompany")}
          </p>
          <p className="text-foreground mt-0.5 text-sm font-medium">
            {companyName ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs font-medium">
            {t("dealDetailExpectedValue")}
          </p>
          <p className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
            {formatMoney(deal.value, dealCurrencySymbol || undefined)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs font-medium">
            {t("colProbability")}
          </p>
          <p className="text-foreground mt-0.5 text-sm font-medium">
            {deal.probability != null ? `${deal.probability}%` : "—"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs font-medium">
            {t("colExpectedClose")}
          </p>
          <p className="text-foreground mt-0.5 text-sm">
            {dateFmt(deal.expectedCloseDate)}
          </p>
        </div>
      </div>

      <div className="border-border bg-muted/30 grid gap-3 rounded-2xl border p-4 sm:grid-cols-3">
        <div>
          <p className="text-muted-foreground text-xs">{t("dealDetailSumQuotes")}</p>
          <p className="text-foreground text-lg font-semibold tabular-nums">
            {formatMoney(metrics.quotesTotal, metricsCurrencySymbol || undefined)}
          </p>
          <p className="text-muted-foreground text-xs">
            {t("dealDetailCountQuotes", { n: metrics.quotesCount })}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">
            {t("dealDetailSumInvoices")}
          </p>
          <p className="text-foreground text-lg font-semibold tabular-nums">
            {formatMoney(metrics.invoicesTotal, metricsCurrencySymbol || undefined)}
          </p>
          <p className="text-muted-foreground text-xs">
            {t("dealDetailCountInvoices", { n: metrics.invoicesCount })}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">
            {t("dealDetailExpectedVsQuotes")}
          </p>
          <p className="text-foreground text-lg font-semibold tabular-nums">
            {formatMoney(metrics.expectedValue, metricsCurrencySymbol || undefined)}
          </p>
          <p className="text-muted-foreground text-xs">
            {t("dealDetailExpectedHint")}
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("dealDetailQuotesTitle")}</h2>
        {quotes.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("dealDetailNoQuotes")}</p>
        ) : (
          <div className="border-border overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("dealDetailColNumber")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("dealDetailColStatus")}
                  </th>
                  <th className="px-3 py-2 text-end font-medium">
                    {t("dealDetailColTotal")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("dealDetailColDate")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {quotes.map((q) => (
                  <tr key={q._id}>
                    <td className="text-foreground px-3 py-2 font-mono text-xs">
                      {formatQuoteWithRevision(q.number, q.revision)}
                    </td>
                    <td className="text-foreground px-3 py-2">
                      {q.status
                        ? tq(`status.${q.status}`)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {formatMoney(q.total)}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                      {dateFmt(q.issueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("dealDetailInvoicesTitle")}</h2>
        {invoices.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("dealDetailNoInvoices")}
          </p>
        ) : (
          <div className="border-border overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("dealDetailColNumber")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("dealDetailColStatus")}
                  </th>
                  <th className="px-3 py-2 text-end font-medium">
                    {t("dealDetailColTotal")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("dealDetailColDate")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {invoices.map((inv) => (
                  <tr key={inv._id}>
                    <td className="text-foreground px-3 py-2 font-mono text-xs">
                      {inv.number ?? "—"}
                    </td>
                    <td className="text-foreground px-3 py-2 capitalize">
                      {inv.status ? String(inv.status).replace(/_/g, " ") : "—"}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {formatMoney(inv.total)}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                      {dateFmt(inv.issueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
