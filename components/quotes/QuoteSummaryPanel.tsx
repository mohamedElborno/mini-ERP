"use client";

import { useTranslations } from "next-intl";

type Props = {
  subtotal: number;
  taxAmount: number;
  generalDiscount: number;
  shipping: number;
  total: number;
  locale: string;
};

export function QuoteSummaryPanel({
  subtotal,
  taxAmount,
  generalDiscount,
  shipping,
  total,
  locale,
}: Props) {
  const t = useTranslations("quotesPage");

  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  return (
    <div className="border-border bg-muted/30 rounded-xl border p-4">
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t("summarySubtotal")}</span>
          <span className="text-muted-foreground tabular-nums">
            {fmt(subtotal)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t("summaryTax")}</span>
          <span className="text-muted-foreground tabular-nums">
            {fmt(taxAmount)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t("summaryDiscount")}</span>
          <span className="text-muted-foreground tabular-nums">
            − {fmt(generalDiscount)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t("summaryShipping")}</span>
          <span className="text-muted-foreground tabular-nums">
            {fmt(shipping)}
          </span>
        </div>
        <div className="border-border mt-2 border-t pt-2">
          <div className="flex justify-between text-sm font-semibold">
            <span>{t("summaryTotal")}</span>
            <span className="tabular-nums">{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
