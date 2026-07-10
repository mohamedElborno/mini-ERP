"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconAlertTriangle, IconPencil, IconTrash, IconX } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Btn, FieldRow, Input, SectionCard, Select } from "./settingsShared";

type EditForm = {
  id: Id<"groups">;
  name: string;
  description: string;
  parentId: Id<"groups"> | "";
  isDefault: boolean;
};

function DeleteCompanyDialog({
  company,
  onClose,
  onDeleted,
}: {
  company: Doc<"groups">;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("settingsPage");
  const preview = useQuery(api.groups.getOrgGroupDeletePreview, { id: company._id });
  const deleteGroup = useMutation(api.groups.deleteGroup);
  const [phrase, setPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);

  const expectedPhrase = preview?.confirmationPhrase ?? "DELETE COMPANY";
  const phraseOk = phrase.trim() === expectedPhrase;

  const handleDelete = async () => {
    if (!phraseOk) return;
    setDeleting(true);
    try {
      await deleteGroup({ id: company._id, confirmationPhrase: phrase.trim() });
      toast.success(t("orgCompanyDeleted"));
      onDeleted();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-20 md:pb-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-card border-border relative z-10 w-full max-w-lg rounded-2xl border p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="bg-destructive/10 text-destructive flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <IconAlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">{t("orgCompanyDeleteTitle")}</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("orgCompanyDeleteSubtitle", { name: company.name })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-lg p-1.5"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="bg-destructive/5 border-destructive/20 mb-4 space-y-2 rounded-xl border p-4 text-sm">
          <p className="font-medium text-destructive">{t("orgCompanyDeleteWarning")}</p>
          <p className="text-muted-foreground">{t("orgCompanyDeleteAdminOnly")}</p>
          {preview === undefined ? (
            <p className="text-muted-foreground animate-pulse">{t("loading")}</p>
          ) : preview.reason === "default" ? (
            <p className="text-destructive">{t("orgCompanyDefaultDeleteBlocked")}</p>
          ) : (
            <>
              <ul className="text-muted-foreground list-inside list-disc space-y-1">
                <li>{t("orgCompanyDeleteImpactClients", { count: preview.counts?.companies ?? 0 })}</li>
                <li>{t("orgCompanyDeleteImpactDeals", { count: preview.counts?.deals ?? 0 })}</li>
                <li>{t("orgCompanyDeleteImpactQuotes", { count: preview.counts?.quotes ?? 0 })}</li>
                <li>{t("orgCompanyDeleteImpactInvoices", { count: preview.counts?.invoices ?? 0 })}</li>
                <li>{t("orgCompanyDeleteImpactReceipts", { count: preview.counts?.receiptVouchers ?? 0 })}</li>
                <li>{t("orgCompanyDeleteImpactCatalog", {
                  count:
                    (preview.counts?.products ?? 0) +
                    (preview.counts?.services ?? 0) +
                    (preview.counts?.categories ?? 0),
                })}</li>
                <li>{t("orgCompanyDeleteImpactSettings", {
                  count:
                    (preview.counts?.currencies ?? 0) +
                    (preview.counts?.taxes ?? 0) +
                    (preview.counts?.bankAccounts ?? 0) +
                    (preview.counts?.settings ?? 0),
                })}</li>
              </ul>
              {(preview.subsidiaries ?? 0) > 0 && (
                <p className="text-destructive font-medium">
                  {t("orgCompanyDeleteSubsidiariesWarning", {
                    count: preview.subsidiaries ?? 0,
                    records: preview.totalRecords ?? 0,
                  })}
                </p>
              )}
              <p className="font-medium">
                {t("orgCompanyDeleteTotalRecords", { count: preview.totalRecords ?? 0 })}
              </p>
            </>
          )}
        </div>

        {preview?.canDelete && (
          <div className="space-y-3">
            <FieldRow label={t("orgCompanyDeletePhraseLabel")}>
              <Input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={expectedPhrase}
                autoComplete="off"
                spellCheck={false}
              />
            </FieldRow>
            <p className="text-muted-foreground text-xs">
              {t("orgCompanyDeletePhraseHint", { phrase: expectedPhrase })}
            </p>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose} disabled={deleting}>
            {t("cancel")}
          </Btn>
          <Btn
            variant="danger"
            onClick={handleDelete}
            disabled={deleting || !preview?.canDelete || !phraseOk}
          >
            {deleting ? t("deleting") : t("orgCompanyDeleteConfirmButton")}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function OrgCompaniesTab() {
  const t = useTranslations("settingsPage");
  const currentUser = useQuery(api.users.getCurrentUser);
  const isAdmin =
    currentUser?.roleDetails?.permissions.includes("admin:all") ?? false;

  const orgGroups = useQuery(api.groups.getGroups) ?? [];
  const createGroup = useMutation(api.groups.createGroup);
  const updateGroup = useMutation(api.groups.updateGroup);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<Id<"groups"> | "">("");
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"groups"> | null>(null);

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error(t("orgCompanyNameRequired"));
      return;
    }
    setSaving(true);
    try {
      await createGroup({
        name: name.trim(),
        description: description.trim() || undefined,
        parent: parentId || undefined,
      });
      toast.success(t("orgCompanyAdded"));
      setName("");
      setDescription("");
      setParentId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: Doc<"groups">) => {
    setEditing({
      id: row._id,
      name: row.name,
      description: row.description ?? "",
      parentId: row.parent ?? "",
      isDefault: row.isDefault === true,
    });
  };

  const cancelEdit = () => setEditing(null);

  const handleSaveEdit = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error(t("orgCompanyNameRequired"));
      return;
    }
    setSavingEdit(true);
    try {
      await updateGroup({
        id: editing.id,
        name: editing.name.trim(),
        description: editing.description.trim() || undefined,
        ...(!editing.isDefault
          ? { parent: editing.parentId || undefined }
          : {}),
      });
      toast.success(t("orgCompanyUpdated"));
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSavingEdit(false);
    }
  };

  const parentOptions = (excludeId?: Id<"groups">) =>
    orgGroups.filter((g: Doc<"groups">) => g._id !== excludeId);

  return (
    <div className="space-y-4">
      {deleteTarget && (
        <DeleteCompanyDialog
          company={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            if (editing?.id === deleteTarget._id) setEditing(null);
          }}
        />
      )}

      <SectionCard title={t("orgCompaniesListTitle")}>
        {orgGroups.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("orgCompaniesEmpty")}
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {orgGroups.map((row: Doc<"groups">) => {
              const isEditing = editing?.id === row._id;

              if (isEditing && editing) {
                return (
                  <li key={row._id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FieldRow label={`${t("orgCompanyName")} *`}>
                        <Input
                          value={editing.name}
                          onChange={(e) =>
                            setEditing({ ...editing, name: e.target.value })
                          }
                        />
                      </FieldRow>
                      {!editing.isDefault && (
                        <FieldRow label={t("orgCompanyParent")}>
                          <Select
                            value={editing.parentId}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                parentId: e.target.value as Id<"groups"> | "",
                              })
                            }
                          >
                            <option value="">{t("orgCompanyNoParent")}</option>
                            {parentOptions(editing.id).map(
                              (g: Doc<"groups">) => (
                                <option key={g._id} value={g._id}>
                                  {g.name}
                                </option>
                              ),
                            )}
                          </Select>
                        </FieldRow>
                      )}
                      <div className={editing.isDefault ? "sm:col-span-2" : undefined}>
                        <FieldRow label={t("orgCompanyDescription")}>
                          <Input
                            value={editing.description}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                description: e.target.value,
                              })
                            }
                            placeholder={t("orgCompanyDescriptionPlaceholder")}
                          />
                        </FieldRow>
                      </div>
                    </div>
                    {editing.isDefault && (
                      <p className="text-muted-foreground text-xs">
                        {t("orgCompanyDefaultEditHint")}
                      </p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Btn variant="ghost" onClick={cancelEdit}>
                        {t("cancel")}
                      </Btn>
                      <Btn
                        onClick={handleSaveEdit}
                        disabled={savingEdit || !editing.name.trim()}
                      >
                        {savingEdit ? t("saving") : t("save")}
                      </Btn>
                    </div>
                  </li>
                );
              }

              return (
                <li
                  key={row._id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{row.name}</p>
                    {row.description && (
                      <p className="text-muted-foreground text-xs">
                        {row.description}
                      </p>
                    )}
                    {row.parent && (
                      <p className="text-muted-foreground text-xs">
                        {t("orgCompanySubsidiary")}
                      </p>
                    )}
                    {row.isDefault && (
                      <span className="bg-primary/10 text-primary mt-1 inline-block rounded-md px-2 py-0.5 text-xs">
                        {t("orgCompanyDefault")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-2 transition-colors"
                      title={t("edit")}
                    >
                      <IconPencil className="h-4 w-4" />
                    </button>
                    {isAdmin && !row.isDefault && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(row)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg p-2 transition-colors"
                        title={t("delete")}
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={t("addOrgCompanyTitle")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow label={`${t("orgCompanyName")} *`}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("orgCompanyNamePlaceholder")}
            />
          </FieldRow>
          <FieldRow label={t("orgCompanyParent")}>
            <Select
              value={parentId}
              onChange={(e) =>
                setParentId(e.target.value as Id<"groups"> | "")
              }
            >
              <option value="">{t("orgCompanyNoParent")}</option>
              {orgGroups.map((g: Doc<"groups">) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </FieldRow>
          <FieldRow label={t("orgCompanyDescription")}>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("orgCompanyDescriptionPlaceholder")}
            />
          </FieldRow>
        </div>
        <div className="mt-4 flex justify-end">
          <Btn onClick={handleAdd} disabled={saving || !name.trim()}>
            {saving ? t("saving") : t("addOrgCompany")}
          </Btn>
        </div>
      </SectionCard>
    </div>
  );
}

