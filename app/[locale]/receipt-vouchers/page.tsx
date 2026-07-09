import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ReceiptVouchersPageClient from "@/components/receiptVouchers/ReceiptVouchersPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "receiptVouchersPage" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default function ReceiptVouchersPage() {
  return <ReceiptVouchersPageClient />;
}
