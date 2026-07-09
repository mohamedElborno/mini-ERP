"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Btn, FieldRow, Input, SectionCard, Select } from "./settingsShared";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";

type BankForm = {
  bankName: string;
  accountNumber: string;
  iban: string;
  swift: string;
  country: string;
  city: string;
  currencyId: Id<"currencies"> | "";
  isPrimary: boolean;
  active: boolean;
};

const emptyForm = (): BankForm => ({
  bankName: "",
  accountNumber: "",
  iban: "",
  swift: "",
  country: "",
  city: "",
  currencyId: "",
  isPrimary: false,
  active: true,
});

function isFormValid(form: BankForm) {
  return Boolean(
    form.bankName.trim() &&
      form.accountNumber.trim() &&
      form.iban.trim() &&
      form.country.trim() &&
      form.city.trim() &&
      form.currencyId,
  );
}

function formToPayload(form: BankForm) {
  return {
    bankName: form.bankName.trim(),
    accountNumber: form.accountNumber.trim(),
    iban: form.iban.trim(),
    swift: form.swift.trim() || undefined,
    country: form.country.trim(),
    city: form.city.trim(),
    currency: form.currencyId as Id<"currencies">,
    isPrimary: form.isPrimary,
  };
}

function rowToForm(row: Doc<"bankAccounts">): BankForm {
  return {
    bankName: row.bankName,
    accountNumber: row.accountNumber,
    iban: row.iban,
    swift: row.swift ?? "",
    country: row.country,
    city: row.city,
    currencyId: row.currency,
    isPrimary: row.isPrimary === true,
    active: row.active !== false,
  };
}

function BankAccountFields({
  form,
  onChange,
  currencies,
  t,
  idPrefix,
}: {
  form: BankForm;
  onChange: (next: BankForm) => void;
  currencies: Doc<"currencies">[];
  t: ReturnType<typeof useTranslations<"settingsPage">>;
  idPrefix: string;
}) {
  const set = <K extends keyof BankForm>(key: K, value: BankForm[K]) =>
    onChange({ ...form, [key]: value });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FieldRow label={`${t("bankAccountBankName")} *`}>
        <Input
          id={`${idPrefix}-bankName`}
          value={form.bankName}
          onChange={(e) => set("bankName", e.target.value)}
          placeholder={t("bankAccountBankNamePlaceholder")}
        />
      </FieldRow>
      <FieldRow label={`${t("bankAccountNumber")} *`}>
        <Input
          id={`${idPrefix}-accountNumber`}
          value={form.accountNumber}
          onChange={(e) => set("accountNumber", e.target.value)}
          placeholder={t("bankAccountNumberPlaceholder")}
        />
      </FieldRow>
      <FieldRow label={`${t("bankAccountIban")} *`}>
        <Input
          id={`${idPrefix}-iban`}
          value={form.iban}
          onChange={(e) => set("iban", e.target.value)}
          placeholder={t("bankAccountIbanPlaceholder")}
        />
      </FieldRow>
      <FieldRow label={t("bankAccountSwift")}>
        <Input
          id={`${idPrefix}-swift`}
          value={form.swift}
          onChange={(e) => set("swift", e.target.value.toUpperCase())}
          placeholder={t("bankAccountSwiftPlaceholder")}
        />
      </FieldRow>
      <FieldRow label={`${t("bankAccountCountry")} *`}>
        <Input
          id={`${idPrefix}-country`}
          value={form.country}
          onChange={(e) => set("country", e.target.value)}
          placeholder={t("bankAccountCountryPlaceholder")}
        />
      </FieldRow>
      <FieldRow label={`${t("bankAccountCity")} *`}>
        <Input
          id={`${idPrefix}-city`}
          value={form.city}
          onChange={(e) => set("city", e.target.value)}
          placeholder={t("bankAccountCityPlaceholder")}
        />
      </FieldRow>
      <FieldRow label={`${t("bankAccountCurrency")} *`}>
        <Select
          id={`${idPrefix}-currency`}
          value={form.currencyId}
          onChange={(e) =>
            set("currencyId", e.target.value as Id<"currencies"> | "")
          }
        >
          <option value="">{t("bankAccountCurrencySelect")}</option>
          {currencies.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name} ({c.symbol})
            </option>
          ))}
        </Select>
      </FieldRow>
      <FieldRow label={t("bankAccountPrimary")}>
        <Select
          id={`${idPrefix}-primary`}
          value={form.isPrimary ? "yes" : "no"}
          onChange={(e) => set("isPrimary", e.target.value === "yes")}
        >
          <option value="no">{t("bankAccountPrimaryNo")}</option>
          <option value="yes">{t("bankAccountPrimaryYes")}</option>
        </Select>
      </FieldRow>
    </div>
  );
}

