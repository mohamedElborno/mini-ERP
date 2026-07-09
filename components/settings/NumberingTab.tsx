"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Switch } from "@/components/ui/switch";
import { Btn, Input, SectionCard, Select } from "./settingsShared";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";

type NumberingMode = "auto" | "manual";

type SettingsT = ReturnType<typeof useTranslations<"settingsPage">>;

function buildPreview(
  prefix: string,
  includeYear: boolean,
  padding: number,
): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const seq = "1".padStart(padding, "0");
  const parts = [prefix || "—", ...(includeYear ? [String(year)] : []), seq];
  return parts.join("-");
}

function NumberingBlock({
  label,
  hint,
  mode,
  prefix,
  includeYear,
  padding,
  onModeChange,
  onPrefixChange,
  onIncludeYearChange,
  onPaddingChange,
  t,
}: {
  label: string;
  hint: string;
  mode: NumberingMode;
  prefix: string;
  includeYear: boolean;
  padding: number;
  onModeChange: (v: NumberingMode) => void;
  onPrefixChange: (v: string) => void;
  onIncludeYearChange: (v: boolean) => void;
  onPaddingChange: (v: number) => void;
  t: SettingsT;
}) {
  const preview = buildPreview(prefix, includeYear, padding);

  return (
    <div className="border-border space-y-4 rounded-xl border p-4">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs font-medium">
            {t("numberingMode")}
          </label>
          <Select
            value={mode}
            onChange={(e) => onModeChange(e.target.value as NumberingMode)}
          >
            <option value="auto">{t("modeAuto")}</option>
            <option value="manual">{t("modeManual")}</option>
          </Select>
        </div>
      </div>

      {mode === "auto" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs font-medium">
                {t("numberingPrefix")}
              </label>
              <Input
                value={prefix}
                onChange={(e) => onPrefixChange(e.target.value.toUpperCase())}
                placeholder="QT"
                maxLength={10}
              />
            </div>
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs font-medium">
                {t("numberingPadding")}
              </label>
              <Select
                value={String(padding)}
                onChange={(e) => onPaddingChange(Number(e.target.value))}
              >
                <option value="3">3 {t("digits")} — 001</option>
                <option value="4">4 {t("digits")} — 0001</option>
                <option value="5">5 {t("digits")} — 00001</option>
                <option value="6">6 {t("digits")} — 000001</option>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs font-medium">
                {t("numberingIncludeYear")}
              </label>
              <div
                className={`relative inline-flex h-9 w-full items-center justify-between rounded-lg border px-3 text-sm font-medium transition-colors ${
                  includeYear
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                <span>
                  {includeYear ? t("yearIncluded") : t("yearExcluded")}
                </span>
                <Switch
                  checked={includeYear}
                  onCheckedChange={onIncludeYearChange}
                />
              </div>
            </div>
          </div>

          <div className="bg-muted/40 border-border flex items-center gap-3 rounded-lg border px-4 py-3">
            <span className="text-muted-foreground shrink-0 text-xs font-medium">
              {t("previewLabel")}
            </span>
            <code className="text-foreground font-mono text-sm font-semibold tracking-wider">
              {preview}
            </code>
          </div>
        </>
      )}
    </div>
  );
}

export function NumberingTab() {
  const t = useTranslations("settingsPage");
  const { effectiveOrgGroupId } = useOrgGroup();
  const settings = useQuery(api.settings.getSettings, {
    orgGroupId: effectiveOrgGroupId ?? "all",
  });
  const updateSettings = useMutation(api.settings.updateSettings);

  const [quoteMode, setQuoteMode] = useState<NumberingMode>("auto");
  const [quotePrefix, setQuotePrefix] = useState("QT");
  const [quoteIncludeYear, setQuoteIncludeYear] = useState(true);
  const [quotePadding, setQuotePadding] = useState(5);

  const [invoiceMode, setInvoiceMode] = useState<NumberingMode>("auto");
  const [invoicePrefix, setInvoicePrefix] = useState("INV");
  const [invoiceIncludeYear, setInvoiceIncludeYear] = useState(true);
  const [invoicePadding, setInvoicePadding] = useState(5);

  const [productCodeMode, setProductCodeMode] =
    useState<NumberingMode>("manual");
  const [productCodePrefix, setProductCodePrefix] = useState("PRD");
  const [productCodeIncludeYear, setProductCodeIncludeYear] = useState(false);
  const [productCodePadding, setProductCodePadding] = useState(4);

  const [receiptVoucherMode, setReceiptVoucherMode] =
    useState<NumberingMode>("auto");
  const [receiptVoucherPrefix, setReceiptVoucherPrefix] = useState("RV");
  const [receiptVoucherIncludeYear, setReceiptVoucherIncludeYear] =
    useState(true);
  const [receiptVoucherPadding, setReceiptVoucherPadding] = useState(5);

  const [synced, setSynced] = useState(false);
  if (settings && !synced) {
    if (settings.quoteNumberMode) setQuoteMode(settings.quoteNumberMode);
    if (settings.quoteNumberPrefix) setQuotePrefix(settings.quoteNumberPrefix);
    if (settings.quoteNumberIncludeYear !== undefined)
      setQuoteIncludeYear(settings.quoteNumberIncludeYear);
    if (settings.quoteNumberPadding)
      setQuotePadding(settings.quoteNumberPadding);

    if (settings.invoiceNumberMode) setInvoiceMode(settings.invoiceNumberMode);
    if (settings.invoiceNumberPrefix)
      setInvoicePrefix(settings.invoiceNumberPrefix);
    if (settings.invoiceNumberIncludeYear !== undefined)
      setInvoiceIncludeYear(settings.invoiceNumberIncludeYear);
    if (settings.invoiceNumberPadding)
      setInvoicePadding(settings.invoiceNumberPadding);

    if (settings.productCodeMode) setProductCodeMode(settings.productCodeMode);
    if (settings.productCodePrefix)
      setProductCodePrefix(settings.productCodePrefix);
    if (settings.productCodeIncludeYear !== undefined)
      setProductCodeIncludeYear(settings.productCodeIncludeYear);
    if (settings.productCodePadding)
      setProductCodePadding(settings.productCodePadding);

    if (settings.receiptVoucherNumberMode)
      setReceiptVoucherMode(settings.receiptVoucherNumberMode);
    if (settings.receiptVoucherNumberPrefix)
      setReceiptVoucherPrefix(settings.receiptVoucherNumberPrefix);
    if (settings.receiptVoucherNumberIncludeYear !== undefined)
      setReceiptVoucherIncludeYear(settings.receiptVoucherNumberIncludeYear);
    if (settings.receiptVoucherNumberPadding)
      setReceiptVoucherPadding(settings.receiptVoucherNumberPadding);

    setSynced(true);
  }

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        orgGroupId: effectiveOrgGroupId,
        quoteNumberMode: quoteMode,
        quoteNumberPrefix: quotePrefix.trim() || "QT",
        quoteNumberIncludeYear: quoteIncludeYear,
        quoteNumberPadding: quotePadding,

        invoiceNumberMode: invoiceMode,
        invoiceNumberPrefix: invoicePrefix.trim() || "INV",
        invoiceNumberIncludeYear: invoiceIncludeYear,
        invoiceNumberPadding: invoicePadding,

        productCodeMode,
        productCodePrefix: productCodePrefix.trim() || "PRD",
        productCodeIncludeYear: productCodeIncludeYear,
        productCodePadding: productCodePadding,

        receiptVoucherNumberMode: receiptVoucherMode,
        receiptVoucherNumberPrefix: receiptVoucherPrefix.trim() || "RV",
        receiptVoucherNumberIncludeYear: receiptVoucherIncludeYear,
        receiptVoucherNumberPadding: receiptVoucherPadding,
      });
      toast.success(t("numberingSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title={t("numberingTitle")}>
        <div className="space-y-5">
          <NumberingBlock
            label={t("quoteNumberLabel")}
            hint={t("quoteNumberHint")}
            mode={quoteMode}
            prefix={quotePrefix}
            includeYear={quoteIncludeYear}
            padding={quotePadding}
            onModeChange={setQuoteMode}
            onPrefixChange={setQuotePrefix}
            onIncludeYearChange={setQuoteIncludeYear}
            onPaddingChange={setQuotePadding}
            t={t}
          />
          <NumberingBlock
            label={t("invoiceNumberLabel")}
            hint={t("invoiceNumberHint")}
            mode={invoiceMode}
            prefix={invoicePrefix}
            includeYear={invoiceIncludeYear}
            padding={invoicePadding}
            onModeChange={setInvoiceMode}
            onPrefixChange={setInvoicePrefix}
            onIncludeYearChange={setInvoiceIncludeYear}
            onPaddingChange={setInvoicePadding}
            t={t}
          />
          <NumberingBlock
            label={t("productCodeLabel")}
            hint={t("productCodeHint")}
            mode={productCodeMode}
            prefix={productCodePrefix}
            includeYear={productCodeIncludeYear}
            padding={productCodePadding}
            onModeChange={setProductCodeMode}
            onPrefixChange={setProductCodePrefix}
            onIncludeYearChange={setProductCodeIncludeYear}
            onPaddingChange={setProductCodePadding}
            t={t}
          />
          <NumberingBlock
            label={t("receiptVoucherNumberLabel")}
            hint={t("receiptVoucherNumberHint")}
            mode={receiptVoucherMode}
            prefix={receiptVoucherPrefix}
            includeYear={receiptVoucherIncludeYear}
            padding={receiptVoucherPadding}
            onModeChange={setReceiptVoucherMode}
            onPrefixChange={setReceiptVoucherPrefix}
            onIncludeYearChange={setReceiptVoucherIncludeYear}
            onPaddingChange={setReceiptVoucherPadding}
            t={t}
          />
          <div className="flex justify-end pt-2">
            <Btn onClick={handleSave} disabled={saving}>
              {saving ? t("saving") : t("saveNumbering")}
            </Btn>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
