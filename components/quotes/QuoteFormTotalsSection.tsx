"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { inputCls, labelCls } from "./quoteFormShared";
import { QuoteSummaryPanel } from "./QuoteSummaryPanel";

type Props = {
  generalDiscount: number;
  onGeneralDiscountChange: (n: number) => void;
  shipping: number;
  onShippingChange: (n: number) => void;
  financialPreview: {
    subtotal: number;
    taxAmount: number;
    total: number;
  };
  taxesList?: Doc<"taxes">[];
  shippingTaxIds?: Id<"taxes">[];
  onToggleShippingTax?: (id: Id<"taxes">) => void;
};

export function QuoteFormTotalsSection({
  generalDiscount,
  onGeneralDiscountChange,
  shipping,
  onShippingChange,
  financialPreview,
  taxesList,
  shippingTaxIds = [],
  onToggleShippingTax,
}: Props) {
  const t = useTranslations("quotesPage");
  const locale = useLocale();
  const showShippingTaxes =
    taxesList?.length &&
    onToggleShippingTax &&
    shippingTaxIds !== undefined;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className={labelCls}>{t("generalDiscount")}</label>
        <input
          type="number"
          min="0"
          step="any"
          className={inputCls}
          value={generalDiscount || ""}
          onChange={(e) =>
            onGeneralDiscountChange(parseFloat(e.target.value) || 0)
          }
          placeholder="0.00"
        />
      </div>
      <div>
        <label className={labelCls}>{t("shippingAmount")}</label>
        <input
          type="number"
          min="0"
          step="any"
          className={inputCls}
          value={shipping || ""}
          onChange={(e) => onShippingChange(parseFloat(e.target.value) || 0)}
          placeholder="0.00"
        />
      </div>

      {showShippingTaxes ? (
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium">{t("shippingTaxesLabel")}</p>
          <p className="text-muted-foreground mb-2 text-xs">
            {t("shippingTaxesHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            {taxesList!.map((tx) => (
              <label
                key={tx._id}
                className="border-border bg-background hover:bg-muted/50 has-checked:border-primary/50 has-checked:bg-primary/5 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="rounded border"
                  checked={shippingTaxIds.includes(tx._id)}
                  onChange={() => onToggleShippingTax!(tx._id)}
                />
                <span>
                  {tx.name}
                  {tx.rate != null && (
                    <span className="text-muted-foreground ms-1">
                      ({(tx.rate * 100).toFixed(2)}%)
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="sm:col-span-2">
        <QuoteSummaryPanel
          subtotal={financialPreview.subtotal}
          taxAmount={financialPreview.taxAmount}
          generalDiscount={generalDiscount}
          shipping={shipping}
          total={financialPreview.total}
          locale={locale}
        />
      </div>
    </div>
  );
}
