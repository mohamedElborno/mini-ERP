"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PrintLang } from "./printLabels";
import { getLabels } from "./printLabels";
import { QuotePrintView } from "./QuotePrintView";
import { InvoicePrintView } from "./InvoicePrintView";
import { VoucherPrintView } from "./VoucherPrintView";
import { PrintShell } from "./PrintShell";
import { waitForPrintAssets } from "./waitForPrintAssets";
import { buildPublicDocumentUrl } from "@/lib/publicDocumentUrl";

interface Props {
  type: string;
  id: string;
  lang: PrintLang;
}

// ─── Quote loader ────────────────────────────────────────────────────────────
function QuoteLoader({ id, lang }: { id: string; lang: PrintLang }) {
  const ensureToken = useMutation(api.quotes.ensureQuotePublicViewToken);
  const ensureTokenRef = useRef(ensureToken);
  ensureTokenRef.current = ensureToken;
  const [publicViewToken, setPublicViewToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const data = useQuery(
    api.quotes.getQuoteForPrint,
    tokenReady ? { id: id as Id<"quotes"> } : "skip",
  );
  const L = getLabels(lang);

  const publicViewUrl = useMemo(() => {
    if (!publicViewToken) return null;
    return buildPublicDocumentUrl("quote", publicViewToken);
  }, [publicViewToken]);

  useEffect(() => {
    let cancelled = false;
    void ensureTokenRef.current({ id: id as Id<"quotes"> })
      .then((result) => {
        if (!cancelled) setPublicViewToken(result.token);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setTokenReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!tokenReady || data === undefined || !data) return;

    let cancelled = false;
    document.title = `${data.quote.number ?? L.quote} — ${data.group?.name ?? ""}`;

    void (async () => {
      await waitForPrintAssets();
      if (!cancelled) window.print();
    })();

    return () => {
      cancelled = true;
    };
  }, [tokenReady, data, L.quote]);

  if (!tokenReady || data === undefined) return <LoadingState lang={lang} />;
  if (!data) return <NotFoundState lang={lang} />;
  return (
    <QuotePrintView
      data={data}
      lang={lang}
      publicViewUrl={publicViewUrl}
      qrLabel={L.scanToView}
    />
  );
}

// ─── Invoice loader ──────────────────────────────────────────────────────────
function InvoiceLoader({ id, lang }: { id: string; lang: PrintLang }) {
  const ensureToken = useMutation(api.invoices.ensureInvoicePublicViewToken);
  const ensureTokenRef = useRef(ensureToken);
  ensureTokenRef.current = ensureToken;
  const [publicViewToken, setPublicViewToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const data = useQuery(
    api.invoices.getInvoiceForPrint,
    tokenReady ? { id: id as Id<"invoices"> } : "skip",
  );
  const L = getLabels(lang);

  const publicViewUrl = useMemo(() => {
    if (!publicViewToken) return null;
    return buildPublicDocumentUrl("invoice", publicViewToken);
  }, [publicViewToken]);

  useEffect(() => {
    let cancelled = false;
    void ensureTokenRef.current({ id: id as Id<"invoices"> })
      .then((result) => {
        if (!cancelled) setPublicViewToken(result.token);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setTokenReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!tokenReady || data === undefined || !data) return;

    let cancelled = false;
    document.title = `${data.invoice.number ?? L.invoice} — ${data.group?.name ?? ""}`;

    void (async () => {
      await waitForPrintAssets();
      if (!cancelled) window.print();
    })();

    return () => {
      cancelled = true;
    };
  }, [tokenReady, data, L.invoice]);

  if (!tokenReady || data === undefined) return <LoadingState lang={lang} />;
  if (!data) return <NotFoundState lang={lang} />;
  return (
    <InvoicePrintView
      data={data}
      lang={lang}
      publicViewUrl={publicViewUrl}
      qrLabel={L.scanToView}
    />
  );
}

// ─── Voucher loader ──────────────────────────────────────────────────────────
function VoucherLoader({ id, lang }: { id: string; lang: PrintLang }) {
  const data = useQuery(api.receiptVouchers.getVoucherForPrint, { id: id as Id<"receiptVouchers"> });
  const L = getLabels(lang);

  useEffect(() => {
    if (data === undefined || !data) return;

    let cancelled = false;
    document.title = `${data.voucher.number ?? L.receiptVoucher} — ${data.group?.name ?? ""}`;

    void (async () => {
      await waitForPrintAssets();
      if (!cancelled) window.print();
    })();

    return () => {
      cancelled = true;
    };
  }, [data, L.receiptVoucher]);

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
