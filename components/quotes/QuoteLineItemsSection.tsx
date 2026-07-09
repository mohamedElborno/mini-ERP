"use client";

import { useLocale, useTranslations } from "next-intl";
import { IconPlus } from "@tabler/icons-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { LineItemForm } from "./quoteFormShared";
import { QuoteLineItemCard } from "./QuoteLineItemCard";

type Props = {
  lines: LineItemForm[];
  onAddLine: () => void;
  onStartFirstLine: () => void;
  products: Doc<"products">[] | undefined;
  taxesList: Doc<"taxes">[] | undefined;
  getLinePriceForProduct: (prod: Doc<"products">) => number;
  onLineChange: (key: string, patch: Partial<LineItemForm>) => void;
  onRemoveLine: (key: string) => void;
  onToggleLineTax: (key: string, taxId: Id<"taxes">) => void;
  canOversellQuotes: boolean;
};

export function QuoteLineItemsSection({
  lines,
  onAddLine,
  onStartFirstLine,
  products,
  taxesList,
  getLinePriceForProduct,
  onLineChange,
  onRemoveLine,
  onToggleLineTax,
  canOversellQuotes,
}: Props) {
  const t = useTranslations("quotesPage");
  const locale = useLocale();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{t("lineItemsTitle")}</p>
        <button
          type="button"
          onClick={onAddLine}
          className="text-primary hover:bg-primary/10 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors"
        >
          <IconPlus className="h-3.5 w-3.5" />
          {t("addLineItem")}
        </button>
      </div>

      {lines.length === 0 ? (
        <button
          type="button"
          onClick={onStartFirstLine}
          className="border-border text-muted-foreground hover:border-primary/40 hover:text-primary w-full rounded-xl border border-dashed py-6 text-center text-sm transition-colors"
        >
          <IconPlus className="mx-auto mb-1 h-5 w-5" />
          {t("addLineItem")}
        </button>
      ) : (
        <div className="space-y-2">
          {lines.map((line) => (
            <QuoteLineItemCard
              key={line.key}
              line={line}
              products={products}
              taxesList={taxesList}
              getLinePriceForProduct={getLinePriceForProduct}
              onChange={onLineChange}
              onRemove={onRemoveLine}
              onToggleLineTax={onToggleLineTax}
              locale={locale}
              canOversellQuotes={canOversellQuotes}
            />
          ))}
        </div>
      )}
    </div>
  );
}
