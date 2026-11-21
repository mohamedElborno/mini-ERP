"use client";

import type { ReactNode } from "react";
import type { PrintLang } from "./printLabels";

const PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    font-size: 13px;
    color: #1a1a1a;
    background: #e5e7eb;
  }

  /* A4 page on screen */
  .print-page {
    width: 210mm;
    min-height: 297mm;
    margin: 24px auto;
    background: #fff;
    padding: 18mm 20mm 16mm;
    box-shadow: 0 4px 32px rgba(0,0,0,0.18);
    position: relative;
  }

  /* Print overrides */
  @media print {
    body { background: white !important; }
    .print-page {
      margin: 0 !important;
      box-shadow: none !important;
      width: 100% !important;
      padding: 0 !important;
      min-height: 0 !important;
    }
    .doc-company-logo {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      max-height: 56px !important;
      max-width: 180px !important;
    }
    .no-print { display: none !important; }
    @page { size: A4; margin: 15mm 20mm; }
  }

  /* Typography */
  h1 { font-size: 26px; font-weight: 700; letter-spacing: 1px; }
  h2 { font-size: 14px; font-weight: 600; }
  h3 { font-size: 12px; font-weight: 600; }

  /* Layout helpers */
  .row { display: flex; gap: 0; }
  .col { flex: 1; }
  .text-right { text-align: right; }
  .text-left  { text-align: left; }
  .text-end   { text-align: end; }
  .text-start { text-align: start; }
  .mt-1 { margin-top: 4px; }
  .mt-2 { margin-top: 8px; }
  .mt-3 { margin-top: 12px; }
  .mt-4 { margin-top: 16px; }
  .mt-6 { margin-top: 24px; }
  .mb-1 { margin-bottom: 4px; }
  .mb-2 { margin-bottom: 8px; }
  .mb-3 { margin-bottom: 12px; }
  .mb-4 { margin-bottom: 16px; }
  .mb-6 { margin-bottom: 24px; }

  /* ── Document header ─────────────────────────────────────── */
  /* Header grid uses physical LTR columns; Arabic text uses dir=rtl inside blocks. */
  .doc-header {
    display: grid;
    gap: 12px 20px;
    align-items: start;
    padding-bottom: 16px;
    border-bottom: 2px solid #1a1a1a;
    margin-bottom: 20px;
    direction: ltr;
  }
  .doc-header--ar.doc-header--with-qr {
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas: "company document qr";
  }
  .doc-header--ar.doc-header--no-qr {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: "company document";
  }
  .doc-header--en.doc-header--with-qr {
    grid-template-columns: auto auto minmax(0, 1fr);
    grid-template-areas: "document qr company";
  }
  .doc-header--en.doc-header--no-qr {
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas: "document company";
  }
  .doc-header-company { grid-area: company; min-width: 0; }
  .doc-header-document { grid-area: document; min-width: 0; }
  .doc-header-qr {
    grid-area: qr;
    align-self: center;
    justify-self: end;
  }
  .doc-header--ar .doc-header-company {
    justify-self: start;
    text-align: left;
  }
  .doc-header--ar .doc-header-document {
    justify-self: end;
    text-align: right;
  }
  .doc-header--en .doc-header-company {
    justify-self: end;
    text-align: right;
  }
  .doc-header--en .doc-header-document {
    justify-self: start;
    text-align: left;
  }

  .doc-company-name { font-size: 18px; font-weight: 700; line-height: 1.25; }
  .doc-company-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  /* AR: logo on the left, company text to its right */
  .doc-header--ar .doc-company-row {
    flex-direction: row;
    justify-content: flex-start;
  }
  /* EN: company block on the right — logo on the outer edge */
  .doc-header--en .doc-company-row {
    flex-direction: row-reverse;
    justify-content: flex-start;
  }
  .doc-company-details {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }
  .doc-header--ar .doc-company-details {
    text-align: right;
  }
  .doc-header--en .doc-company-details {
    text-align: right;
  }
  .doc-company-logo {
    max-height: 52px;
    max-width: 120px;
    object-fit: contain;
    display: block;
    flex-shrink: 0;
  }
  .doc-company-meta,
  .doc-company-meta-line {
    font-size: 10px;
    color: #555;
    line-height: 1.45;
  }
  .doc-company-meta {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px;
  }
  .doc-company-meta-label {
    color: #888;
    font-weight: 600;
    white-space: nowrap;
  }
  .doc-company-meta-value { font-weight: 500; }
  .doc-company-sub  { font-size: 10px; color: #666; margin-top: 2px; }

  .doc-title-row {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 2px;
    max-width: 100%;
  }
  .doc-header--ar .doc-title-row { flex-direction: row; }
  .doc-header--en .doc-title-row { flex-direction: row; }
  .doc-meta-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: 4px;
  }
  .doc-header--ar .doc-meta-list { align-items: flex-end; }
  .doc-header--en .doc-meta-list { align-items: flex-start; }

  .doc-qr-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .doc-header-qr .doc-qr-image svg {
    display: block;
    width: 72px;
    height: 72px;
  }
  .doc-qr-label {
    font-size: 8px;
    color: #666;
    line-height: 1.25;
    max-width: 76px;
    text-align: center;
  }
  .doc-title {
    font-size: 20px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: 0.5px;
    line-height: 1.2;
  }
  .doc-header--en .doc-title {
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .doc-number {
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    margin-top: 2px;
  }
  .doc-meta { font-size: 11px; color: #555; line-height: 1.4; }

  /* ── Client info ─────────────────────────────────────────── */
  .client-section {
    display: flex;
    gap: 24px;
    background: #f8f9fa;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 20px;
    border: 1px solid #e5e7eb;
  }
  .client-col { flex: 1; }
  .section-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #888;
    margin-bottom: 6px;
  }
  .client-name  { font-size: 13px; font-weight: 600; }
  .client-sub   { font-size: 11px; color: #555; margin-top: 2px; line-height: 1.5; }

  /* ── Terms row ───────────────────────────────────────────── */
  .terms-row {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .term-box {
    flex: 1;
    min-width: 100px;
    border: 1px solid #e5e7eb;
    border-radius: 5px;
    padding: 6px 10px;
  }
  .term-label { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: #888; text-transform: uppercase; }
  .term-value { font-size: 12px; font-weight: 500; margin-top: 2px; }

  /* ── Line items table ────────────────────────────────────── */
  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
    font-size: 12px;
  }
  .items-table thead tr {
    background: #1a1a1a;
    color: #fff;
  }
  .items-table th {
    padding: 8px 10px;
    font-weight: 600;
    font-size: 10px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    text-align: start;
  }
  .items-table td {
    padding: 8px 10px;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: middle;
  }
  .items-table tbody tr:hover { background: #f9fafb; }
  .items-table tbody tr:last-child td { border-bottom: none; }
  .item-name   { font-weight: 500; }
  .item-taxes  { font-size: 10px; color: #666; }
  .num-col     { text-align: end !important; }

  /* ── Totals ──────────────────────────────────────────────── */
  .totals-wrapper {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 24px;
  }
  .totals-box {
    min-width: 260px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
  }
  .totals-row-item {
    display: flex;
    justify-content: space-between;
    padding: 6px 14px;
    font-size: 12px;
    border-bottom: 1px solid #f0f0f0;
  }
  .totals-row-item:last-child { border-bottom: none; }
  .totals-row-item.grand-total {
    background: #1a1a1a;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    padding: 10px 14px;
  }
  .totals-label { color: #555; }
  .totals-value { font-weight: 600; font-variant-numeric: tabular-nums; }

  /* ── Receipt voucher specific ────────────────────────────── */
  .amount-box {
    border: 2px solid #1a1a1a;
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .amount-big   { font-size: 28px; font-weight: 700; }
  .amount-label { font-size: 10px; color: #666; margin-bottom: 4px; }

  /* ── Signature block ─────────────────────────────────────── */
  .signature-section {
    display: flex;
    justify-content: flex-end;
    margin-top: 32px;
    padding-top: 12px;
  }
  .signature-box {
    text-align: center;
    min-width: 180px;
  }
  .signature-line {
    width: 100%;
    border-top: 1px solid #1a1a1a;
    margin-bottom: 6px;
    margin-top: 40px;
  }
  .signature-label { font-size: 10px; color: #666; }

  /* ── Status badge ────────────────────────────────────────── */
  .status-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 99px;
    font-size: 9px;
    font-weight: 600;
    border: 1px solid currentColor;
    line-height: 1.4;
    white-space: nowrap;
  }

  /* ── Footer ──────────────────────────────────────────────── */
  .print-footer {
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: #aaa;
  }
`;

interface PrintShellProps {
  lang: PrintLang;
  children: ReactNode;
}

export function PrintShell({ lang, children }: PrintShellProps) {
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div dir={dir} lang={lang}>
        {children}
      </div>
    </>
  );
}
