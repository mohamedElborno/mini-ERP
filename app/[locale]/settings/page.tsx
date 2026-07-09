import { getTranslations } from "next-intl/server";
import SettingsPageClient from "@/components/settings/SettingsPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "settingsPage" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function SettingsPage() {
  return <SettingsPageClient />;
}
