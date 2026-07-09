import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import QuotesPageClient from "@/components/quotes/QuotesPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "quotesPage" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default function QuotesPage() {
  return <QuotesPageClient />;
}
