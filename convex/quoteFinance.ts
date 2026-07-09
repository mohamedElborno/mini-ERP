import Decimal from "decimal.js";
import { calculateFinancialDocument } from "./financials";

/**
 * Re-export: محرك المستندات المالي (ضرائب، إجماليات) — يستخدم Decimal داخلياً.
 * استورده من هنا ليكون الاستيراد لحسابات عرض السعر/الفواتير من مكان واحد.
 */
export { calculateFinancialDocument };

// ─── نوع مبسط للعملة (للخادم والواجهة) ───────────────────────────────────────

export type CurrencyRow = {
  _id: string;
  exchangeRate?: number | null;
  default?: boolean | null;
};

/**
 * **اتفاق سعر الصرف المسجّل لكل عملة (غير الافتراضية):**
 * `exchangeRate` = عدد وحدات **العملة الافتراضية** لكل **1** وحدة من **هذه** العملة.
 *
 * مثال: الافتراضي ريال، والدولار `exchangeRate` = 3.75
 *       ← يعني 1 دولار = 3.75 ريال → 100 دولار = 100 × 3.75 ريال.
 *
 * `مبلغ_بالافتراضي = مبلغ_بالعملة_المختارة × exchangeRate`
 * `مبلغ_بالعملة_المختارة = مبلغ_بالافتراضي ÷ exchangeRate`
 *
 * الافتراضي: مضاعف 1 (لا تغيير).
 */
export function convertAmountFromDefaultToCurrency(
  amountInDefault: number,
  selectedCurrencyId: string,
  defaultCurrencyId: string | undefined,
  currencies: CurrencyRow[],
): Decimal {
  const amt = new Decimal(amountInDefault);
  if (!defaultCurrencyId || selectedCurrencyId === defaultCurrencyId) {
    return amt;
  }
  const row = currencies.find((c) => c._id === selectedCurrencyId);
  if (!row) {
    return amt;
  }
  const rate = row.exchangeRate;
  if (rate == null || rate === 0) {
    return amt;
  }
  return amt.div(rate);
}

export function convertAmountFromDefaultToCurrencyNumber(
  amountInDefault: number,
  selectedCurrencyId: string,
  defaultCurrencyId: string | undefined,
  currencies: CurrencyRow[],
  fractionDigits: number = 2,
): number {
  return convertAmountFromDefaultToCurrency(
    amountInDefault,
    selectedCurrencyId,
    defaultCurrencyId,
    currencies,
  )
    .toDecimalPlaces(fractionDigits, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** Convert from voucher currency to the default currency */
export function convertAmountFromCurrencyToDefault(
  amountInCurrency: number,
  selectedCurrencyId: string,
  defaultCurrencyId: string | undefined,
  currencies: CurrencyRow[],
  fractionDigits: number = 2,
): number {
  if (!defaultCurrencyId || selectedCurrencyId === defaultCurrencyId) {
    return new Decimal(amountInCurrency)
      .toDecimalPlaces(fractionDigits, Decimal.ROUND_HALF_UP)
      .toNumber();
  }
  const row = currencies.find((c) => c._id === selectedCurrencyId);
  const rate = row?.exchangeRate;
  if (rate == null || rate === 0) {
    return new Decimal(amountInCurrency)
      .toDecimalPlaces(fractionDigits, Decimal.ROUND_HALF_UP)
      .toNumber();
  }
  return new Decimal(amountInCurrency)
    .mul(rate)
    .toDecimalPlaces(fractionDigits, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** للتحقق من تطابق السعر مع الواجهة (نفس الـ toNumber بعد التقريب) */
export function areAmountsEqualForQuoteLine(
  a: number,
  b: number,
  tolerance: number = 0.02,
): boolean {
  return new Decimal(a).minus(b).abs().lte(tolerance);
}

/**
 * يعاد احتساب `price` (سعر الوحدة) من سعر السجل في الافتراضي × سعر صرف عرض المستند.
 * للمنتجات والخدمات. يبقى الخصم والضرائب كما أُرسلت.
 */
export function withUnitPriceFromCatalog<T extends { price: number }>(
  line: T,
  unitPriceInDefault: number,
  quoteCurrencyId: string,
  defaultCurrencyId: string | undefined,
  currencies: CurrencyRow[],
  fractionDigits: number = 2,
): T {
  return {
    ...line,
    price: convertAmountFromDefaultToCurrencyNumber(
      unitPriceInDefault,
      quoteCurrencyId,
      defaultCurrencyId,
      currencies,
      fractionDigits,
    ),
  };
}

/** Convert a document amount to the org default currency for aggregation */
export function amountInDefaultCurrency(
  amount: number | undefined | null,
  documentCurrencyId: string | undefined | null,
  defaultCurrencyId: string | undefined,
  currencies: CurrencyRow[],
  fractionDigits: number = 2,
): number {
  if (amount == null) return 0;
  const cur = documentCurrencyId ?? defaultCurrencyId;
  if (!cur) return amount;
  return convertAmountFromCurrencyToDefault(
    amount,
    cur,
    defaultCurrencyId,
    currencies,
    fractionDigits,
  );
}
