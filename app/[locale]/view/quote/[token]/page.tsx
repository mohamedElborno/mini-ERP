import type { Metadata } from "next";
import { PublicDocumentViewClient } from "@/components/print/PublicDocumentViewClient";
import type { PrintLang } from "@/components/print/printLabels";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function resolvePrintLang(locale: string, lang?: string): PrintLang {
  if (lang === "en" || lang === "ar") return lang;
  return locale === "ar" ? "ar" : "en";
}

export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { locale, token } = await params;
  const { lang } = await searchParams;
  const printLang = resolvePrintLang(locale, lang);

  return (
    <PublicDocumentViewClient type="quote" token={token} lang={printLang} />
  );
}
