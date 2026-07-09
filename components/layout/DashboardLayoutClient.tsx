"use client";

import { useEffect, useState } from "react";
import {
  IconAnalyze,
  IconBrandTabler,
  IconBuilding,
  IconBuildingWarehouse,
  IconCreditCard,
  IconCreditCardOff,
  IconCurrencyDollar,
  IconHeartHandshake,
  IconListDetails,
  IconPackage,
  IconPlugConnected,
  IconReceipt,
  IconReceipt2,
  IconReceiptRefund,
  IconSettings,
  IconShield,
  IconTag,
  IconUsers,
} from "@tabler/icons-react";
import { Sidebar, SidebarBody, SidebarLink } from "@/components/ui/sidebar";
import { DashboardNavbar } from "./DashboardNavbar";
import Logo from "./Logo";
import type { DashboardLayoutClientProps } from "@/types/dashboard";
import { NavUser } from "@/components/NavUser";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import BottomNav from "./BottomNav";
import { OrgGroupProvider } from "@/components/providers/OrgGroupProvider";

function isSignInPathname(pathname: string | null) {
  if (!pathname) return false;
  return pathname === "/sign-in" || pathname.startsWith("/sign-in/");
}

export default function DashboardLayoutClient({
  children,
}: DashboardLayoutClientProps) {
  const pathname = usePathname();
  const t = useTranslations("header");

  const links = [
    {
      label: t("dashboard") || "Dashboard",
      href: "/",
      icon: (
        <IconBrandTabler className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
    {
      label: t("deals") || "Deals",
      href: "/deals",
      icon: (
        <IconListDetails className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
    {
      label: t("clients") || "Clients",
      href: "/companies",
      icon: (
        <IconBuilding className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
    {
      label: t("quotes") || "Quotes",
      href: "/quotes",
      icon: (
        <IconReceipt className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
    {
      label: t("invoices") || "Invoices",
      href: "/invoices",
      icon: (
        <IconReceipt2 className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
    {
      label: t("receiptVouchers") || "Receipt vouchers",
      href: "/receipt-vouchers",
      icon: (
        <IconCreditCard className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
    {
      label: t("products") || "Products",
      href: "/products",
      icon: (
        <IconPackage className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
    {
      label: t("services") || "Services",
      href: "/services",
      icon: (
        <IconHeartHandshake className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
    {
      label: t("categories") || "Categories",
      href: "/categories",
      icon: (
        <IconTag className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
    {
      label: t("users") || "Users",
      href: "/users",
      icon: (
        <IconUsers className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
    {
      label: t("roles") || "Roles",
      href: "/roles",
      icon: (
        <IconShield className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
    {
      label: t("settings") || "Settings",
      href: "/settings",
      icon: (
        <IconSettings className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200" />
      ),
    },
  ];

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDesktop = window.innerWidth >= 768;
    setOpen(isDesktop);
  }, []);

  if (isSignInPathname(pathname)) {
    return <div className="min-h-screen w-full">{children}</div>;
  }

  return (
    <OrgGroupProvider>
    <div className="mx-auto flex h-screen w-full flex-1 flex-col overflow-hidden md:flex-row">
      <div className="hidden md:block">
        <Sidebar open={open} setOpen={setOpen}>
          <SidebarBody className="justify-between gap-10">
            <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
              <Link href="/">
                <Logo open={open} />
              </Link>
              <div className="mt-8 flex flex-col gap-2">
                {links.map((link, idx) => (
                  <SidebarLink key={idx} link={link} />
                ))}
              </div>
            </div>
            <div>
              <NavUser />
            </div>
          </SidebarBody>
        </Sidebar>
      </div>

      <div className="flex h-full w-full flex-col overflow-hidden overflow-y-auto p-0 pb-16 md:p-2 md:pb-2">
        <div className="h-auto bg-neutral-100/50 dark:bg-muted/20 md:rounded-2xl">
          <DashboardNavbar onToggleSidebar={() => setOpen(!open)} />
          <div className="gap-4 p-4 md:gap-6 md:p-6">{children}</div>
        </div>
      </div>

      <BottomNav />
    </div>
    </OrgGroupProvider>
  );
}
