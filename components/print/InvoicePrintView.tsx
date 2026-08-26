"use client";

import { useMemo } from "react";
import type { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { PrintLang } from "./printLabels";
import { getLabels, fmtDate, fmtNum } from "./printLabels";
import { PrintDocumentHeader } from "./PrintDocumentHeader";
import { PrintNationalAddressBlock } from "./PrintNationalAddressBlock";

type InvoicePrintData = NonNullable<FunctionReturnType<typeof api.invoices.getInvoiceForPrint>>;

function statusColor(status: string) {
  if (status === "paid") return "#16a34a";
  if (status === "overdue" || status === "void") return "#dc2626";
  if (status === "partially_paid") return "#f59e0b";
  if (status === "sent") return "#2563eb";
  return "#6b7280";
}

export function InvoicePrintView({
  data,
  lang,
  showPublicQr = true,
  publicViewUrl: publicViewUrlProp,
  qrLabel: qrLabelProp,
}: {
  data: InvoicePrintData;
  lang: PrintLang;
  showPublicQr?: boolean;
  publicViewUrl?: string | null;
  qrLabel?: string;
}) {
  const L = getLabels(lang);
  const { invoice, company, contact, group, currency, lineItems, services, quoteRef } = data;
  const sym = currency?.symbol ?? "";
  const allItems = [...lineItems, ...services];

  const statusLabel = L[invoice.status as keyof typeof L] ?? invoice.status ?? "—";
  const isPaid = invoice.status === "paid";

  const publicViewUrl = useMemo(() => {
    if (publicViewUrlProp) return publicViewUrlProp;
    return null;
  }, [publicViewUrlProp]);

  const qrLabel = qrLabelProp ?? L.scanToView;

  return (
    <div className="print-page">
      {/* ── Header ── */}
      <PrintDocumentHeader
        group={group}
        lang={lang}
        publicViewUrl={showPublicQr ? publicViewUrl : null}
        qrLabel={qrLabel}
        subtitle={
          quoteRef?.number ? (
            <div className="doc-company-sub">
              {L.quoteRef}: {quoteRef.number}
              {quoteRef.revision ? ` R${quoteRef.revision}` : ""}
            </div>
          ) : undefined
        }
      >
        <div className="doc-title-row">
          <div className="doc-title">{L.invoice}</div>
          <span
            className="status-badge"
            style={{
              color: statusColor(invoice.status ?? ""),
              borderColor: statusColor(invoice.status ?? ""),
            }}
          >
            {statusLabel}
          </span>
        </div>
        <div className="doc-number">{invoice.number ?? "—"}</div>
        <div className="doc-meta-list">
          <div className="doc-meta">
            {L.date}: {fmtDate(invoice.issueDate, lang)}
          </div>
          {invoice.dueDate && (
            <div className="doc-meta">
              {L.dueDate}: {fmtDate(invoice.dueDate, lang)}
            </div>
          )}
          {invoice.deliveryDate && (
            <div className="doc-meta">
              {L.deliveryDate}: {fmtDate(invoice.deliveryDate, lang)}
            </div>
          )}
        </div>
      </PrintDocumentHeader>

      {/* ── Client info ── */}
      <div className="client-section">
        <div className="client-col">
          <div className="section-label">{L.billTo}</div>
          {company && (
            <>
              <div className="client-name">{company.name}</div>
              <PrintNationalAddressBlock data={company} lang={lang} />
              {company.taxNumber && (
                <div className="client-sub">{L.taxNumber}: {company.taxNumber}</div>
              )}
            </>
          )}
          {contact && (
            <>
              <div className="client-sub mt-2">{L.contact}: {contact.name}</div>
              {contact.phone && <div className="client-sub">{L.phone}: {contact.phone}</div>}
            </>
          )}
        </div>
        <div className="client-col">
          {isPaid && (
            <div style={{ textAlign: "end", padding: "6px 10px", border: "2px solid #16a34a", borderRadius: 6, color: "#16a34a", fontWeight: 700, fontSize: 13 }}>
              ✓ {L.paid}
            </div>
          )}
        </div>
      </div>

      {/* ── Terms ── */}
      {(data.paymentTermsName || data.shippingTermsName || data.deliveryTermsName) && (
        <div className="terms-row">
          {data.paymentTermsName && (
            <div className="term-box">
              <div className="term-label">{L.paymentTerms}</div>
              <div className="term-value">{data.paymentTermsName}</div>
            </div>
          )}
          {data.shippingTermsName && (
            <div className="term-box">
              <div className="term-label">{L.shippingTerms}</div>
              <div className="term-value">{data.shippingTermsName}</div>
            </div>
          )}
          {data.deliveryTermsName && (
            <div className="term-box">
              <div className="term-label">{L.deliveryTerms}</div>
              <div className="term-value">{data.deliveryTermsName}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Line items ── */}
      <table className="items-table">
        <thead>
          <tr>
            <th style={{ width: "32px" }}>{L.lineNo}</th>
            <th>{L.description}</th>
            <th className="num-col" style={{ width: "60px" }}>{L.qty}</th>
            <th className="num-col" style={{ width: "90px" }}>{L.unitPrice}</th>
            {allItems.some(i => i.discount > 0) && <th className="num-col" style={{ width: "72px" }}>{L.discount}</th>}
            <th className="num-col" style={{ width: "100px" }}>{L.lineTotal}</th>
          </tr>
        </thead>
        <tbody>
          {allItems.map((item) => (
            <tr key={item.index}>
              <td style={{ color: "#999", fontSize: "11px" }}>{item.index}</td>
              <td>
                <div className="item-name">{item.name}</div>
              </td>
              <td className="num-col">{item.quantity}</td>
              <td className="num-col">{fmtNum(item.price)}</td>
              {allItems.some(i => i.discount > 0) && (
                <td className="num-col">{item.discount > 0 ? fmtNum(item.discount, sym) : "—"}</td>
              )}
              <td className="num-col" style={{ fontWeight: 600 }}>{fmtNum(item.subtotal, sym)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Totals ── */}
      <div className="totals-wrapper">
        <div className="totals-box">
          {invoice.subtotal != null && (
            <div className="totals-row-item">
              <span className="totals-label">{L.subtotal}</span>
              <span className="totals-value">{fmtNum(invoice.subtotal, sym)}</span>
            </div>
          )}
          {(invoice.discount ?? 0) > 0 && (
            <div className="totals-row-item">
              <span className="totals-label">{L.generalDiscount}</span>
              <span className="totals-value">− {fmtNum(invoice.discount, sym)}</span>
            </div>
          )}
          {(invoice.shippingAmount ?? 0) > 0 && (
            <div className="totals-row-item">
              <span className="totals-label">{L.shipping}</span>
              <span className="totals-value">{fmtNum(invoice.shippingAmount, sym)}</span>
            </div>
          )}
          {(invoice.taxAmount ?? 0) > 0 && (
            <div className="totals-row-item">
              <span className="totals-label">{L.taxes}</span>
              <span className="totals-value">{fmtNum(invoice.taxAmount, sym)}</span>
            </div>
          )}
          <div className="totals-row-item grand-total">
            <span>{L.total}</span>
            <span>{fmtNum(invoice.total, sym)}</span>
          </div>
        </div>
      </div>

      {/* ── Description/Notes ── */}
      {invoice.description && (
        <div className="mt-4" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "12px" }}>
          <div className="section-label">{L.notes}</div>
          <p style={{ fontSize: "11px", color: "#555", marginTop: "4px", lineHeight: 1.6 }}>{invoice.description}</p>
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
        <span>{invoice.number}</span>
        <span>{fmtDate(invoice.issueDate, lang)}</span>
      </div>
    </div>
  );
}
