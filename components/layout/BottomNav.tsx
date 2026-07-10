"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  IconBrandTabler,
  IconBuilding,
  IconDots,
  IconUsers,
  IconReceipt,
  IconShield,
  IconListDetails,
  IconReceipt2,
  IconCash,
  IconTag,
  IconPackage,
  IconHeartHandshake,
  IconSettings2,
} from "@tabler/icons-react";

export default function BottomNav() {
  const t = useTranslations("header");
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  const mainLinks = [
    {
      label: t("dashboard") || "Dashboard",
      href: "/",
      icon: IconBrandTabler,
    },
    {
      label: t("deals") || "Deals",
      href: "/deals",
      icon: IconListDetails,
    },
    {
      label: t("clients") || "Clients",
      href: "/companies",
      icon: IconBuilding,
    },
    {
      label: t("quotes") || "Quotes",
      href: "/quotes",
      icon: IconReceipt,
    },
  ];

  const moreLinks = [
    {
      label: t("invoices") || "Invoices",
      href: "/invoices",
      icon: IconReceipt2,
    },
    {
      label: t("receiptVouchers") || "Receipt vouchers",
      href: "/receipt-vouchers",
      icon: IconCash,
    },
    {
      label: t("products") || "Products",
      href: "/products",
      icon: IconPackage,
    },
    {
      label: t("services") || "Services",
      href: "/services",
      icon: IconHeartHandshake,
    },
    {
      label: t("categories") || "Categories",
      href: "/categories",
      icon: IconTag,
    },
    {
      label: t("roles") || "Roles",
      href: "/roles",
      icon: IconShield,
    },
    {
      label: t("users") || "Users",
      href: "/users",
      icon: IconUsers,
    },
    {
      label: t("settings") || "Settings",
      href: "/settings",
      icon: IconSettings2,
    },
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === href || pathname?.endsWith("/");
    }
    return pathname?.includes(href);
  };

  const hasActiveMoreLink = moreLinks.some((link) => isActive(link.href));

  return (
    <>
      {showMore && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden"
          onClick={() => setShowMore(false)}
          onKeyDown={(e) => e.key === "Escape" && setShowMore(false)}
          role="presentation"
        />
      )}

      {showMore && (
        <div className="fixed right-0 bottom-18 left-0 z-50 mx-4 mb-2 md:hidden">
          <div className="border-border bg-card/95 overflow-hidden rounded-2xl border shadow-xl backdrop-blur-lg">
            {moreLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setShowMore(false)}
                  className={`flex items-center gap-3 border-b border-border px-4 py-3 transition-all duration-300 last:border-b-0 ${
                    active
                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                      : "text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-medium">{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <nav className="border-border bg-card/95 fixed right-0 bottom-0 left-0 z-50 border-t shadow-lg backdrop-blur-lg md:hidden">
        <div className="flex items-center justify-around px-2 py-2">
          {mainLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative flex min-w-[70px] flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 transition-all duration-300 ${
                  active
                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Icon
                  className={`h-5 w-5 transition-transform duration-300 ${
                    active ? "scale-110" : ""
                  }`}
                />
                <span
                  className={`text-[10px] font-medium transition-all duration-300 ${
                    active ? "font-semibold" : ""
                  }`}
                >
                  {link.label}
                </span>
                {active && (
                  <div className="absolute bottom-0 left-1/2 h-1 w-8 -translate-x-1/2 rounded-t-full bg-purple-600 dark:bg-purple-400" />
                )}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            className={`relative flex min-w-[70px] flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 transition-all duration-300 ${
              hasActiveMoreLink || showMore
                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <IconDots
              className={`h-5 w-5 transition-transform duration-300 ${
                showMore ? "scale-110 rotate-90" : ""
              }`}
            />
            <span
              className={`text-[10px] font-medium transition-all duration-300 ${
                hasActiveMoreLink || showMore ? "font-semibold" : ""
              }`}
            >
              {t("more") || "More"}
            </span>
            {hasActiveMoreLink && !showMore && (
              <div className="absolute bottom-0 left-1/2 h-1 w-8 -translate-x-1/2 rounded-t-full bg-purple-600 dark:bg-purple-400" />
            )}
          </button>
        </div>
      </nav>
    </>
  );
}
