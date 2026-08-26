"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { IconLink, IconLinkOff, IconRefresh } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  buildPublicDocumentUrl,
  type PublicDocumentType,
} from "@/lib/publicDocumentUrl";

type Props = {
  type: PublicDocumentType;
  documentId: Id<"quotes"> | Id<"invoices">;
  hasPublicViewLink: boolean;
};

export function PublicViewLinkSection({
  type,
  documentId,
  hasPublicViewLink,
}: Props) {
  const t = useTranslations("publicViewLink");

  const ensureQuote = useMutation(api.quotes.ensureQuotePublicViewToken);
  const revokeQuote = useMutation(api.quotes.revokeQuotePublicViewToken);
  const rotateQuote = useMutation(api.quotes.rotateQuotePublicViewToken);
  const ensureInvoice = useMutation(api.invoices.ensureInvoicePublicViewToken);
  const revokeInvoice = useMutation(api.invoices.revokeInvoicePublicViewToken);
  const rotateInvoice = useMutation(api.invoices.rotateInvoicePublicViewToken);

  const [busy, setBusy] = useState<null | "copy" | "revoke" | "rotate">(null);
  const [confirmAction, setConfirmAction] = useState<
    null | "revoke" | "rotate"
  >(null);

  async function ensureToken(): Promise<string> {
    if (type === "quote") {
      const result = await ensureQuote({ id: documentId as Id<"quotes"> });
      return result.token;
    }
    const result = await ensureInvoice({ id: documentId as Id<"invoices"> });
    return result.token;
  }

  async function handleCopy() {
    setBusy("copy");
    try {
      const token = await ensureToken();
      const url = buildPublicDocumentUrl(type, token);
      await navigator.clipboard.writeText(url);
      toast.success(t("copySuccess"));
    } catch {
      toast.error(t("copyError"));
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke() {
    if (confirmAction !== "revoke") {
      setConfirmAction("revoke");
      return;
    }
    setBusy("revoke");
    try {
      if (type === "quote") {
        await revokeQuote({ id: documentId as Id<"quotes"> });
      } else {
        await revokeInvoice({ id: documentId as Id<"invoices"> });
      }
      toast.success(t("revokeSuccess"));
      setConfirmAction(null);
    } catch {
      toast.error(t("actionError"));
    } finally {
      setBusy(null);
    }
  }

  async function handleRotate() {
    if (confirmAction !== "rotate") {
      setConfirmAction("rotate");
      return;
    }
    setBusy("rotate");
    try {
      let token: string;
      if (type === "quote") {
        const result = await rotateQuote({ id: documentId as Id<"quotes"> });
        token = result.token;
      } else {
        const result = await rotateInvoice({ id: documentId as Id<"invoices"> });
        token = result.token;
      }
      const url = buildPublicDocumentUrl(type, token);
      await navigator.clipboard.writeText(url);
      toast.success(t("rotateSuccess"));
      setConfirmAction(null);
    } catch {
      toast.error(t("actionError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-border bg-muted/20 space-y-3 rounded-xl border p-4">
      <div>
        <p className="text-sm font-medium">{t("title")}</p>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {t("description")}
        </p>
      </div>

      <p className="text-sm">
        <span className="text-muted-foreground">{t("statusLabel")}: </span>
        <span
          className={
            hasPublicViewLink
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground"
          }
        >
          {hasPublicViewLink ? t("statusActive") : t("statusInactive")}
        </span>
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => {
            setConfirmAction(null);
            void handleCopy();
          }}
        >
          <IconLink className="size-3.5" />
          {busy === "copy" ? t("working") : t("copyLink")}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null || !hasPublicViewLink}
          onClick={() => void handleRotate()}
        >
          <IconRefresh className="size-3.5" />
          {busy === "rotate"
            ? t("working")
            : confirmAction === "rotate"
              ? t("confirmRotate")
              : t("rotateLink")}
        </Button>

        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={busy !== null || !hasPublicViewLink}
          onClick={() => void handleRevoke()}
        >
          <IconLinkOff className="size-3.5" />
          {busy === "revoke"
            ? t("working")
            : confirmAction === "revoke"
              ? t("confirmRevoke")
              : t("revokeLink")}
        </Button>

        {confirmAction && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => setConfirmAction(null)}
          >
            {t("cancelConfirm")}
          </Button>
        )}
      </div>
    </div>
  );
}
