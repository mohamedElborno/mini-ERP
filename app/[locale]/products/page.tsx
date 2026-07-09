import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ProductsPageClient from "@/components/products/ProductsPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "productsPage" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default function ProductsPage() {
  return <ProductsPageClient />;
}
