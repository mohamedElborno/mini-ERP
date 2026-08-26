"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { IconTrash } from "@tabler/icons-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { labelCls, numInputCls, type LineItemForm } from "./quoteFormShared";
import { QuoteProductCombobox } from "./QuoteProductCombobox";

type Props = {
  line: LineItemForm;
  products: Doc<"products">[] | undefined;
  taxesList: Doc<"taxes">[] | undefined;
  onChange: (key: string, patch: Partial<LineItemForm>) => void;
  onRemove: (key: string) => void;
  onToggleLineTax: (key: string, taxId: Id<"taxes">) => void;
  allowPerLineTaxes?: boolean;
  locale: string;
  getLinePriceForProduct: (prod: Doc<"products">) => number;
  /** يسمح بعرض سعر بكمية تتجاوز المتاح (صلاحية quotes:oversell) */
  canOversellQuotes: boolean;
};

export function QuoteLineItemCard({
  line,
  products,
  taxesList,
  onChange,
  onRemove,
  onToggleLineTax,
  allowPerLineTaxes = false,
  locale,
  getLinePriceForProduct,
  canOversellQuotes,
}: Props) {
  const t = useTranslations("quotesPage");
  const lineTotal = line.product
    ? Math.max(0, (line.price - line.discount) * line.qty)
    : 0;

  const stockInfo = useMemo(() => {
    if (!line.product || !products) return null;
    const prod = products.find((p) => p._id === line.product);
    if (!prod) return null;
    const stock = prod.stock ?? 0;
    const reserved = prod.reserved ?? 0;
    const available = stock - reserved;
    return { stock, reserved, available, name: prod.name };
  }, [line.product, products]);

  const overAvailable =
    stockInfo && line.qty > stockInfo.available && !canOversellQuotes;
  const overHint =
    stockInfo && line.qty > stockInfo.available && canOversellQuotes;

  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  return (
    <div className="border-border bg-card rounded-xl border p-3 shadow-sm">
      <QuoteProductCombobox
        selectedId={line.product}
        selectedName={line.productName}
        selectedCode={line.productCode}
        products={products}
        getLinePriceForProduct={getLinePriceForProduct}
        formatMoney={fmt}
        onSelect={(prod) => {
          if (!prod._id) {
            onChange(line.key, {
              product: "",
              productName: "",
              productCode: "",
              price: 0,
            });
          } else {
            onChange(line.key, {
              product: prod._id,
              productName: prod.name,
              productCode: prod.code ?? "",
              price: getLinePriceForProduct(prod),
            });
          }
        }}
      />

      {line.product && stockInfo && (
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          {t("lineStockHint", {
            stock: stockInfo.stock,
            reserved: stockInfo.reserved,
            available: stockInfo.available,
          })}
        </p>
      )}
      {(overAvailable || overHint) && (
        <p
          className={
            overAvailable
              ? "text-destructive mt-1.5 text-xs font-medium"
              : "text-amber-700 dark:text-amber-400 mt-1.5 text-xs"
          }
        >
          {overAvailable
            ? t("lineQtyExceedsAvailable")
            : t("lineQtyOversellNote")}
        </p>
      )}

      <div className="mt-3 grid grid-cols-4 gap-2">
        <div>
          <p className={labelCls}>{t("colQty")}</p>
          <input
            type="number"
            min="1"
            step="1"
            className={numInputCls}
            value={line.qty}
            onChange={(e) =>
              onChange(line.key, {
                qty: Math.max(1, parseInt(e.target.value) || 1),
              })
            }
          />
        </div>
        <div>
          <p className={labelCls}>{t("colUnitPrice")}</p>
          <input
            type="number"
            min="0"
            step="any"
            className={numInputCls}
            value={line.price}
            onChange={(e) =>
              onChange(line.key, { price: parseFloat(e.target.value) || 0 })
            }
          />
        </div>
        <div>
          <p className={labelCls}>{t("colDiscount")}</p>
          <input
            type="number"
            min="0"
            step="any"
            className={numInputCls}
            value={line.discount || ""}
            placeholder="0"
            onChange={(e) =>
              onChange(line.key, { discount: parseFloat(e.target.value) || 0 })
            }
          />
        </div>
        <div>
          <p className={labelCls}>{t("colLineTotal")}</p>
          <div className="border-border bg-muted/30 flex h-[34px] items-center rounded-md border px-2">
            <span className="text-foreground w-full text-sm font-semibold tabular-nums">
              {fmt(lineTotal)}
            </span>
          </div>
        </div>
      </div>

      {allowPerLineTaxes && taxesList && taxesList.length > 0 && (
        <div className="mt-3">
          <p className={labelCls}>{t("lineTaxesLabel")}</p>
          <div className="flex flex-wrap gap-2">
            {taxesList.map((tx) => (
              <label
                key={tx._id}
                className="border-border bg-background has-checked:border-primary/50 has-checked:bg-primary/5 flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  className="rounded border"
                  checked={line.taxIds.includes(tx._id)}
                  onChange={() => onToggleLineTax(line.key, tx._id)}
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
        </div>
      )}

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => onRemove(line.key)}
          className="text-muted-foreground hover:text-destructive flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
        >
          <IconTrash className="h-3.5 w-3.5" />
          {t("removeLine")}
        </button>
      </div>
    </div>
  );
}
