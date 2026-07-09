import { Toaster } from "sonner";
import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { notFound } from "next/navigation";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ClerkProvider } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import ConvexClientProvider from "@/components/providers/ConvexClientProvider";
import "../globals.css";
import DashboardLayoutClient from "@/components/layout/DashboardLayoutClient";

const thmanyahSans = localFont({
  src: [
    {
      path: "../../public/fonts/thmanyahsans-Light.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../public/fonts/thmanyahsans-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/thmanyahsans-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/thmanyahsans-Bold.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../public/fonts/thmanyahsans-Black.otf",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-thmanyah",
  display: "swap",
});

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
        className={`${thmanyahSans.variable} ${geistMono.variable} h-full antialiased`}
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
