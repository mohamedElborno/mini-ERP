"use client";

import { type ReactNode, useState } from "react";
import { useConvexAuth } from "convex/react";
import { useTranslations } from "next-intl";
import {
  IconBuildingBank,
  IconCurrencyDollar,
  IconReceipt,
  IconSettings,
} from "@tabler/icons-react";
import { BankAccountsTab } from "./BankAccountsTab";
import { CurrenciesTab } from "./CurrenciesTab";
import { NumberingTab } from "./NumberingTab";
import { OrgCompaniesTab } from "./OrgCompaniesTab";
import { TaxesTab } from "./TaxesTab";

type Tab = "currencies" | "taxes" | "numbering" | "bankAccounts" | "orgCompanies";

export default function SettingsPageClient() {
  const t = useTranslations("settingsPage");
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [activeTab, setActiveTab] = useState<Tab>("currencies");

  if (isLoading || !isAuthenticated) {
    return (
      <div className="border-border bg-muted/30 h-48 animate-pulse rounded-xl border" />
    );
  }

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    {
      id: "currencies",
      label: t("tabCurrencies"),
      icon: <IconCurrencyDollar className="h-4 w-4" />,
    },
    {
      id: "taxes",
      label: t("tabTaxes"),
      icon: <IconReceipt className="h-4 w-4" />,
    },
    {
      id: "bankAccounts",
      label: t("tabBankAccounts"),
      icon: <IconBuildingBank className="h-4 w-4" />,
    },
    {
      id: "orgCompanies",
      label: t("tabOrgCompanies"),
      icon: <IconBuildingBank className="h-4 w-4" />,
    },
    {
      id: "numbering",
      label: t("tabNumbering"),
      icon: <IconSettings className="h-4 w-4" />,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>

      <div className="border-border flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === "currencies" && <CurrenciesTab />}
        {activeTab === "taxes" && <TaxesTab />}
        {activeTab === "bankAccounts" && <BankAccountsTab />}
        {activeTab === "orgCompanies" && <OrgCompaniesTab />}
        {activeTab === "numbering" && <NumberingTab />}
      </div>
    </div>
  );
}
