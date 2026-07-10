"use client";

import { useLocale, useTranslations } from "next-intl";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildAuditChangeLines, type AuditT } from "@/lib/quoteAuditDisplay";

export type DashboardActivityRow = {
  _id: string;
  timestamp: number;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  performedByName: string;
  changes: unknown;
};

const MAX_ITEMS = 10;

function entityTypeLabel(
  entityType: string,
  t: ReturnType<typeof useTranslations<"dashboardHome">>,
) {
  if (entityType === "quote") return t("activityEntityQuote");
  if (entityType === "receiptVoucher") return t("activityEntityReceiptVoucher");
  return entityType;
}

function actionLabel(
  action: string,
  t: ReturnType<typeof useTranslations<"dashboardHome">>,
) {
  if (action === "CREATED") return t("auditActionCreated");
  if (action === "UPDATED") return t("auditActionUpdated");
  return action;
}

export function DashboardRecentActivityTable({
  items,
}: {
  items: DashboardActivityRow[];
}) {
  const t = useTranslations("dashboardHome");
  const tAudit = useTranslations("quotesPage");
  const locale = useLocale();
  const ta = tAudit as unknown as AuditT;

  const visible = items.slice(0, MAX_ITEMS);

  const fmtAt = (n: number) =>
    new Date(n).toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "short",
      timeStyle: "short",
    });

  const detailFor = (row: DashboardActivityRow) => {
    const lines = buildAuditChangeLines(row.action, row.changes, ta, locale);
    if (lines.length > 0) return lines[0]!;
    return actionLabel(row.action, t);
  };

  return (
    <Card className="flex h-full flex-col shadow-sm">
      <CardHeader className="shrink-0">
        <div className="flex items-center gap-2">
          {/* Live pulsing indicator */}
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-red-500" />
          </span>
          <CardTitle className="text-base">{t("activityTitle")}</CardTitle>
        </div>
        <CardDescription>{t("activityDescription")}</CardDescription>
      </CardHeader>

      {/* flex-1 + min-h-0 lets the content scroll inside a fixed-height flex parent */}
      <CardContent className="flex max-h-[525px] min-h-0 flex-1 flex-col px-0 pb-0 sm:px-6 sm:pb-4">
        {visible.length === 0 ? (
          <p className="text-muted-foreground px-6 pb-6 text-sm sm:px-0">
            {t("activityEmpty")}
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-border text-muted-foreground border-b">
                  <th className="px-4 py-2.5 text-start font-medium sm:ps-0">
                    {t("activityColWhen")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    {t("activityColEntity")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    {t("activityColAction")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    {t("activityColUser")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    {t("activityColDetails")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => (
                  <tr
                    key={row._id}
                    className="animate-in fade-in slide-in-from-top-1 border-border hover:bg-muted/30 border-b duration-200 last:border-0"
                    style={{
                      animationDelay: `${index * 35}ms`,
                      animationFillMode: "backwards",
                    }}
                  >
                    <td className="text-muted-foreground whitespace-nowrap px-4 py-3 sm:ps-0">
                      {fmtAt(row.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {entityTypeLabel(row.entityType, t)}
                      </div>
                      {row.entityLabel && (
                        <div className="text-muted-foreground font-mono text-xs">
                          {row.entityLabel}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{actionLabel(row.action, t)}</td>
                    <td className="px-4 py-3">{row.performedByName}</td>
                    <td className="text-muted-foreground px-4 py-3">
                      {detailFor(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
