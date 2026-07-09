import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import UsersPageClient from "@/components/users/UsersPageClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "usersPage" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default function UsersPage() {
  return <UsersPageClient />;
}
