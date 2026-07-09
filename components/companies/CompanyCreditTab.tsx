"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";

function fmtMoney(locale: string, n: number) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(locale: string, ms: number) {
  return new Date(ms).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CompanyCreditTab({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("companiesPage");
  const locale = useLocale();
  const { orgGroupFilter } = useOrgGroup();

  const currencies = useQuery(api.currencies.getCurrencies, {
    orgGroupId: orgGroupFilter,
  });
  const defaultCurrencySymbol =
    currencies?.find((c) => c.default)?.symbol ?? "—";

  const summary = useQuery(api.companyCredit.getCompanyCreditSummary, {
    companyId,
  });
  const ledger =
    useQuery(api.companyCredit.getCompanyCreditLedger, { companyId }) ?? [];

  if (summary === undefined) {
    return (
      <div className="border-border bg-muted/30 m-4 h-32 animate-pulse rounded-xl border" />
    );
  }

  const s = summary ?? {
    creditLimit: 0,
    creditUsed: 0,
    creditAvailable: 0,
    creditPeriodDays: 0,
    elapsedDays: 0,
    remainingDays: 0,
    creditPeriodStartedAt: null,
  };

  const cards = [
    {
      label: t("creditLimit"),
      value: `${fmtMoney(locale, s.creditLimit)} ${defaultCurrencySymbol}`,
    },
    {
      label: t("creditUsed"),
      value: `${fmtMoney(locale, s.creditUsed)} ${defaultCurrencySymbol}`,
    },
    {
      label: t("creditAvailable"),
      value: `${fmtMoney(locale, s.creditAvailable)} ${defaultCurrencySymbol}`,
    },
    { label: t("creditPeriodDays"), value: String(s.creditPeriodDays) },
    { label: t("creditElapsedDays"), value: String(s.elapsedDays) },
    { label: t("creditRemainingDays"), value: String(s.remainingDays) },
  ];

  return (
    <div className="space-y-4 p-4">
      <p className="text-muted-foreground text-xs">
        {t("creditInDefaultCurrency", { symbol: defaultCurrencySymbol })}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="border-border bg-card rounded-xl border p-3"
          >
            <p className="text-muted-foreground text-xs">{c.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {s.creditPeriodStartedAt && (
        <p className="text-muted-foreground text-xs">
          {t("creditPeriodStarted", {
            date: fmtDate(locale, s.creditPeriodStartedAt),
          })}
        </p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold">{t("creditLedgerTitle")}</h3>
        {ledger.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("creditLedgerEmpty")}</p>
        ) : (
          <ul className="divide-border border-border divide-y rounded-xl border">
            {ledger.map((row: Doc<"companyCreditLedger">) => (
              <li key={row._id} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={
                      row.movementType === "increase"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400"
                    }
                  >
                    {row.movementType === "increase"
                      ? t("creditMovementIncrease")
                      : t("creditMovementDecrease")}
                    {row.amount > 0
                      ? ` · ${fmtMoney(locale, row.amount)} ${defaultCurrencySymbol}`
                      : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {fmtDate(locale, row.timestamp)}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {t("creditBeforeAfter", {
                    before: `${fmtMoney(locale, row.creditAvailableBefore)} ${defaultCurrencySymbol}`,
                    after: `${fmtMoney(locale, row.creditAvailableAfter)} ${defaultCurrencySymbol}`,
                  })}
                </p>
                <p className="font-medium">
                  {row.sourceLabel
                    ? row.sourceLabel
                    : t(
                        `creditSource_${row.sourceType}` as
                          | "creditSource_manual_limit_update"
                          | "creditSource_invoice_credit"
                          | "creditSource_invoice_payment"
                          | "creditSource_invoice_void",
                      )}
                </p>
                {row.note && (
                  <p className="text-muted-foreground text-xs">{row.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
