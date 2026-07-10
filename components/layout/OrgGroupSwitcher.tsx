"use client";

import { useEffect, useRef, useState } from "react";
import { IconBuilding, IconCheck, IconChevronDown } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { useOrgGroupOptional } from "@/components/providers/OrgGroupProvider";

export function OrgGroupSwitcher() {
  const t = useTranslations("orgCompanies");
  const orgGroup = useOrgGroupOptional();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!orgGroup || orgGroup.orgGroups.length === 0) return null;

  const activeId = orgGroup.activeOrgGroupId;
  const selectedLabel =
    activeId === "all"
      ? t("allCompanies")
      : (orgGroup.orgGroups.find((g) => g._id === activeId)?.name ??
        t("allCompanies"));

  const options: { id: typeof activeId; label: string }[] = [
    { id: "all", label: t("allCompanies") },
    ...orgGroup.orgGroups.map((g) => ({ id: g._id, label: g.name })),
  ];

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="border-border bg-card text-foreground hover:bg-muted focus-visible:ring-ring flex max-w-[180px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:outline-none sm:max-w-[220px]"
      >
        <IconBuilding className="text-muted-foreground size-3.5 shrink-0" />
        <span className="flex-1 truncate text-start font-medium">
          {selectedLabel}
        </span>
        <IconChevronDown
          className={`text-muted-foreground size-3.5 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="listbox"
          aria-label={t("switcherLabel")}
          className="border-border bg-card animate-in fade-in slide-in-from-top-1 absolute inset-e-0 top-full z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border py-1 shadow-lg duration-150"
        >
          {options.map((opt) => {
            const isSelected = activeId === opt.id;
            return (
              <button
                key={String(opt.id)}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  orgGroup.setActiveOrgGroupId(opt.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  isSelected
                    ? "bg-primary/8 text-primary font-medium"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <IconBuilding
                  className={`size-3.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                />
                <span className="flex-1 truncate text-start">{opt.label}</span>
                {isSelected && (
                  <IconCheck className="text-primary size-3.5 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
