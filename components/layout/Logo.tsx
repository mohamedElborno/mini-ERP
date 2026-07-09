"use client";

import { cn } from "@/lib/utils";

export default function Logo({ open }: { open: boolean }) {
  return (
    <div
      className={cn(
        "font-semibold tracking-tight text-neutral-900 transition-all dark:text-neutral-100",
        open ? "text-lg" : "text-xs",
      )}
    >
      Mini-ERP
    </div>
  );
}
