import Decimal from "decimal.js";

export type TaxInfo = {
  name?: string;
  /** Percentage rate: 15 means 15%. Legacy decimal fractions (0.15) are normalized on input. */
  rate?: number;
  taxId?: string;
};

export type TaxSummary = {
  taxId?: string;
  name: string;
  rate: number;
  taxableAmount: number;
  taxAmount: number;
};

export type LineInput = {
  /** Unit price before discount */
  price?: number;
  /** Unit discount (subtracted per unit, not line total) */
  discount?: number;
  quantity?: number;
  taxes?: TaxInfo[];
  [key: string]: unknown;
};

export type ProcessedLine<T extends LineInput = LineInput> = T & {
  /** Unit price after unit discount. Kept at source precision. */
  priceAfterDiscount: number;
  /** Line net amount before document-level general discount. */
  subtotal: number;
  /** Sum of line-level taxes calculated from the line net amount. */
  taxAmount: number;
  /** Line net amount + line-level taxes. */
  totalAfterTax: number;
};

type LineNet = {
  item: LineInput;
  priceAfterDiscount: Decimal;
  lineSubtotal: Decimal;
  taxes: TaxInfo[];
};

type TaxGroup = {
  key: string;
  taxId?: string;
  name: string;
  ratePercent: Decimal;
  taxableBase: Decimal;
  documentTaxAmount: Decimal;
};

const ROUND = Decimal.ROUND_HALF_UP;
const CENT = new Decimal(0.01);

/** ZATCA monetary rounding: 2 decimals, ROUND_HALF_UP. */
function money(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, ROUND);
}

function roundMoney(value: Decimal): number {
  return money(value).toNumber();
}

function assertFiniteNumber(
  value: number,
  label: string,
): asserts value is number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

/**
 * Normalize tax rate to percentage form.
 * - 15 -> 15%
 * - 0.15 (legacy DB snapshot) -> 15%
 */
function normalizeTaxRatePercent(rate: number): Decimal {
  assertFiniteNumber(rate, "tax.rate");

  if (rate < 0) {
    throw new Error("tax.rate cannot be negative.");
  }

  const decimalRate = new Decimal(rate);
  return rate > 0 && rate < 1 ? decimalRate.times(100) : decimalRate;
}

export function taxKey(tax: TaxInfo): string {
  if (tax.taxId) return tax.taxId;

  const rate = normalizeTaxRatePercent(tax.rate ?? 0);
  return `${tax.name || "Unnamed Tax"}|${rate.toString()}`;
}

function validateTaxes(taxes: TaxInfo[], label: string): void {
  const seenKeys = new Set<string>();

  for (const tax of taxes) {
    normalizeTaxRatePercent(tax.rate ?? 0);

    const key = taxKey(tax);
    if (seenKeys.has(key)) {
      throw new Error(`Duplicate tax "${tax.name || tax.taxId || key}" in ${label}.`);
    }
    seenKeys.add(key);
  }
}

function validateLineInput(item: LineInput): void {
  const price = item.price ?? 0;
  const discount = item.discount ?? 0;
  const quantity = item.quantity ?? 1;

  assertFiniteNumber(price, "price");
  assertFiniteNumber(discount, "discount");
  assertFiniteNumber(quantity, "quantity");

  if (Array.isArray(item.taxes)) {
    validateTaxes(item.taxes, "the same line");
  }
}

function computeLineNet(item: LineInput): LineNet {
  validateLineInput(item);

  const price = new Decimal(item.price ?? 0);
  const discount = new Decimal(item.discount ?? 0);
  const quantity = new Decimal(item.quantity ?? 1);

  // BT-146 style: item net price = gross unit price - unit price discount.
  const priceAfterDiscount = price.minus(discount);

  // BT-131: line net amount must be rounded to 2 decimals.
  const lineSubtotal = money(priceAfterDiscount.times(quantity));

  return {
    item,
    priceAfterDiscount,
    lineSubtotal,
    taxes: Array.isArray(item.taxes) ? item.taxes : [],
  };
}

/**
 * Allocate a 2-decimal document amount proportionally across lines.
 * The final allocations always add up exactly to `total`.
 */
