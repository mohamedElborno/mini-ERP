"use client";

import type { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { PrintLang } from "./printLabels";
import { getLabels, fmtDate, fmtNum } from "./printLabels";

type QuotePrintData = NonNullable<FunctionReturnType<typeof api.quotes.getQuoteForPrint>>;

function statusColor(status: string) {
  if (status === "accepted" || status === "invoiced") return "#16a34a";
  if (status === "rejected" || status === "expired") return "#dc2626";
  if (status === "sent") return "#2563eb";
  return "#6b7280";
}

export function QuotePrintView({ data, lang }: { data: QuotePrintData; lang: PrintLang }) {
  const L = getLabels(lang);
  const { quote, company, contact, group, currency, lineItems, services } = data;
  const sym = currency?.symbol ?? "";
  const allItems = [...lineItems, ...services];

  const statusLabel = L[quote.status as keyof typeof L] ?? quote.status ?? "—";

  return (
    <div className="print-page">
      {/* ── Header ── */}
      <div className="doc-header">
        <div>
          <div className="doc-company-name">{group?.name ?? "—"}</div>
        </div>
        <div className="doc-title-block">
          <div className="doc-title">{L.quote}</div>
          <div className="doc-number">{quote.number ?? "—"}{quote.revision ? ` (R${quote.revision})` : ""}</div>
          <div className="doc-meta">{L.date}: {fmtDate(quote.issueDate, lang)}</div>
          {quote.dueDate && <div className="doc-meta">{L.dueDate}: {fmtDate(quote.dueDate, lang)}</div>}
          {quote.expirationDate && <div className="doc-meta">{L.expiryDate}: {fmtDate(quote.expirationDate, lang)}</div>}
          {quote.deliveryDate && <div className="doc-meta">{L.deliveryDate}: {fmtDate(quote.deliveryDate, lang)}</div>}
          <span className="status-badge" style={{ color: statusColor(quote.status ?? ""), borderColor: statusColor(quote.status ?? "") }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* ── Client info ── */}
      <div className="client-section">
        <div className="client-col">
          <div className="section-label">{L.billTo}</div>
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
        {data.dealTitle && (
          <div className="client-col">
            <div className="section-label">{L.dealRef}</div>
            <div className="client-name">{data.dealTitle}</div>
          </div>
        )}
      </div>

      {/* ── Terms row ── */}
      {(data.paymentTermsName || data.shippingTermsName || data.deliveryTermsName || quote.paymentMethod) && (
        <div className="terms-row">
          {quote.paymentMethod && (
            <div className="term-box">
              <div className="term-label">{L.paymentMethod}</div>
              <div className="term-value">{quote.paymentMethod === "immediate" ? (lang === "ar" ? "فوري" : "Immediate") : (lang === "ar" ? "آجل" : "On Credit")}</div>
            </div>
          )}
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
            <th className="num-col" style={{ width: "90px" }}>{L.tax}</th>
            <th className="num-col" style={{ width: "100px" }}>{L.lineTotal}</th>
          </tr>
        </thead>
        <tbody>
          {allItems.map((item) => (
            <tr key={item.index}>
              <td style={{ color: "#999", fontSize: "11px" }}>{item.index}</td>
              <td>
                <div className="item-name">{item.name}</div>
                {item.taxes.length > 0 && (
                  <div className="item-taxes">
                    {item.taxes.map(t => `${t.name ?? ""} ${(t.rate * 100).toFixed(0)}%`).join(" · ")}
                  </div>
                )}
              </td>
              <td className="num-col">{item.quantity}</td>
              <td className="num-col">{fmtNum(item.price)}</td>
              {allItems.some(i => i.discount > 0) && (
                <td className="num-col">{item.discount > 0 ? `${item.discount}%` : "—"}</td>
              )}
              <td className="num-col">{item.taxAmount > 0 ? fmtNum(item.taxAmount) : "—"}</td>
              <td className="num-col" style={{ fontWeight: 600 }}>{fmtNum(item.total, sym)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Totals ── */}
      <div className="totals-wrapper">
        <div className="totals-box">
          {quote.subtotal != null && (
            <div className="totals-row-item">
              <span className="totals-label">{L.subtotal}</span>
              <span className="totals-value">{fmtNum(quote.subtotal, sym)}</span>
            </div>
          )}
          {(quote.discount ?? 0) > 0 && (
            <div className="totals-row-item">
              <span className="totals-label">{L.generalDiscount}</span>
              <span className="totals-value">− {fmtNum(quote.discount, sym)}</span>
            </div>
          )}
          {(quote.shippingAmount ?? 0) > 0 && (
            <div className="totals-row-item">
              <span className="totals-label">{L.shipping}</span>
              <span className="totals-value">{fmtNum(quote.shippingAmount, sym)}</span>
            </div>
          )}
          {(quote.taxAmount ?? 0) > 0 && (
            <div className="totals-row-item">
              <span className="totals-label">{L.taxes}</span>
              <span className="totals-value">{fmtNum(quote.taxAmount, sym)}</span>
            </div>
          )}
          <div className="totals-row-item grand-total">
            <span>{L.total}</span>
            <span>{fmtNum(quote.total, sym)}</span>
          </div>
        </div>
      </div>

      {/* ── Notes / Description ── */}
      {quote.description && (
        <div className="mt-4" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "12px" }}>
          <div className="section-label">{L.notes}</div>
          <p style={{ fontSize: "11px", color: "#555", marginTop: "4px", lineHeight: 1.6 }}>{quote.description}</p>
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
        <span>{quote.number}{quote.revision ? ` R${quote.revision}` : ""}</span>
        <span>{fmtDate(quote.issueDate, lang)}</span>
      </div>
    </div>
  );
}
