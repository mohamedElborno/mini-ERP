"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  PAGE_SIZE_OPTIONS,
  type PageSizeOption,
} from "@/lib/useConvexPagedQuery";

export function ListSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full max-w-md rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2"
    />
  );
}

export type KpiCardItem = {
  id: string;
  label: string;
  value: number | string;
};

export function FilterableKpiCards({
  cards,
  activeId,
  onSelect,
  columnsClassName = "grid-cols-2 sm:grid-cols-5",
}: {
  cards: KpiCardItem[];
  activeId: string;
  onSelect: (id: string) => void;
  columnsClassName?: string;
}) {
  return (
    <div className={cn("grid gap-3", columnsClassName)}>
      {cards.map((card) => {
        const active = activeId === card.id;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            className={cn(
              "border-border bg-card rounded-xl border p-4 text-start transition-colors hover:bg-muted/40",
              active && "border-primary ring-primary/25 ring-2",
            )}
          >
            <p className="text-muted-foreground text-xs">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {card.value}
            </p>
          </button>
        );
      })}
    </div>
  );
}

export function PageNavigationBar({
  currentPage,
  totalPages,
  rangeStart,
  rangeEnd,
  totalItems,
  pageSize,
  onPageSizeChange,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}: {
  currentPage: number;
  totalPages?: number;
  rangeStart: number;
  rangeEnd: number;
  totalItems?: number;
  pageSize: PageSizeOption;
  onPageSizeChange: (size: PageSizeOption) => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("listPages");

  const rangeLabel =
    rangeEnd === 0
      ? t("emptyRange")
      : totalItems != null
        ? t("showingRange", {
            start: rangeStart,
            end: rangeEnd,
            total: totalItems,
          })
        : t("showingRangeNoTotal", { start: rangeStart, end: rangeEnd });

  const pageLabel =
    totalPages != null
      ? t("pageOf", { page: currentPage, total: totalPages })
      : t("pageOnly", { page: currentPage });

  return (
    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm">{rangeLabel}</p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <span>{t("pageSize")}</span>
          <select
            value={pageSize}
            onChange={(e) =>
              onPageSizeChange(Number(e.target.value) as PageSizeOption)
            }
            className="border-input bg-background rounded-lg border px-2 py-1.5 text-sm outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={onPrev}
            className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:pointer-events-none disabled:opacity-40"
          >
            {t("previous")}
          </button>
          <span className="min-w-[5.5rem] text-center text-sm tabular-nums">
            {pageLabel}
          </span>
          <button
            type="button"
            disabled={!canGoNext}
            onClick={onNext}
            className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:pointer-events-none disabled:opacity-40"
          >
            {t("next")}
          </button>
        </div>
      </div>
    </div>
  );
}
