import { describe, expect, it } from "vitest";
import { calculateFinancialDocument } from "./financials";

describe("calculateFinancialDocument", () => {
  it("Test 1 — single VAT 15%", () => {
    const result = calculateFinancialDocument(
      [{ price: 100, quantity: 1, taxes: [{ taxId: "vat", name: "VAT", rate: 15 }] }],
      [],
    );

    expect(result.subtotal).toBe(100);
    expect(result.taxExclusiveTotal).toBe(100);
    expect(result.taxAmount).toBe(15);
    expect(result.total).toBe(115);
  });

  it("Test 2 — Egypt VAT 14%", () => {
    const result = calculateFinancialDocument(
      [{ price: 100, quantity: 1, taxes: [{ taxId: "vat", name: "VAT", rate: 14 }] }],
      [],
    );

    expect(result.taxAmount).toBe(14);
    expect(result.total).toBe(114);
  });

  it("Test 3 — multiple independent taxes", () => {
    const result = calculateFinancialDocument(
      [
        {
          price: 100,
          quantity: 1,
          taxes: [
            { taxId: "tax-a", name: "Tax A", rate: 15 },
            { taxId: "tax-b", name: "Tax B", rate: 2 },
          ],
        },
      ],
      [],
    );

    const taxA = result.taxesSummary.find((tax) => tax.taxId === "tax-a");
    const taxB = result.taxesSummary.find((tax) => tax.taxId === "tax-b");
    expect(taxA?.taxAmount).toBe(15);
    expect(taxB?.taxAmount).toBe(2);
    expect(result.taxAmount).toBe(17);
    expect(result.total).toBe(117);
  });

  it("Test 4 — general discount before tax", () => {
    const result = calculateFinancialDocument(
      [{ price: 100, quantity: 1, taxes: [{ taxId: "vat", name: "VAT", rate: 15 }] }],
      [],
      10,
    );

    expect(result.subtotal).toBe(100);
    expect(result.taxExclusiveTotal).toBe(90);
    expect(result.taxAmount).toBe(13.5);
    expect(result.total).toBe(103.5);
  });

  it("Test 5 — different tax rates with general discount", () => {
    const result = calculateFinancialDocument(
      [
        {
          price: 100,
          quantity: 1,
          taxes: [{ taxId: "vat", name: "VAT", rate: 15 }],
        },
        {
          price: 200,
          quantity: 1,
        },
      ],
      [],
      30,
    );

    expect(result.subtotal).toBe(300);
    expect(result.taxExclusiveTotal).toBe(270);
    expect(result.taxAmount).toBe(13.5);
    expect(result.total).toBe(283.5);

    const vat = result.taxesSummary.find((tax) => tax.taxId === "vat");
    expect(vat?.taxableAmount).toBe(90);
    expect(vat?.taxAmount).toBe(13.5);
  });

  it("Test 6 — shipping with VAT", () => {
    const result = calculateFinancialDocument(
      [{ price: 100, quantity: 1, taxes: [{ taxId: "vat", name: "VAT", rate: 15 }] }],
      [],
      10,
      20,
      [{ taxId: "vat", name: "VAT", rate: 15 }],
    );

    expect(result.taxExclusiveTotal).toBe(110);
    expect(result.taxAmount).toBe(16.5);
    expect(result.total).toBe(126.5);
    expect(result.processedLineItems[0].taxAmount).toBe(13.5);
  });

  it("Test 7 — unit discount", () => {
    const result = calculateFinancialDocument(
      [{ price: 100, discount: 10, quantity: 2 }],
      [],
    );

    expect(result.processedLineItems[0].priceAfterDiscount).toBe(90);
    expect(result.processedLineItems[0].subtotal).toBe(180);
    expect(result.subtotal).toBe(180);
  });

  it("Test 8 — quantity zero is not coerced to 1", () => {
    const result = calculateFinancialDocument([{ price: 100, quantity: 0 }], []);

    expect(result.processedLineItems[0].subtotal).toBe(0);
    expect(result.subtotal).toBe(0);
  });

  it("Test 9 — general discount greater than subtotal throws", () => {
    expect(() =>
      calculateFinancialDocument([{ price: 100, quantity: 1 }], [], 101),
    ).toThrow("General discount cannot exceed document lines subtotal.");
  });

  it("Test 10 — rounding and remainder allocation", () => {
    const result = calculateFinancialDocument(
      [
        { price: 33.33, quantity: 1, taxes: [{ taxId: "vat", name: "VAT", rate: 15 }] },
        { price: 33.33, quantity: 1, taxes: [{ taxId: "vat", name: "VAT", rate: 15 }] },
        { price: 33.34, quantity: 1, taxes: [{ taxId: "vat", name: "VAT", rate: 15 }] },
      ],
      [],
      10,
    );

    const lineSubtotalSum = result.processedLineItems.reduce(
      (sum, line) => sum + line.subtotal,
      0,
    );
    expect(lineSubtotalSum).toBe(result.subtotal);

    const allocatedDiscount = result.subtotal - result.taxExclusiveTotal;
    expect(allocatedDiscount).toBe(10);

    const allocatedLineTax = result.processedLineItems.reduce(
      (sum, line) => sum + line.taxAmount,
      0,
    );
    expect(allocatedLineTax).toBe(result.taxAmount);
  });

  it("supports legacy decimal tax rates from stored documents", () => {
    const result = calculateFinancialDocument(
      [{ price: 100, quantity: 1, taxes: [{ taxId: "vat", name: "VAT", rate: 0.15 }] }],
      [],
    );

    expect(result.taxAmount).toBe(15);
    expect(result.total).toBe(115);
  });

  it("throws when same taxId uses different rates", () => {
    expect(() =>
      calculateFinancialDocument(
        [
          {
            price: 100,
            quantity: 1,
            taxes: [{ taxId: "vat", name: "VAT", rate: 15 }],
          },
        ],
        [],
        0,
        20,
        [{ taxId: "vat", name: "VAT", rate: 14 }],
      ),
    ).toThrow('Tax configuration conflict: taxId "vat" is used with different rates');
  });

  it("throws when duplicate taxId appears on the same line", () => {
    expect(() =>
      calculateFinancialDocument(
        [
          {
            price: 100,
            quantity: 1,
            taxes: [
              { taxId: "vat", name: "VAT", rate: 15 },
              { taxId: "vat", name: "VAT", rate: 15 },
            ],
          },
        ],
        [],
      ),
    ).toThrow('Duplicate taxId "vat" on the same line.');
  });
});
