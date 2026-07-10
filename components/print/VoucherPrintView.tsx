"use client";

import type { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { PrintLang } from "./printLabels";
import { getLabels, fmtDate, fmtNum } from "./printLabels";

type VoucherPrintData = NonNullable<FunctionReturnType<typeof api.receiptVouchers.getVoucherForPrint>>;

export function VoucherPrintView({ data, lang }: { data: VoucherPrintData; lang: PrintLang }) {
  const L = getLabels(lang);
  const { voucher, company, contact, group, currencySymbol, invoiceDetails } = data;
  const sym = currencySymbol ?? "";

  const paymentMethodLabel = L[voucher.paymentMethod as keyof typeof L] ?? voucher.paymentMethod ?? "—";

  return (
    <div className="print-page">
      {/* ── Header ── */}
      <div className="doc-header">
        <div>
          <div className="doc-company-name">{group?.name ?? "—"}</div>
        </div>
        <div className="doc-title-block">
          <div className="doc-title">{L.receiptVoucher}</div>
          <div className="doc-number">{voucher.number ?? "—"}</div>
          <div className="doc-meta">{L.date}: {fmtDate(voucher.issueDate, lang)}</div>
        </div>
      </div>

      {/* ── Received from ── */}
      <div className="client-section">
        <div className="client-col">
          <div className="section-label">{L.receivedFrom}</div>
          {company && (
            <>
              <div className="client-name">{company.name}</div>
              {company.address && <div className="client-sub">{company.address}</div>}
              {(company.city || company.country) && (
                <div className="client-sub">{[company.city, company.country].filter(Boolean).join(", ")}</div>
              )}
            </>
          )}
          {contact && (
            <>
              <div className="client-sub mt-2">{L.contact}: {contact.name}</div>
              {contact.phone && <div className="client-sub">{L.phone}: {contact.phone}</div>}
              {contact.email && <div className="client-sub">{L.email}: {contact.email}</div>}
            </>
          )}
        </div>
      </div>

      {/* ── Amount box ── */}
      <div className="amount-box">
        <div>
          <div className="amount-label">{L.amount}</div>
          <div className="amount-big">{fmtNum(voucher.amount, sym)}</div>
          {voucher.netAmount != null && voucher.netAmount !== voucher.amount && (
            <div style={{ fontSize: "11px", color: "#666", marginTop: 4 }}>
              {lang === "ar" ? "صافي:" : "Net:"} {fmtNum(voucher.netAmount, sym)}
            </div>
          )}
        </div>
        <div style={{ textAlign: "end" }}>
          <div className="amount-label">{L.paymentMethod}</div>
          <div style={{ fontSize: "14px", fontWeight: 600 }}>{paymentMethodLabel}</div>
          {voucher.exchangeRateUsed != null && voucher.exchangeRateUsed !== 1 && (
            <>
              <div className="amount-label mt-2">{L.exchangeRate}</div>
              <div style={{ fontSize: "12px" }}>{voucher.exchangeRateUsed}</div>
            </>
          )}
          {voucher.amountInDefaultCurrency != null && voucher.exchangeRateUsed !== 1 && (
            <>
              <div className="amount-label mt-2">{L.amountInDefault}</div>
              <div style={{ fontSize: "12px", fontWeight: 600 }}>{fmtNum(voucher.amountInDefaultCurrency)}</div>
            </>
          )}
        </div>
      </div>

      {/* ── Invoice allocations table ── */}
      {invoiceDetails && invoiceDetails.length > 0 && (
        <div className="mt-4">
          <div className="section-label mb-2">{L.invoiceAllocations}</div>
          <table className="items-table">
            <thead>
              <tr>
                <th>{L.invoiceNumber}</th>
                <th className="num-col">{lang === "ar" ? "إجمالي الفاتورة" : "Invoice Total"}</th>
                <th className="num-col">{L.allocatedAmount}</th>
              </tr>
            </thead>
            <tbody>
              {invoiceDetails.map((inv) =>
                inv ? (
                  <tr key={inv.invoiceId}>
                    <td style={{ fontWeight: 500 }}>{inv.number}</td>
                    <td className="num-col">{fmtNum(inv.total, sym)}</td>
                    <td className="num-col" style={{ fontWeight: 600 }}>{fmtNum(inv.allocated, sym)}</td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Notes ── */}
      {voucher.description && (
        <div className="mt-4" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "12px" }}>
          <div className="section-label">{L.notes}</div>
          <p style={{ fontSize: "11px", color: "#555", marginTop: "4px", lineHeight: 1.6 }}>{voucher.description}</p>
        </div>
      )}

      {/* ── Signature ── */}
      <div className="signature-section">
        <div className="signature-box">
          <div className="signature-line" />
          <div className="signature-label">{L.authorizedSignature}</div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="print-footer">
        <span>{voucher.number}</span>
        <span>{fmtDate(voucher.issueDate, lang)}</span>
      </div>
    </div>
  );
}
