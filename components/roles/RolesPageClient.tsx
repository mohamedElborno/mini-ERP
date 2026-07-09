"use client";

import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useState,
} from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

function parsePermissionsInput(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

class RolesErrorBoundary extends Component<
  { children: ReactNode; fallbackTitle: string },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Roles page error:", error, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/10 text-destructive rounded-xl border p-4 text-sm"
        >
          <p className="font-medium">{this.props.fallbackTitle}</p>
          <p className="mt-1 text-muted-foreground">{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function CreateRoleForm() {
  const t = useTranslations("rolesPage");
  const createRole = useMutation(api.roles.createRole);
  const [name, setName] = useState("");
  const [permissionsText, setPermissionsText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("nameRequired"));
      return;
    }
    const permissions = parsePermissionsInput(permissionsText);
    setSubmitting(true);
    try {
      await createRole({ name: trimmed, permissions });
      toast.success(t("roleCreated"));
      setName("");
      setPermissionsText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border bg-card space-y-4 rounded-xl border p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold">{t("createSectionTitle")}</h2>
      <div className="space-y-2">
        <label htmlFor="new-role-name" className="text-muted-foreground text-xs font-medium">
          {t("createNameLabel")}
        </label>
        <input
          id="new-role-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("createNamePlaceholder")}
          className="border-input bg-background focus-visible:ring-ring w-full max-w-md rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor="new-role-permissions"
          className="text-muted-foreground text-xs font-medium"
        >
          {t("createPermissionsLabel")}
        </label>
        <textarea
          id="new-role-permissions"
          value={permissionsText}
          onChange={(e) => setPermissionsText(e.target.value)}
          placeholder={t("createPermissionsPlaceholder")}
          rows={4}
          className="border-input bg-background focus-visible:ring-ring w-full max-w-lg rounded-md border px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2"
        />
        <p className="text-muted-foreground text-xs">{t("createPermissionsHint")}</p>
      </div>
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? t("creating") : t("createSubmit")}
      </Button>
    </form>
  );
}

function RolesTable({
  roles,
  locale,
  canManageRoles,
}: {
  roles: Doc<"roles">[];
  locale: string;
  canManageRoles: boolean;
}) {
  const t = useTranslations("rolesPage");
  const updateRole = useMutation(api.roles.updateRole);
  const [editingId, setEditingId] = useState<Id<"roles"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editPermissionsText, setEditPermissionsText] = useState("");
  const [savingId, setSavingId] = useState<Id<"roles"> | null>(null);

  const updatedFmt = (ms: number | undefined) =>
    ms == null
      ? "—"
      : new Date(ms).toLocaleString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

  const startEdit = (role: Doc<"roles">) => {
    setEditingId(role._id);
    setEditName(role.name);
    setEditPermissionsText(role.permissions.join("\n"));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditPermissionsText("");
  };

  const saveEdit = async (id: Id<"roles">) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      toast.error(t("nameRequired"));
      return;
    }
    const permissions = parsePermissionsInput(editPermissionsText);
    setSavingId(id);
    try {
      await updateRole({
        id,
        name: trimmed,
        permissions,
      });
      toast.success(t("roleUpdated"));
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSavingId(null);
    }
  };

  if (roles.length === 0) {
    return (
      <div className="border-border bg-card/40 text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-border bg-muted/40 border-b">
            <tr>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colName")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colPermissions")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium whitespace-nowrap">
                {t("colUpdated")}
              </th>
              {canManageRoles ? (
                <th className="text-muted-foreground w-[1%] px-4 py-3 font-medium whitespace-nowrap">
                  {t("colActions")}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {roles.map((role) => {
              const isEditing = editingId === role._id;
              return (
                <tr
                  key={role._id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 align-top">
                    {isEditing ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="border-input bg-background focus-visible:ring-ring w-full min-w-[140px] max-w-[220px] rounded-md border px-2 py-1 text-sm outline-none focus-visible:ring-2"
                      />
                    ) : (
                      <span className="font-medium">{role.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {isEditing ? (
                      <textarea
                        value={editPermissionsText}
                        onChange={(e) => setEditPermissionsText(e.target.value)}
                        rows={4}
                        className="border-input bg-background focus-visible:ring-ring w-full max-w-lg rounded-md border px-2 py-1 font-mono text-xs outline-none focus-visible:ring-2"
                      />
                    ) : (
                      <div className="flex max-w-xl flex-wrap gap-1.5">
                        {role.permissions.map((p, i) => (
                          <span
                            key={`${role._id}-${i}`}
                            className="bg-muted text-muted-foreground inline-flex rounded-md px-2 py-0.5 font-mono text-xs"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 align-top whitespace-nowrap">
                    {updatedFmt(role.updatedAt)}
                  </td>
                  {canManageRoles ? (
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            disabled={savingId === role._id}
                            onClick={() => void saveEdit(role._id)}
                          >
                            {savingId === role._id ? t("saving") : t("save")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={savingId === role._id}
                            onClick={cancelEdit}
                          >
                            {t("cancel")}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={editingId !== null && editingId !== role._id}
                          onClick={() => startEdit(role)}
                        >
                          {t("edit")}
                        </Button>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RolesQueryBody() {
  const locale = useLocale();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const skip = authLoading || !isAuthenticated;
  const currentUser = useQuery(api.users.getCurrentUser, skip ? "skip" : {});
  const roles = useQuery(api.roles.getRoles, skip ? "skip" : {});

  const canManageRoles = Boolean(
    currentUser?.roleDetails?.permissions.includes("admin:all"),
  );

  if (authLoading || !isAuthenticated) {
    return (
      <div className="border-border bg-muted/30 h-48 animate-pulse rounded-xl border" />
    );
  }

  if (currentUser === undefined || roles === undefined) {
    return (
      <div className="border-border bg-muted/30 h-48 animate-pulse rounded-xl border" />
    );
  }

  return (
    <div className="space-y-6">
      {canManageRoles ? <CreateRoleForm /> : null}
      <RolesTable
        roles={roles}
        locale={locale}
        canManageRoles={canManageRoles}
      />
    </div>
  );
}

export default function RolesPageClient() {
  const t = useTranslations("rolesPage");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>

      <RolesErrorBoundary fallbackTitle={t("errorTitle")}>
        <RolesQueryBody />
      </RolesErrorBoundary>
    </div>
  );
}
