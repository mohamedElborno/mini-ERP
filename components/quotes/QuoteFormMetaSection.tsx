"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import type { EnrichedDeal } from "./quoteFormShared";
import { inputCls, labelCls } from "./quoteFormShared";
import { QuoteDatePickerField } from "./QuoteDatePickerField";

type CurrencyRow = {
  _id: Id<"currencies">;
  name: string;
  symbol: string;
  default?: boolean | null;
};

export type QuotePaymentMethod = "immediate" | "on_credit";

type Props = {
  labelClsOverride?: string;
  inputClsOverride?: string;
  dealId: Id<"deals"> | "";
  onDealChange: (id: Id<"deals"> | "") => void;
  deals: EnrichedDeal[] | undefined;
  currencyId: Id<"currencies"> | "";
  onCurrencyChange: (id: Id<"currencies">) => void;
  onRepriceAllLines: (currency: Id<"currencies">) => void;
  currencies: CurrencyRow[] | undefined;
  number: string;
  onNumberChange: (v: string) => void;
  issueDate: Date | undefined;
  onIssueDateChange: (d: Date | undefined) => void;
  dueDate: Date | undefined;
  onDueDateChange: (d: Date | undefined) => void;
  expirationDate: Date | undefined;
  onExpirationDateChange: (d: Date | undefined) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  paymentMethod: QuotePaymentMethod;
  onPaymentMethodChange: (v: QuotePaymentMethod) => void;
  paymentMethodReadOnly?: boolean;
  /** تعديل عرض: الصفقة والرقم ثابتان */
  dealReadOnly?: boolean;
  dealTitleReadOnly?: string;
  numberReadOnly?: boolean;
};

export function QuoteFormMetaSection({
  labelClsOverride = labelCls,
  inputClsOverride = inputCls,
  dealId,
  onDealChange,
  deals,
  currencyId,
  onCurrencyChange,
  onRepriceAllLines,
  currencies,
  number,
  onNumberChange,
  issueDate,
  onIssueDateChange,
  dueDate,
  onDueDateChange,
  expirationDate,
  onExpirationDateChange,
  description,
  onDescriptionChange,
  paymentMethod,
  onPaymentMethodChange,
  paymentMethodReadOnly = false,
  dealReadOnly = false,
  dealTitleReadOnly,
  numberReadOnly = false,
}: Props) {
  const t = useTranslations("quotesPage");
  const locale = useLocale();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className={labelClsOverride}>{t("createDeal")} *</label>
        {dealReadOnly && dealId ? (
          <p className="border-input text-foreground bg-muted/20 rounded-lg border px-3 py-2 text-sm">
            {dealTitleReadOnly ||
              deals?.find((d) => d._id === dealId)?.title ||
              "—"}
          </p>
        ) : (
          <select
            className={inputClsOverride}
            value={dealId}
            onChange={(e) =>
              onDealChange(e.target.value as Id<"deals"> | "")
            }
            required
          >
            <option value="">{t("createSelectDeal")}</option>
            {deals?.map((d) => (
              <option key={d._id} value={d._id}>
                {d.title}
                {d.companyName ? ` — ${d.companyName}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className={labelClsOverride}>{t("createCurrency")} *</label>
        <select
          className={inputClsOverride}
          value={currencyId}
          onChange={(e) => {
            const next = e.target.value as Id<"currencies">;
            onCurrencyChange(next);
            onRepriceAllLines(next);
          }}
          required
        >
          <option value="">{t("createSelectCurrency")}</option>
          {currencies?.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name} ({c.symbol})
              {c.default ? ` — ${t("defaultCurrencyBadge")}` : ""}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {t("createCurrencyHint")}
        </p>
      </div>

      <div>
        <label className={labelClsOverride}>{t("createNumber")}</label>
        <input
          className={inputClsOverride}
          value={number}
          onChange={(e) => onNumberChange(e.target.value)}
          placeholder={t("createNumberPlaceholder")}
          readOnly={numberReadOnly}
          disabled={numberReadOnly}
        />
      </div>

      <div className="sm:col-span-2">
        <label className={labelClsOverride}>{t("createPaymentMethod")}</label>
        <div className="mt-1 flex flex-wrap gap-4">
          {(
            [
              ["immediate", "paymentMethodImmediate"],
              ["on_credit", "paymentMethodOnCredit"],
            ] as const
          ).map(([value, labelKey]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 text-sm ${
                paymentMethodReadOnly ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              <input
                type="radio"
                name="quotePaymentMethod"
                value={value}
                checked={paymentMethod === value}
                disabled={paymentMethodReadOnly}
                onChange={() => onPaymentMethodChange(value)}
                className="accent-primary"
              />
              {t(labelKey)}
            </label>
          ))}
        </div>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {paymentMethod === "on_credit"
            ? t("createPaymentMethodOnCreditHint")
            : t("createPaymentMethodImmediateHint")}
        </p>
      </div>

      <div>
        <label className={labelClsOverride}>{t("createIssueDate")}</label>
        <QuoteDatePickerField
          value={issueDate}
          onChange={onIssueDateChange}
          placeholder={t("pickDate")}
          locale={locale}
        />
      </div>
      <div>
        <label className={labelClsOverride}>{t("createDueDate")}</label>
        <QuoteDatePickerField
          value={dueDate}
          onChange={onDueDateChange}
          placeholder={t("pickDate")}
          locale={locale}
        />
      </div>
      <div>
        <label className={labelClsOverride}>{t("createExpiry")}</label>
        <QuoteDatePickerField
          value={expirationDate}
          onChange={onExpirationDateChange}
          placeholder={t("pickDate")}
          locale={locale}
        />
      </div>

      <div className="sm:col-span-2">
        <label className={labelClsOverride}>{t("createDescription")}</label>
        <input
          className={inputClsOverride}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={t("createDescriptionPlaceholder")}
        />
      </div>
    </div>
  );
}
