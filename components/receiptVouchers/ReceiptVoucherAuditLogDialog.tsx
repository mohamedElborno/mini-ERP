"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { IconHistory, IconX } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildAuditChangeLines, type AuditT } from "@/lib/quoteAuditDisplay";

type Props = {
  open: boolean;
  onClose: () => void;
  voucherId: Id<"receiptVouchers"> | null;
};

export function ReceiptVoucherAuditLogDialog({
  open,
  onClose,
  voucherId,
}: Props) {
  const t = useTranslations("receiptVouchersPage");
  const locale = useLocale();
  const ta = t as unknown as AuditT;

  const data = useQuery(
    api.receiptVouchers.getReceiptVoucherAuditLog,
    open && voucherId ? { id: voucherId } : "skip",
  );

  if (!open || !voucherId) return null;

  const fmtAt = (n: number) =>
    new Date(n).toLocaleString(locale === "ar" ? "ar-SA" : "en-US");

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 min-h-screen min-w-screen bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="bg-card border-border relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border shadow-2xl"
        role="dialog"
        aria-labelledby="rv-audit-title"
      >
        <div className="border-border flex shrink-0 items-center gap-3 border-b px-5 py-4">
          <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <IconHistory className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="rv-audit-title" className="text-base font-semibold">
              {t("auditLogDialogTitle")}
            </h2>
            {data && (
              <p className="text-muted-foreground font-mono text-xs">
                {data.voucherNumber ?? "—"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5"
            aria-label={t("cancel")}
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {data === undefined && (
          <p className="text-muted-foreground p-5 text-sm">{t("loading")}</p>
        )}

        {data === null && (
          <p className="text-destructive p-5 text-sm">{t("notFound")}</p>
        )}

        {data && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-border bg-muted/20 space-y-2 border-b px-5 py-3 text-sm">
              <p>
                <span className="text-muted-foreground">{t("creator")}:</span>{" "}
                <span className="text-foreground font-medium">
                  {data.documentCreatedByName}
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                {t("documentMetaCreated", {
                  at: fmtAt(data.documentCreatedAt),
                })}
              </p>
              {data.documentLastUpdatedByName && (
                <>
                  <p>
                    <span className="text-muted-foreground">
                      {t("lastEditor")}:
                    </span>{" "}
                    <span className="text-foreground font-medium">
                      {data.documentLastUpdatedByName}
                    </span>
                  </p>
                  {data.documentUpdatedAt != null && (
                    <p className="text-muted-foreground text-xs">
                      {t("documentMetaUpdated", {
                        at: fmtAt(data.documentUpdatedAt),
                      })}
                    </p>
                  )}
                </>
              )}
            </div>

            <ul className="flex-1 space-y-3 overflow-y-auto p-5">
              {data.entries.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  {t("auditListEmpty")}
                </p>
              )}
              {data.entries.map((e) => {
                const actionLabel =
                  e.action === "CREATED"
                    ? t("auditActionCreated")
                    : e.action === "UPDATED"
                      ? t("auditActionUpdated")
                      : e.action;
                const lines = buildAuditChangeLines(
                  e.action,
                  e.changes,
                  ta,
                  locale,
                );
                return (
                  <li
                    key={e._id}
                    className="border-border bg-muted/10 rounded-xl border p-3"
                  >
                    <div className="text-foreground flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{actionLabel}</span>
                      <time
                        className="text-muted-foreground text-xs tabular-nums"
                        dateTime={new Date(e.timestamp).toISOString()}
                      >
                        {fmtAt(e.timestamp)}
                      </time>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t("auditEventPerformedBy")}:{" "}
                      <span className="text-foreground">
                        {e.performedByName}
                      </span>
                    </p>
                    {lines.length > 0 && (
                      <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                        {lines.map((line, i) => (
                          <li
                            key={i}
                            className="text-foreground/90 pl-0.5 leading-snug"
                          >
                            {line}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="border-border flex shrink-0 justify-end border-t px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm"
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