export function BankAccountsTab() {
  const t = useTranslations("settingsPage");
  const { orgGroupFilter, orgGroupIdForCreate, effectiveOrgGroupId } =
    useOrgGroup();
  const bankAccounts =
    useQuery(api.bankAccounts.getBankAccounts, { orgGroupId: orgGroupFilter }) ??
    [];
  const currencies =
    useQuery(api.currencies.getCurrencies, { orgGroupId: orgGroupFilter }) ?? [];
  const createBankAccount = useMutation(api.bankAccounts.createBankAccount);
  const updateBankAccount = useMutation(api.bankAccounts.updateBankAccount);
  const setPrimaryBankAccount = useMutation(
    api.bankAccounts.setPrimaryBankAccount,
  );
  const deleteBankAccount = useMutation(api.bankAccounts.deleteBankAccount);

  const [form, setForm] = useState<BankForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<Id<"bankAccounts"> | null>(null);
  const [editForm, setEditForm] = useState<BankForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const currencyLabel = (id: Id<"currencies"> | undefined) => {
    if (!id) return "—";
    const c = currencies.find((x) => x._id === id);
    return c ? `${c.name} (${c.symbol})` : "—";
  };

  const handleAdd = async () => {
    if (!isFormValid(form)) {
      toast.error(t("bankAccountRequiredError"));
      return;
    }
    setSaving(true);
    try {
      await createBankAccount({
        ...formToPayload(form),
        orgGroupId: orgGroupIdForCreate ?? effectiveOrgGroupId,
      });
      toast.success(t("bankAccountAdded"));
      setForm(emptyForm());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: Doc<"bankAccounts">) => {
    setEditingId(row._id);
    setEditForm(rowToForm(row));
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm) return;
    if (!isFormValid(editForm)) {
      toast.error(t("bankAccountRequiredError"));
      return;
    }
    setSavingEdit(true);
    try {
      await updateBankAccount({
        id: editingId,
        ...formToPayload(editForm),
        active: editForm.active,
      });
      toast.success(t("bankAccountUpdated"));
      setEditingId(null);
      setEditForm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSetPrimary = async (id: Id<"bankAccounts">) => {
    try {
      await setPrimaryBankAccount({ id });
      toast.success(t("bankAccountPrimarySet"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    }
  };

  const handleDelete = async (id: Id<"bankAccounts">) => {
    try {
      await deleteBankAccount({ id });
      toast.success(t("bankAccountDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title={t("bankAccountsListTitle")}>
        {bankAccounts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("bankAccountsEmpty")}</p>
        ) : (
          <ul className="divide-border divide-y">
            {bankAccounts.map((row) => (
              <li
                key={row._id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{row.bankName}</p>
                    {row.isPrimary && (
                      <span className="bg-primary/10 text-primary rounded-md px-2 py-0.5 text-xs font-medium">
                        {t("bankAccountPrimaryBadge")}
                      </span>
                    )}
                    {row.active === false && (
                      <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-xs">
                        {t("bankAccountInactive")}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {row.accountNumber} · {row.iban}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {row.swift
                      ? `${t("bankAccountSwift")}: ${row.swift} · `
                      : ""}
                    {row.city}, {row.country}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {currencyLabel(row.currency)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {!row.isPrimary && row.active !== false && (
                    <Btn
                      variant="ghost"
                      onClick={() => handleSetPrimary(row._id)}
                    >
                      {t("setPrimaryBankAccount")}
                    </Btn>
                  )}
                  <button
                    type="button"
                    onClick={() => startEdit(row)}
                    className="text-muted-foreground hover:text-foreground rounded-lg p-2 hover:bg-muted"
                    aria-label={t("editBankAccount")}
                  >
                    <IconPencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(row._id)}
                    className="text-muted-foreground hover:text-destructive rounded-lg p-2 hover:bg-muted"
                    aria-label={t("delete")}
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={t("addBankAccountTitle")}>
        <BankAccountFields
          form={form}
          onChange={setForm}
          currencies={currencies}
          t={t}
          idPrefix="add-bank"
        />
        <div className="mt-4 flex justify-end">
          <Btn onClick={handleAdd} disabled={saving || !isFormValid(form)}>
            {saving ? t("saving") : t("addBankAccount")}
          </Btn>
        </div>
      </SectionCard>

      {editingId && editForm && (
        <SectionCard title={t("editBankAccount")}>
          <BankAccountFields
            form={editForm}
            onChange={setEditForm}
            currencies={currencies}
            t={t}
            idPrefix="edit-bank"
          />
          <FieldRow label={t("bankAccountActive")}>
            <Select
              value={editForm.active ? "yes" : "no"}
              onChange={(e) =>
                setEditForm({ ...editForm, active: e.target.value === "yes" })
              }
            >
              <option value="yes">{t("bankAccountActiveYes")}</option>
              <option value="no">{t("bankAccountActiveNo")}</option>
            </Select>
          </FieldRow>
          <div className="mt-4 flex justify-end gap-2">
            <Btn
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setEditForm(null);
              }}
            >
              {t("cancelEdit")}
            </Btn>
            <Btn
              onClick={handleSaveEdit}
              disabled={savingEdit || !isFormValid(editForm)}
            >
              {savingEdit ? t("saving") : t("saveBankAccount")}
            </Btn>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