function allocateProportionally(
  weights: Decimal[],
  total: Decimal,
): Decimal[] {
  if (weights.length === 0) return [];

  const roundedTotal = money(total);
  if (roundedTotal.isZero()) {
    return weights.map(() => new Decimal(0));
  }

  const weightSum = weights.reduce(
    (sum, weight) => sum.plus(weight),
    new Decimal(0),
  );

  if (weightSum.isZero()) {
    return weights.map(() => new Decimal(0));
  }

  const exactShares = weights.map((weight) =>
    roundedTotal.times(weight).div(weightSum),
  );

  const allocations = exactShares.map((share) => money(share));

  let remainder = roundedTotal.minus(
    allocations.reduce((sum, share) => sum.plus(share), new Decimal(0)),
  );

  if (!remainder.isZero()) {
    const ranked = exactShares
      .map((exact, index) => ({
        index,
        roundingError: exact.minus(allocations[index]),
      }))
      .sort((a, b) =>
        remainder.gt(0)
          ? b.roundingError.comparedTo(a.roundingError)
          : a.roundingError.comparedTo(b.roundingError),
      );

    let rank = 0;
    while (remainder.abs().gte(CENT) && rank < ranked.length) {
      const adjustment = remainder.gt(0) ? CENT : CENT.negated();
      const index = ranked[rank].index;

      allocations[index] = allocations[index].plus(adjustment);
      remainder = remainder.minus(adjustment);
      rank += 1;
    }
  }

  return allocations;
}

function buildTaxGroups(
  allNets: LineNet[],
  lineTaxableBases: Decimal[],
  shipping: Decimal,
  shippingTaxes: TaxInfo[],
): Map<string, TaxGroup> {
  const groups = new Map<string, TaxGroup>();
  const rateByTaxId = new Map<string, Decimal>();

  const registerTax = (tax: TaxInfo): TaxGroup => {
    const ratePercent = normalizeTaxRatePercent(tax.rate ?? 0);

    if (tax.taxId) {
      const existingRate = rateByTaxId.get(tax.taxId);
      if (existingRate && !existingRate.eq(ratePercent)) {
        throw new Error(
          `Tax configuration conflict: taxId "${tax.taxId}" is used with different rates in the same document.`,
        );
      }
      rateByTaxId.set(tax.taxId, ratePercent);
    }

    const key = taxKey(tax);
    const existing = groups.get(key);

    if (existing) {
      if (!existing.ratePercent.eq(ratePercent)) {
        throw new Error(
          `Tax configuration conflict: tax key "${key}" is used with different rates in the same document.`,
        );
      }
      return existing;
    }

    const group: TaxGroup = {
      key,
      taxId: tax.taxId,
      name: tax.name || "Unnamed Tax",
      ratePercent,
      taxableBase: new Decimal(0),
      documentTaxAmount: new Decimal(0),
    };

    groups.set(key, group);
    return group;
  };

  const addTaxableAmount = (tax: TaxInfo, amount: Decimal) => {
    const group = registerTax(tax);
    group.taxableBase = group.taxableBase.plus(amount);
  };

  allNets.forEach((line, index) => {
    for (const tax of line.taxes) {
      addTaxableAmount(tax, lineTaxableBases[index]);
    }
  });

  // Shipping is a document-level charge. Its amount is already rounded to 2 decimals.
  if (shipping.gt(0)) {
    for (const tax of shippingTaxes) {
      addTaxableAmount(tax, shipping);
    }
  }

  for (const group of groups.values()) {
    // BT-116: taxable amount has max 2 decimals.
    group.taxableBase = money(group.taxableBase);

    // BT-117: taxable amount * (rate / 100), rounded to 2 decimals.
    group.documentTaxAmount = money(
      group.taxableBase.times(group.ratePercent).div(100),
    );
  }

  return groups;
}

/**
 * General multi-country financial engine with ZATCA-compatible monetary rounding.
 *
 * Document flow:
 * Sum of rounded line nets - document discount + shipping = tax-exclusive total
 * Tax-exclusive total + grouped document taxes = total
 *
 * The engine remains tax-system agnostic: it supports any percentage and multiple
 * independent taxes. ZATCA category codes/exemption reasons belong in a separate adapter.
 */
export function calculateFinancialDocument<
  TLine extends LineInput = LineInput,
  TService extends LineInput = LineInput,
