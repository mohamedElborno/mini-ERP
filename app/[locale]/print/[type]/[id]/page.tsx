import { PrintDocumentClient } from "@/components/print/PrintDocumentClient";

export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; type: string; id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { locale, type, id } = await params;
  const { lang } = await searchParams;
  const printLang = (lang === "en" || lang === "ar" ? lang : locale === "ar" ? "ar" : "en") as "ar" | "en";

  return <PrintDocumentClient type={type} id={id} lang={printLang} />;
}
