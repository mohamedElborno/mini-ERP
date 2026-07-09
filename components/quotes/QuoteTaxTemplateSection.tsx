"use client";

import { useTranslations } from "next-intl";
import type { Doc, Id } from "@/convex/_generated/dataModel";

type Props = {
  taxesList: Doc<"taxes">[] | undefined;
  taxTemplateIds: Id<"taxes">[];
  onToggleTax: (id: Id<"taxes">) => void;
  onApplyToAllLines: () => void;
};

export function QuoteTaxTemplateSection({
  taxesList,
  taxTemplateIds,
  onToggleTax,
  onApplyToAllLines,
}: Props) {
  const t = useTranslations("quotesPage");
  if (!taxesList?.length) return null;

  return (
    <div>
      <p className="mb-2 text-sm font-medium">{t("createTaxes")}</p>
      <p className="text-muted-foreground mb-2 text-xs">{t("createTaxesHint")}</p>
      <div className="flex flex-wrap gap-2">
        {taxesList.map((tx) => (
          <label
            key={tx._id}
            className="border-border bg-background hover:bg-muted/50 has-checked:border-primary/50 has-checked:bg-primary/5 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              className="rounded border"
              checked={taxTemplateIds.includes(tx._id)}
              onChange={() => onToggleTax(tx._id)}
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
      <button
        type="button"
        onClick={onApplyToAllLines}
        className="text-primary hover:bg-primary/10 mt-3 w-full rounded-lg border border-dashed px-3 py-2 text-sm font-medium transition-colors"
      >
        {t("applyTaxesToAllLines")}
      </button>
    </div>
  );
}
