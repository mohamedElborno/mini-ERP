"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { PrintLang } from "./printLabels";
import { getLabels } from "./printLabels";
import { QuotePrintView } from "./QuotePrintView";
import { InvoicePrintView } from "./InvoicePrintView";
import { PrintShell } from "./PrintShell";
import type { PublicDocumentType } from "@/lib/publicDocumentUrl";

interface Props {
  type: PublicDocumentType;
  token: string;
  lang: PrintLang;
}

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

export function PublicDocumentViewClient({ type, token, lang }: Props) {
  const quoteData = useQuery(
    api.publicDocuments.getPublicQuoteByToken,
    type === "quote" ? { token } : "skip",
  );
  const invoiceData = useQuery(
    api.publicDocuments.getPublicInvoiceByToken,
    type === "invoice" ? { token } : "skip",
  );
  const data = type === "quote" ? quoteData : invoiceData;
  const L = getLabels(lang);

  useEffect(() => {
    if (!data) return;
    const number =
      type === "quote"
        ? (data as NonNullable<typeof quoteData>).quote.number
        : (data as NonNullable<typeof invoiceData>).invoice.number;
    const titleLabel = type === "quote" ? L.quote : L.invoice;
    document.title = `${number ?? titleLabel} — ${data.group?.name ?? ""}`;
  }, [data, type, L.quote, L.invoice]);

  if (data === undefined) return <LoadingState lang={lang} />;
  if (!data) return <NotFoundState lang={lang} />;

  return (
    <PrintShell lang={lang}>
      {type === "quote" ? (
        <QuotePrintView data={quoteData!} lang={lang} showPublicQr={false} />
      ) : (
        <InvoicePrintView data={invoiceData!} lang={lang} showPublicQr={false} />
      )}
    </PrintShell>
  );
}
