"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ar as arLocale, enUS as enLocale } from "date-fns/locale";
import { IconCalendar } from "@tabler/icons-react";
import { Calendar } from "@/components/ui/calendar";
import { inputCls } from "./quoteFormShared";

export function QuoteDatePickerField({
  value,
  onChange,
  placeholder,
  locale,
}: {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder: string;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const dateLocale = locale === "ar" ? arLocale : enLocale;

  const displayLabel = value
    ? value.toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : placeholder;

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    }
    setOpen(true);
  };

  const handleSelect = (date: Date | undefined) => {
    onChange(date);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={`${inputCls} flex items-center justify-between gap-2 text-start`}
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {displayLabel}
        </span>
        <IconCalendar className="text-muted-foreground h-4 w-4 shrink-0" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-60"
              onClick={() => setOpen(false)}
            />
            <div
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                minWidth: pos.width,
                zIndex: 61,
              }}
              className="border-border bg-card rounded-xl border shadow-2xl"
            >
              <Calendar
                mode="single"
                selected={value}
                onSelect={handleSelect}
                locale={dateLocale}
                captionLayout="dropdown"
                fromYear={new Date().getFullYear() - 1}
                toYear={new Date().getFullYear() + 5}
                initialFocus
              />
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
