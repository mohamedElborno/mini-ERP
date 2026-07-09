"use client";

import { useTranslations } from "next-intl";
import { IconBuilding } from "@tabler/icons-react";
import { useOrgGroupOptional } from "@/components/providers/OrgGroupProvider";

export function OrgGroupSwitcher() {
  const t = useTranslations("orgCompanies");
  const orgGroup = useOrgGroupOptional();

  if (!orgGroup || orgGroup.orgGroups.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <IconBuilding className="text-muted-foreground hidden h-4 w-4 sm:block" />
      <select
        className="border-input bg-background text-foreground focus-visible:ring-ring max-w-[180px] rounded-lg border px-2 py-1.5 text-sm outline-none focus-visible:ring-2 sm:max-w-[220px]"
        value={orgGroup.activeOrgGroupId}
        onChange={(e) =>
          orgGroup.setActiveOrgGroupId(
            e.target.value as typeof orgGroup.activeOrgGroupId,
          )
        }
        aria-label={t("switcherLabel")}
      >
        <option value="all">{t("allCompanies")}</option>
        {orgGroup.orgGroups.map((g) => (
          <option key={g._id} value={g._id}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  );
}
