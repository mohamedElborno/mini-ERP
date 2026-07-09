"use client";

import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  IconLoader2,
  IconMail,
  IconUserCheck,
  IconUserPlus,
  IconUserX,
  IconX,
} from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import InviteUserDialog from "@/components/users/InviteUserDialog";

// ---------------------------------------------------------------------------
// Users table
// ---------------------------------------------------------------------------
type UserWithDetails = Omit<Doc<"users">, "assignedGroups"> & {
  roleDetails: Doc<"roles"> | null;
  assignedGroups: Array<{ _id: Id<"groups">; name: string } | null>;
};

function UsersTable({
  users,
  locale,
}: {
  users: UserWithDetails[];
  locale: string;
}) {
  const t = useTranslations("usersPage");

  if (users.length === 0) {
    return (
      <div className="border-border bg-card/40 text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
        {t("empty")}
      </div>
    );
  }

  const fmt = (ms: number | undefined) =>
    ms == null
      ? "—"
      : new Date(ms).toLocaleString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-border bg-muted/40 border-b">
            <tr>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colName")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colEmail")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colRole")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colGroups")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium whitespace-nowrap">
                {t("colJoined")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {users.map((user) => {
              const name = [user.firstName, user.lastName]
                .filter(Boolean)
                .join(" ")
                .trim();
              const hasRole = Boolean(user.roleDetails);
              return (
                <tr
                  key={user._id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {hasRole ? (
                        <IconUserCheck className="text-primary h-4 w-4 shrink-0" />
                      ) : (
                        <IconUserX className="text-muted-foreground h-4 w-4 shrink-0" />
                      )}
                      <span className="font-medium">{name || "—"}</span>
                    </div>
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    {user.roleDetails ? (
                      <span className="bg-primary/10 text-primary rounded-md px-2 py-0.5 text-xs font-medium">
                        {user.roleDetails.name}
                      </span>
                    ) : (
                      <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-xs">
                        {t("statusPending")}
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-xs">
                    {user.assignedGroups
                      .filter(Boolean)
                      .map((g) => g!.name)
                      .join(", ") || "—"}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                    {fmt(user.updatedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pending invitations table
// ---------------------------------------------------------------------------
function PendingInvitationsTable() {
  const t = useTranslations("usersPage");
  const cancelInvitation = useMutation(api.invitations.cancelInvitation);
  const pending = useQuery(api.invitations.getPendingInvitations);
  const [cancelling, setCancelling] = useState<Id<"pendingInvitations"> | null>(
    null,
  );

  if (!pending || pending.length === 0) return null;

  const handleCancel = async (id: Id<"pendingInvitations">) => {
    setCancelling(id);
    try {
      await cancelInvitation({ id });
      toast.success(t("inviteCancelled"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="border-border flex items-center gap-2 border-b px-5 py-3">
        <IconMail className="text-muted-foreground h-4 w-4" />
        <h2 className="text-sm font-semibold">{t("pendingInvitesTitle")}</h2>
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
          {pending.length}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-left text-sm">
          <thead className="border-border bg-muted/40 border-b">
            <tr>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colEmail")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colRole")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colGroups")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium whitespace-nowrap">
                {t("colInvitedBy")}
              </th>
              <th className="w-[1%] px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {pending.map((inv) => (
              <tr key={inv._id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{inv.email}</td>
                <td className="px-4 py-3">
                  <span className="bg-primary/10 text-primary rounded-md px-2 py-0.5 text-xs font-medium">
                    {inv.roleName}
                  </span>
                </td>
                <td className="text-muted-foreground px-4 py-3 text-xs">
                  {inv.groupNames.join(", ") || "—"}
                </td>
                <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                  {inv.invitedByName}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleCancel(inv._id)}
                    disabled={cancelling === inv._id}
                    title={t("cancelInvite")}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg p-1.5 transition-colors disabled:opacity-50"
                  >
                    {cancelling === inv._id ? (
                      <IconLoader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <IconX className="h-4 w-4" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page body
// ---------------------------------------------------------------------------
function UsersQueryBody() {
  const locale = useLocale();
  const t = useTranslations("usersPage");
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;

  const currentUser = useQuery(api.users.getCurrentUser, skip ? "skip" : {});
  const users = useQuery(api.users.getUsers, skip ? "skip" : {});

  const [showInvite, setShowInvite] = useState(false);

  const canInvite = Boolean(
    currentUser?.roleDetails?.permissions.includes("admin:all") ||
    currentUser?.roleDetails?.permissions.includes("users:update"),
  );

  if (authLoading || !isAuthenticated || currentUser === undefined) {
    return (
      <div className="space-y-4">
        <div className="border-border bg-muted/30 h-10 animate-pulse rounded-xl border" />
        <div className="border-border bg-muted/30 h-48 animate-pulse rounded-xl border" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {canInvite && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowInvite(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            <IconUserPlus className="h-4 w-4" />
            {t("inviteButton")}
          </button>
        </div>
      )}

      <PendingInvitationsTable />

      <UsersTable users={(users as UserWithDetails[]) ?? []} locale={locale} />

      {showInvite && <InviteUserDialog onClose={() => setShowInvite(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export default function UsersPageClient() {
  const t = useTranslations("usersPage");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>
      <UsersQueryBody />
    </div>
  );
}
