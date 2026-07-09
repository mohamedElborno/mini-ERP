import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import DealDetailPageClient from "@/components/deals/DealDetailPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dealsPage" });
  return {
    title: t("dealDetailMetaTitle"),
    description: t("metaDescription"),
  };
}

export default function DealDetailPage() {
  return <DealDetailPageClient />;
}
