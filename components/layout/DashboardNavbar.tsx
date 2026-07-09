"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { IconMenu2 } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import LocaleSwitcher from "./LocaleSwitcher";
import ThemeSwitcher from "./ThemeSwitcher";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { MobileNavUser } from "@/components/MobileNavUser";
import { OrgGroupSwitcher } from "./OrgGroupSwitcher";
import { routing } from "@/i18n/routing";

interface DashboardNavbarProps {
  onToggleSidebar: () => void;
}

export function DashboardNavbar({ onToggleSidebar }: DashboardNavbarProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const tBreadcrumb = useTranslations("dashboard.breadcrumb");

  const getBreadcrumbItems = () => {
    const items: { label: string; href: string; isActive: boolean }[] = [];
    const pathSegments = pathname?.split("/").filter(Boolean) || [];

    const segments = pathSegments.filter(
      (seg) => !(routing.locales as readonly string[]).includes(seg),
    );

    items.push({
      label: tBreadcrumb("dashboard"),
      href: `/${locale}`,
      isActive: segments.length === 0,
    });

    if (segments.length > 0) {
      const currentPath: string[] = [];
      segments.forEach((segment, index) => {
        currentPath.push(segment);
        const isLast = index === segments.length - 1;

        let label = segment;
        if (segment === "deals") label = tBreadcrumb("deals");
        if (segment === "companies") label = tBreadcrumb("clients");
        if (segment === "quotes") label = tBreadcrumb("quotes");
        if (segment === "invoices") label = tBreadcrumb("invoices");
        if (segment === "receipt-vouchers")
          label = tBreadcrumb("receiptVouchers");
        if (segment === "products") label = tBreadcrumb("products");
        if (segment === "services") label = tBreadcrumb("services");
        if (segment === "categories") label = tBreadcrumb("categories");
        if (segment === "roles") label = tBreadcrumb("roles");
        else if (segment === "settings") label = tBreadcrumb("settings");
        else if (segment.match(/^[a-f0-9-]+$/)) {
          label = segment;
        }

        items.push({
          label,
          href: `/${locale}/${currentPath.join("/")}`,
          isActive: isLast,
        });
      });
    }

    return items;
  };

  const breadcrumbItems = getBreadcrumbItems();

  return (
    <div className="top-0 z-50 flex flex-col gap-2">
      <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) hidden h-14 shrink-0 items-center gap-2 border-b py-2 transition-[width,height] ease-linear md:flex">
        <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="flex p-0"
            type="button"
            onClick={onToggleSidebar}
            aria-label={tBreadcrumb("toggleSidebar")}
          >
            <IconMenu2 className="h-5 w-5" />
          </Button>
          <Separator
            orientation="vertical"
            className="mx-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbItems.map((item, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  {index > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {item.isActive ? (
                      <BreadcrumbPage>{item.label}</BreadcrumbPage>
                    ) : (
                      <Link
                        href={item.href}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {item.label}
                      </Link>
                    )}
                  </BreadcrumbItem>
                </div>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          <div
            className={`flex items-center gap-2 ${locale === "ar" ? "mr-auto" : "ml-auto"}`}
          >
            <OrgGroupSwitcher />
            <ThemeSwitcher />
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      <header className="border-border bg-card/80 z-50 flex items-center justify-between gap-2 border-b px-4 py-2.5 backdrop-blur-sm md:hidden">
        <MobileNavUser />
        <div className="z-50 flex items-center gap-2">
          <OrgGroupSwitcher />
          <ThemeSwitcher />
          <LocaleSwitcher />
        </div>
      </header>
    </div>
  );
}
