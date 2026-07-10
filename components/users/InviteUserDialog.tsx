"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  IconLoader2,
  IconSend,
  IconUserPlus,
  IconX,
} from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export default function InviteUserDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const t = useTranslations("usersPage");

  const roles = useQuery(api.roles.getRoles) ?? [];
  const groups = useQuery(api.groups.getGroups) ?? [];
  const inviteEmployee = useAction(api.invitations.inviteEmployee);

  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<Id<"roles"> | "">("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<Id<"groups">[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const toggleGroup = (id: Id<"groups">) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  };

  const isValid =
    email.trim().length > 0 &&
    roleId !== "" &&
    selectedGroupIds.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setSubmitting(true);
    try {
      await inviteEmployee({
        emailAddress: email.trim(),
        roleId: roleId as Id<"roles">,
        groupIds: selectedGroupIds,
      });
      toast.success(t("inviteSuccess", { email: email.trim() }));
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-20 md:pb-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="bg-card border-border relative z-10 w-full max-w-lg rounded-2xl border shadow-2xl">
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <IconUserPlus className="text-primary h-5 w-5" />
            <h2 className="text-base font-semibold">{t("inviteDialogTitle")}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-lg p-1.5 transition-colors"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              {t("inviteEmailLabel")} *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("inviteEmailPlaceholder")}
              required
              className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2"
            />
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              {t("inviteRoleLabel")} *
            </label>
            {roles.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("inviteNoRoles")}
              </p>
            ) : (
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value as Id<"roles"> | "")}
                required
                className="border-input bg-background focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2"
              >
                <option value="">{t("inviteRolePlaceholder")}</option>
                {roles.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Groups */}
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              {t("inviteGroupsLabel")} *
            </label>
            {groups.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("inviteNoGroups")}
              </p>
            ) : (
              <div className="border-input bg-background max-h-44 space-y-1 overflow-y-auto rounded-lg border p-2">
                {groups.map((g) => (
                  <label
                    key={g._id}
                    className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.includes(g._id)}
                      onChange={() => toggleGroup(g._id)}
                      className="accent-primary"
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            )}
            {selectedGroupIds.length === 0 && (
              <p className="text-muted-foreground text-xs">
                {t("inviteGroupsHint")}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="border-border bg-background hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <IconLoader2 className="h-4 w-4 animate-spin" />
              ) : (
                <IconSend className="h-4 w-4" />
              )}
              {submitting ? t("inviteSending") : t("inviteSend")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

