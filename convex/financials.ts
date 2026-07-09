import Decimal from "decimal.js";

/**
 * The central financial engine for processing lines, calculating taxes, and totals
 * Fully relies on Decimal.js to prevent any leakage in the cents
 * Compatible with the new schema that supports multiple taxes per line
 */
export function calculateFinancialDocument(
  lineItems: any[] = [],
  services: any[] = [],
  generalDiscount: number = 0,
  shippingAmount: number = 0,
  shippingTaxes: any[] = [], // Array of shipping taxes
) {
  let subtotal = new Decimal(0);
  let totalTaxAmount = new Decimal(0);

  // Object to collect amounts by tax name (very useful for printing the invoice and accounting reports)
  // Example output: { "VAT 15%": 150.50, "City Tax 2%": 20.00 }
  const taxesSummary: Record<string, number> = {};

  // Helper function to process a single line (product or service)
  const processItem = (item: any) => {
    const price = new Decimal(item.price || 0);
    const discount = new Decimal(item.discount || 0);
    const quantity = new Decimal(item.quantity || 1);

    // Price after line discount
    const priceAfterDiscount = price.minus(discount);
    // Line subtotal before tax
    const lineSubtotal = priceAfterDiscount.times(quantity);

    let lineTaxAmount = new Decimal(0);

    // Calculate multiple taxes for the line if any
    if (item.taxes && Array.isArray(item.taxes)) {
      item.taxes.forEach((taxInfo: any) => {
        const rate = new Decimal(taxInfo.rate || 0);

        // Calculate the amount of this specific tax and round it to the nearest cent
        const specificTaxAmount = lineSubtotal
          .times(rate)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

        // Add the tax amount to the total tax amount of the line
        lineTaxAmount = lineTaxAmount.plus(specificTaxAmount);

        // Collect the total amount of this type of tax in the invoice as a whole
        const taxName = taxInfo.name || "Unnamed Tax";
        const currentTaxSum = new Decimal(taxesSummary[taxName] || 0);
        taxesSummary[taxName] = currentTaxSum
          .plus(specificTaxAmount)
          .toNumber();
      });
    }

    const totalAfterTax = lineSubtotal.plus(lineTaxAmount);

    // Add the line results to the totals
    subtotal = subtotal.plus(lineSubtotal);
    totalTaxAmount = totalTaxAmount.plus(lineTaxAmount);

    return {
      ...item,
      // Convert the values from Decimal to regular numbers so that Convex Schema can accept them
      priceAfterDiscount: priceAfterDiscount.toNumber(),
      subtotal: lineSubtotal.toNumber(),
      taxAmount: lineTaxAmount.toNumber(), // Total of all taxes on this line
      totalAfterTax: totalAfterTax.toNumber(),
    };
  };

  // Process the arrays of products and services
  const processedLineItems = lineItems.map(processItem);
  const processedServices = services.map(processItem);

  // Process shipping taxes
  const shipping = new Decimal(shippingAmount || 0);
  let shippingTaxTotal = new Decimal(0);

  if (shippingTaxes && Array.isArray(shippingTaxes)) {
    shippingTaxes.forEach((taxInfo: any) => {
      const rate = new Decimal(taxInfo.rate || 0);
      const taxAmt = shipping
        .times(rate)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      shippingTaxTotal = shippingTaxTotal.plus(taxAmt);

      const taxName = taxInfo.name || "Shipping Tax";
      const currentTaxSum = new Decimal(taxesSummary[taxName] || 0);
      taxesSummary[taxName] = currentTaxSum.plus(taxAmt).toNumber();
    });
  }

  totalTaxAmount = totalTaxAmount.plus(shippingTaxTotal);

  // Final calculations for the invoice or price quote
  const discountVal = new Decimal(generalDiscount || 0);
  const finalSubtotal = subtotal.plus(shipping).minus(discountVal);
  const total = finalSubtotal.plus(totalTaxAmount);

  return {
    processedLineItems,
    processedServices,
    taxesSummary, // Returned tax summary so you can save or display it
    subtotal: subtotal.toNumber(), // Total of lines before tax
    taxAmount: totalTaxAmount.toNumber(), // Total of all taxes
    total: total.toNumber(), // Final total required by the client
  };
}
