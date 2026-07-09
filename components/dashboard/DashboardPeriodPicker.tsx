"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ar as arLocale, enUS as enLocale } from "date-fns/locale";
import { IconCalendar } from "@tabler/icons-react";
import type { DateRange } from "react-day-picker";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export type PeriodPreset = "7d" | "30d" | "90d";

export type DashboardPeriodSelection =
  | { mode: "preset"; preset: PeriodPreset }
  | { mode: "custom"; from: Date; to: Date };

const MS_DAY = 86_400_000;

export function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function endOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

export function periodFromPreset(preset: PeriodPreset): {
  periodStart: number;
  periodEnd: number;
} {
  const periodEnd = Date.now();
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const periodStart = periodEnd - days * MS_DAY;
  return { periodStart, periodEnd };
}

export function periodFromCustomRange(from: Date, to: Date): {
  periodStart: number;
  periodEnd: number;
} {
  const periodStart = startOfLocalDay(from);
  const periodEnd = Math.min(endOfLocalDay(to), Date.now());
  return { periodStart, periodEnd };
}

function presetToDateRange(preset: PeriodPreset): DateRange {
  const to = new Date();
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const from = new Date(to.getTime() - days * MS_DAY);
  return { from, to };
}

function formatRangeLabel(
  from: Date,
  to: Date,
  locale: string,
  placeholder: string,
): string {
  const loc = locale === "ar" ? "ar-SA" : "en-US";
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  if (!from || !to) return placeholder;
  return `${from.toLocaleDateString(loc, opts)} – ${to.toLocaleDateString(loc, opts)}`;
}

type DashboardPeriodPickerProps = {
  selection: DashboardPeriodSelection;
  onSelectionChange: (selection: DashboardPeriodSelection) => void;
  locale: string;
};

export function DashboardPeriodPicker({
  selection,
  onSelectionChange,
  locale,
}: DashboardPeriodPickerProps) {
  const t = useTranslations("dashboardHome");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [draftRange, setDraftRange] = useState<DateRange | undefined>();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const dateLocale = locale === "ar" ? arLocale : enLocale;
  const isCustom = selection.mode === "custom";

  const calendarRange: DateRange | undefined =
    selection.mode === "custom"
      ? { from: selection.from, to: selection.to }
      : presetToDateRange(selection.preset);

  const presets: { id: PeriodPreset; label: string }[] = [
    { id: "7d", label: t("period7d") },
    { id: "30d", label: t("period30d") },
    { id: "90d", label: t("period90d") },
  ];

  const customLabel =
    isCustom && calendarRange.from && calendarRange.to
      ? formatRangeLabel(
          calendarRange.from,
          calendarRange.to,
          locale,
          t("periodCustom"),
        )
      : t("periodCustom");

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = Math.min(680, window.innerWidth - 16);
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - popoverWidth - 8),
      );
      setPos({ top: rect.bottom + 6, left });
    }
    setDraftRange(calendarRange);
    setOpen(true);
  };

  const handlePreset = (preset: PeriodPreset) => {
    onSelectionChange({ mode: "preset", preset });
    setOpen(false);
  };

  const handleRangeSelect = (range: DateRange | undefined) => {
    setDraftRange(range);
    if (!range?.from || !range.to) return;
    onSelectionChange({
      mode: "custom",
      from: range.from,
      to: range.to,
    });
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground me-2 text-sm">
        {t("periodLabel")}
      </span>
      {presets.map((p) => (
        <Button
          key={p.id}
          type="button"
          variant={
            selection.mode === "preset" && selection.preset === p.id
              ? "default"
              : "outline"
          }
          size="sm"
          onClick={() => handlePreset(p.id)}
        >
          {p.label}
        </Button>
      ))}

      <Button
        ref={triggerRef}
        type="button"
        variant={isCustom ? "default" : "outline"}
        size="sm"
        onClick={handleOpen}
        className="max-w-[min(100%,280px)] gap-1.5"
      >
        <IconCalendar className="size-4 shrink-0" />
        <span className="truncate">{customLabel}</span>
      </Button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-60"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 61 }}
              className="border-border bg-card w-[min(680px,calc(100vw-1rem))] rounded-xl border p-2 shadow-2xl"
              role="dialog"
              aria-label={t("periodCustom")}
            >
              <Calendar
                mode="range"
                selected={draftRange}
                onSelect={handleRangeSelect}
                locale={dateLocale}
                captionLayout="dropdown"
                numberOfMonths={2}
                fromYear={new Date().getFullYear() - 5}
                toYear={new Date().getFullYear()}
                disabled={{ after: new Date() }}
                defaultMonth={
                  calendarRange.to ?? calendarRange.from ?? new Date()
                }
                className={cn(
                  "[&_.rdp-months]:max-sm:flex-col",
                  "[&_.rdp-month]:max-sm:w-full",
                )}
                initialFocus
              />
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
