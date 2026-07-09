import type { Doc, Id } from "@/convex/_generated/dataModel";

export const inputCls =
  "border-input bg-background text-foreground placeholder:text-muted-foreground " +
  "focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none " +
  "focus-visible:ring-2 disabled:opacity-50";

export const labelCls = "text-muted-foreground mb-1 block text-xs font-medium";

export const numInputCls =
  "border-input bg-background text-foreground focus-visible:ring-ring w-full rounded-md border px-2 py-1.5 text-sm outline-none focus-visible:ring-2 tabular-nums";

export type EnrichedDeal = Doc<"deals"> & {
  contactName: string;
  companyName: string | null;
};

export type LineItemForm = {
  key: string;
  product: Id<"products"> | "";
  productName: string;
  productCode: string;
  qty: number;
  price: number;
  discount: number;
  taxIds: Id<"taxes">[];
};

let keyCounter = 0;
export const newLineKey = () => `line-${++keyCounter}`;

export const emptyLine = (taxTemplate: Id<"taxes">[] = []): LineItemForm => ({
  key: newLineKey(),
  product: "",
  productName: "",
  productCode: "",
  qty: 1,
  price: 0,
  discount: 0,
  taxIds: [...taxTemplate],
});

export function buildLineTaxesPayload(
  taxIds: Id<"taxes">[],
  taxesList: Doc<"taxes">[] | undefined,
) {
  if (!taxesList?.length || !taxIds.length) return undefined;
  const out: { taxId: Id<"taxes">; rate: number; name?: string }[] = [];
  for (const id of taxIds) {
    const tx = taxesList.find((t) => t._id === id);
    if (tx) out.push({ taxId: id, rate: tx.rate ?? 0, name: tx.name });
  }
  return out.length ? out : undefined;
}

/** Shipping taxes: same structure as line item taxes */
export const buildShippingTaxesPayload = buildLineTaxesPayload;

/** Local time at noon to avoid timezone drift */
export function dateToNoonMs(d: Date | undefined): number | undefined {
  if (!d) return undefined;
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    12,
    0,
    0,
    0,
  ).getTime();
}
