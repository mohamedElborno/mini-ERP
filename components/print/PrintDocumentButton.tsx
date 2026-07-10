"use client";

import { useRef, useState, useEffect } from "react";
import { IconPrinter, IconChevronDown, IconLoader2 } from "@tabler/icons-react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";

type DocType = "quote" | "invoice" | "receipt-voucher";

interface Props {
  type: DocType;
  id: string;
  /** Optional extra class for positioning */
  className?: string;
  /** Button size variant */
  size?: "sm" | "default";
}

export function PrintDocumentButton({ type, id, className, size = "default" }: Props) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  const openPrint = (lang: "ar" | "en") => {
    setOpen(false);
    setLoading(true);

    const url = `/${locale}/print/${type}/${id}?lang=${lang}`;

    // Load the print page in a hidden iframe so the current page stays open.
    // PrintDocumentClient inside the iframe calls window.print() automatically
    // once the Convex data has loaded.
    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(iframe);

    const cleanup = () => {
      setLoading(false);
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 300);
    };

    // After the iframe HTML loads, register the afterprint listener so we know
    // when the print dialog is dismissed and can reset the loading state.
    iframe.addEventListener("load", () => {
      iframe.contentWindow?.addEventListener("afterprint", cleanup);
      // Safety fallback: reset state after 60 s in case afterprint never fires.
      setTimeout(cleanup, 60_000);
    });

    // If the iframe itself fails to load, reset immediately.
    iframe.addEventListener("error", cleanup);

    iframe.src = url;
  };

  const isSm = size === "sm";

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={loading}
        onClick={() => !loading && setOpen((v) => !v)}
        className={cn(
          "border-border bg-card hover:bg-muted focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-lg border font-medium shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
          isSm ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        )}
      >
        {loading ? (
          <IconLoader2 className={cn("animate-spin", isSm ? "size-3.5" : "size-4")} />
        ) : (
          <IconPrinter className={isSm ? "size-3.5" : "size-4"} />
        )}
        <span>PDF</span>
        {!loading && (
          <IconChevronDown
            className={cn(
              "text-muted-foreground transition-transform duration-150",
              isSm ? "size-3" : "size-3.5",
              open && "rotate-180",
            )}
          />
        )}
      </button>

      {open && !loading && (
        <div className="border-border bg-card animate-in fade-in slide-in-from-top-1 absolute inset-e-0 top-full z-50 mt-1.5 min-w-[150px] overflow-hidden rounded-xl border py-1 shadow-lg duration-150">
          <button
            type="button"
            onClick={() => openPrint("ar")}
            className="hover:bg-muted flex w-full items-center gap-2 px-4 py-2 text-sm"
          >
            <span className="text-base">🇸🇦</span>
            <span>عربي</span>
          </button>
          <button
            type="button"
            onClick={() => openPrint("en")}
            className="hover:bg-muted flex w-full items-center gap-2 px-4 py-2 text-sm"
          >
            <span className="text-base">🇬🇧</span>
            <span>English</span>
          </button>
        </div>
      )}
    </div>
  );
}
