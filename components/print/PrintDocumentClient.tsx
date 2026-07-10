"use client";

import { useEffect } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PrintLang } from "./printLabels";
import { getLabels } from "./printLabels";
import { QuotePrintView } from "./QuotePrintView";
import { InvoicePrintView } from "./InvoicePrintView";
import { VoucherPrintView } from "./VoucherPrintView";
import { PrintShell } from "./PrintShell";

interface Props {
  type: string;
  id: string;
  lang: PrintLang;
}

// ─── Quote loader ────────────────────────────────────────────────────────────
function QuoteLoader({ id, lang }: { id: string; lang: PrintLang }) {
  const data = useQuery(api.quotes.getQuoteForPrint, { id: id as Id<"quotes"> });
  const L = getLabels(lang);

  useEffect(() => {
    if (data !== undefined) {
      if (data) {
        document.title = `${data.quote.number ?? L.quote} — ${lang === "ar" ? data.group?.name ?? "" : data.group?.name ?? ""}`;
        window.print();
      }
    }
  }, [data, lang, L.quote]);

  if (data === undefined) return <LoadingState lang={lang} />;
  if (!data) return <NotFoundState lang={lang} />;
  return <QuotePrintView data={data} lang={lang} />;
}

// ─── Invoice loader ──────────────────────────────────────────────────────────
function InvoiceLoader({ id, lang }: { id: string; lang: PrintLang }) {
  const data = useQuery(api.invoices.getInvoiceForPrint, { id: id as Id<"invoices"> });
  const L = getLabels(lang);

  useEffect(() => {
    if (data !== undefined) {
      if (data) {
        document.title = `${data.invoice.number ?? L.invoice} — ${data.group?.name ?? ""}`;
        window.print();
      }
    }
  }, [data, lang, L.invoice]);

  if (data === undefined) return <LoadingState lang={lang} />;
  if (!data) return <NotFoundState lang={lang} />;
  return <InvoicePrintView data={data} lang={lang} />;
}

// ─── Voucher loader ──────────────────────────────────────────────────────────
function VoucherLoader({ id, lang }: { id: string; lang: PrintLang }) {
  const data = useQuery(api.receiptVouchers.getVoucherForPrint, { id: id as Id<"receiptVouchers"> });
  const L = getLabels(lang);

  useEffect(() => {
    if (data !== undefined) {
      if (data) {
        document.title = `${data.voucher.number ?? L.receiptVoucher} — ${data.group?.name ?? ""}`;
        window.print();
      }
    }
  }, [data, lang, L.receiptVoucher]);

  if (data === undefined) return <LoadingState lang={lang} />;
  if (!data) return <NotFoundState lang={lang} />;
  return <VoucherPrintView data={data} lang={lang} />;
}

// ─── States ──────────────────────────────────────────────────────────────────
function LoadingState({ lang }: { lang: PrintLang }) {
  const L = getLabels(lang);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">{L.loading}</p>
    </div>
  );
}

function NotFoundState({ lang }: { lang: PrintLang }) {
  const L = getLabels(lang);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">{L.notFound}</p>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export function PrintDocumentClient({ type, id, lang }: Props) {
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isLoading) return <LoadingState lang={lang} />;
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Not authenticated</p>
      </div>
    );
  }

  return (
    <PrintShell lang={lang}>
      {type === "quote" && <QuoteLoader id={id} lang={lang} />}
      {type === "invoice" && <InvoiceLoader id={id} lang={lang} />}
      {type === "receipt-voucher" && <VoucherLoader id={id} lang={lang} />}
    </PrintShell>
  );
}
