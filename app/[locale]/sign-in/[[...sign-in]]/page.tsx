import { getTranslations } from "next-intl/server";
import { SignInView } from "../../../../components/signInPage/sign-in-view";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "signIn" });
  return {
    title: t("metaTitle"),
  };
}

export default async function SignInPage() {
  return <SignInView />;
}
