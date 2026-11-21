"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
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
  const getQuote = useMutation(api.publicDocuments.getPublicQuoteByToken);
  const getInvoice = useMutation(api.publicDocuments.getPublicInvoiceByToken);
  const [quoteData, setQuoteData] = useState<Awaited<ReturnType<typeof getQuote>> | undefined>();
  const [invoiceData, setInvoiceData] = useState<Awaited<ReturnType<typeof getInvoice>> | undefined>();
  useEffect(() => {
    let active = true;
    setQuoteData(undefined); setInvoiceData(undefined);
    if (type === "quote") getQuote({ token }).then(value => { if (active) setQuoteData(value); }).catch(() => { if (active) setQuoteData(null); });
    else getInvoice({ token }).then(value => { if (active) setInvoiceData(value); }).catch(() => { if (active) setInvoiceData(null); });
    return () => { active = false; };
  }, [type, token, getQuote, getInvoice]);
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
