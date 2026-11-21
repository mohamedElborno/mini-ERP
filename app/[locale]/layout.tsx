import { Toaster } from "sonner";
import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { notFound } from "next/navigation";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ClerkProvider } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import { Geist_Mono } from "next/font/google";

import { hasLocale, NextIntlClientProvider } from "next-intl";
import ConvexClientProvider from "@/components/providers/ConvexClientProvider";
import "../globals.css";
import DashboardLayoutClient from "@/components/layout/DashboardLayoutClient";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale: string) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Load messages for the locale
  const messages = (await import(`../../locales/${locale}.json`)).default;

  return (
    <ClerkProvider afterSignOutUrl={`/${locale}/sign-in`}>
      <html
        suppressHydrationWarning
        lang={locale}
        className={`${geistMono.variable} h-full antialiased`}
      >
        <body className="font-thmanyah antialiased bg-background text-foreground">
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <NextIntlClientProvider locale={locale} messages={messages}>
              <ConvexClientProvider>
                <div dir={locale === "ar" ? "rtl" : "ltr"}>
                  <DashboardLayoutClient>{children}</DashboardLayoutClient>
                </div>
                <Toaster position="top-right" richColors />
              </ConvexClientProvider>
            </NextIntlClientProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