>(
  lineItems: TLine[] = [],
  services: TService[] = [],
  generalDiscount: number = 0,
  shippingAmount: number = 0,
  shippingTaxes: TaxInfo[] = [],
) {
  assertFiniteNumber(generalDiscount, "generalDiscount");
  assertFiniteNumber(shippingAmount, "shippingAmount");

  if (generalDiscount < 0) {
    throw new Error("generalDiscount cannot be negative.");
  }
  if (shippingAmount < 0) {
    throw new Error("shippingAmount cannot be negative.");
  }

  validateTaxes(shippingTaxes, "shippingTaxes");

  const productNets = lineItems.map(computeLineNet);
  const serviceNets = services.map(computeLineNet);
  const allNets = [...productNets, ...serviceNets];

  // BT-106: sum of already-rounded line net amounts.
  const linesSubtotal = money(
    allNets.reduce(
      (sum, line) => sum.plus(line.lineSubtotal),
      new Decimal(0),
    ),
  );

  // BT-92 / BT-99: document-level monetary amounts, max 2 decimals.
  const discountVal = money(new Decimal(generalDiscount));
  const shipping = money(new Decimal(shippingAmount));

  if (discountVal.gt(linesSubtotal)) {
    throw new Error(
      "General discount cannot exceed document lines subtotal.",
    );
  }

  // A general discount has no country-specific tax category in this generic engine,
  // so distribute it proportionally to derive each line's document-level taxable base.
  const allocatedGeneralDiscounts = allocateProportionally(
    allNets.map((line) => line.lineSubtotal),
    discountVal,
  );

  const lineTaxableBases = allNets.map((line, index) =>
    money(line.lineSubtotal.minus(allocatedGeneralDiscounts[index])),
  );

  const taxGroups = buildTaxGroups(
    allNets,
    lineTaxableBases,
    shipping,
    shippingTaxes,
  );

  const taxesSummary: TaxSummary[] = [];
  let totalTaxAmount = new Decimal(0);

  for (const group of taxGroups.values()) {
    taxesSummary.push({
      taxId: group.taxId,
      name: group.name,
      rate: group.ratePercent.toNumber(),
      taxableAmount: group.taxableBase.toNumber(),
      taxAmount: group.documentTaxAmount.toNumber(),
    });

    totalTaxAmount = totalTaxAmount.plus(group.documentTaxAmount);
  }

  // BT-110: sum of rounded tax-category amounts.
  totalTaxAmount = money(totalTaxAmount);

  taxesSummary.sort((a, b) => {
    const keyA = a.taxId ?? `${a.name}|${a.rate}`;
    const keyB = b.taxId ?? `${b.name}|${b.rate}`;
    return keyA.localeCompare(keyB);
  });

  // BT-109 = BT-106 - BT-107 + BT-108.
  const taxExclusiveTotal = money(
    linesSubtotal.minus(discountVal).plus(shipping),
  );

  // BT-112 = BT-109 + BT-110.
  const total = money(taxExclusiveTotal.plus(totalTaxAmount));

  /**
   * ZATCA line-level rule KSA-11 is based on the line net amount (BT-131),
   * not on the document-level general discount. For multiple international taxes,
   * calculate each independent line tax the same way and sum them.
   */
  const mapProcessed = <T extends LineInput>(
    nets: LineNet[],
  ): ProcessedLine<T>[] =>
    nets.map((line) => {
      let lineTaxAmount = new Decimal(0);

      for (const tax of line.taxes) {
        const rate = normalizeTaxRatePercent(tax.rate ?? 0);
        const taxAmount = money(line.lineSubtotal.times(rate).div(100));
        lineTaxAmount = lineTaxAmount.plus(taxAmount);
      }

      lineTaxAmount = money(lineTaxAmount);
      const lineTotalAfterTax = money(line.lineSubtotal.plus(lineTaxAmount));

      return {
        ...line.item,
        priceAfterDiscount: line.priceAfterDiscount.toNumber(),
        subtotal: line.lineSubtotal.toNumber(),
        taxAmount: lineTaxAmount.toNumber(),
        totalAfterTax: lineTotalAfterTax.toNumber(),
      } as ProcessedLine<T>;
    });

  return {
    processedLineItems: mapProcessed<TLine>(productNets),
    processedServices: mapProcessed<TService>(serviceNets),
    taxesSummary,
    subtotal: linesSubtotal.toNumber(),
    taxExclusiveTotal: taxExclusiveTotal.toNumber(),
    taxAmount: totalTaxAmount.toNumber(),
    total: total.toNumber(),
  };
}
