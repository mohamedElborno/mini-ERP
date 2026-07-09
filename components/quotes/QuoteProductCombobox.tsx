"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  IconX,
  IconSearch,
  IconChevronDown,
  IconPackage,
} from "@tabler/icons-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { inputCls } from "./quoteFormShared";

type Props = {
  selectedId: Id<"products"> | "";
  selectedName: string;
  selectedCode: string;
  products: Doc<"products">[] | undefined;
  onSelect: (prod: Doc<"products">) => void;
  getLinePriceForProduct: (prod: Doc<"products">) => number;
  formatMoney: (n: number) => string;
};

export function QuoteProductCombobox({
  selectedId,
  selectedName,
  selectedCode,
  products,
  onSelect,
  getLinePriceForProduct,
  formatMoney,
}: Props) {
  const t = useTranslations("quotesPage");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return products ?? [];
    const q = query.toLowerCase();
    return (products ?? []).filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.code ?? "").toLowerCase().includes(q),
    );
  }, [query, products]);

  const handleSelect = (prod: Doc<"products">) => {
    onSelect(prod);
    setQuery("");
    setOpen(false);
    setActiveIdx(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[activeIdx]) handleSelect(filtered[activeIdx]);
        break;
      case "Escape":
        setOpen(false);
        setQuery("");
        break;
    }
  };

  if (selectedId) {
    return (
      <div className="border-border bg-muted/30 flex items-center gap-2 rounded-lg border px-3 py-2">
        <IconPackage className="text-primary h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-medium">
            {selectedName}
          </p>
          {selectedCode && (
            <p className="text-muted-foreground font-mono text-xs">
              {selectedCode}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onSelect({ _id: "" } as unknown as Doc<"products">);
            setTimeout(() => {
              setOpen(true);
              inputRef.current?.focus();
            }, 50);
          }}
          className="text-muted-foreground hover:text-foreground shrink-0 rounded px-2 py-0.5 text-xs transition-colors hover:underline"
        >
          {t("changeProduct")}
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <div
        className={`border-input bg-background flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-shadow ${open ? "ring-ring ring-2" : ""}`}
        onClick={() => {
          if (!open) {
            setOpen(true);
            inputRef.current?.focus();
          }
        }}
      >
        <IconSearch className="text-muted-foreground h-4 w-4 shrink-0 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={t("searchProducts")}
          autoComplete="off"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="placeholder:text-muted-foreground min-w-0 flex-1 cursor-text bg-transparent text-sm outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setQuery("");
              inputRef.current?.focus();
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        ) : (
          <IconChevronDown
            className={`text-muted-foreground h-4 w-4 shrink-0 pointer-events-none transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </div>

      {open && (
        <div className="border-border bg-card absolute left-0 right-0 z-50 mt-1 rounded-xl border shadow-2xl">
          {!products ? (
            <div className="text-muted-foreground px-3 py-3 text-sm">…</div>
          ) : filtered.length === 0 ? (
            <div className="text-muted-foreground px-3 py-3 text-sm">
              {query ? t("productNoResults") : t("noProducts")}
            </div>
          ) : (
            <ul className="max-h-52 overflow-y-auto py-1">
              {filtered.map((prod, idx) => (
                <li key={prod._id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(prod);
                    }}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                      idx === activeIdx
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <IconPackage className="h-4 w-4 shrink-0 opacity-60" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {prod.name}
                      </p>
                      {prod.code && (
                        <p className="text-muted-foreground font-mono text-xs">
                          {prod.code}
                        </p>
                      )}
                    </div>
                    {prod.price != null && (
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {formatMoney(getLinePriceForProduct(prod))}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
