"use client";

import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { CountrySelect, CitySelect } from "@/components/ui/location-select";
import { PhoneInput } from "@/components/ui/phone-input";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";
import {
  IconBuilding,
  IconX,
  IconPencil,
  IconPlus,
  IconPhone,
  IconMail,
  IconWorld,
} from "@tabler/icons-react";
import { AddCompanyDialog } from "@/components/companies/AddCompanyDialog";
import { SaudiNationalAddressFields } from "@/components/companies/SaudiNationalAddressFields";
import { CompanyCreditTab } from "@/components/companies/CompanyCreditTab";
import {
  ListSearchInput,
  PageNavigationBar,
} from "@/components/ui/list-page-controls";
import { useConvexPagedQuery } from "@/lib/useConvexPagedQuery";
import type { Country } from "react-phone-number-input";

// ─── Types ───────────────────────────────────────────────────────────────────

type Company = Doc<"companies">;
type Contact = Doc<"contacts">;

// ─── Shared Styles ───────────────────────────────────────────────────────────

const inputCls =
  "border-input bg-background text-foreground placeholder:text-muted-foreground " +
  "focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none " +
  "focus-visible:ring-2 disabled:opacity-50";

const labelCls = "text-muted-foreground mb-1 block text-xs font-medium";

function fmtMoney(locale: string, n: number) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ─── Error Boundary ──────────────────────────────────────────────────────────

class CompaniesErrorBoundary extends Component<
  { children: ReactNode; fallbackTitle: string },
  { message: string | null }
> {
  state = { message: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { message: e.message };
  }
  componentDidCatch(e: Error, i: ErrorInfo) {
    console.error(e, i.componentStack);
  }
  render() {
    if (this.state.message)
      return (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/10 text-destructive rounded-xl border p-4 text-sm"
        >
          <p className="font-medium">{this.props.fallbackTitle}</p>
          <p className="text-muted-foreground mt-1">{this.state.message}</p>
        </div>
      );
    return this.props.children;
  }
}

// ─── Companies Table ─────────────────────────────────────────────────────────

function CompaniesTable({
  companies,
  onSelect,
  locale,
}: {
  companies: Company[];
  onSelect: (id: Id<"companies">) => void;
  locale: string;
}) {
  const t = useTranslations("companiesPage");
  if (companies.length === 0)
    return (
      <div className="border-border bg-card/40 text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
        {t("empty")}
      </div>
    );

  const textAlign = locale === "ar" ? "right" : "left";

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <table className={`w-full min-w-[560px] text-${textAlign} text-sm`}>
          <thead className="border-border bg-muted/40 border-b">
            <tr>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colName")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colEmail")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colPhone")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colCity")}
              </th>
              <th className="text-muted-foreground px-4 py-3 text-right font-medium">
                {t("colPrepaidBalance")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {companies.map((c) => (
              <tr
                key={c._id}
                className="hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => onSelect(c._id)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                      <IconBuilding className="text-muted-foreground h-4 w-4" />
                    </div>
                    <span className="font-medium">{c.name}</span>
                  </div>
                </td>
                <td className="text-muted-foreground px-4 py-3 text-xs">
                  {c.email ?? "—"}
                </td>
                <td className="text-muted-foreground px-4 py-3 text-xs">
                  {c.phoneNumber ?? "—"}
                </td>
                <td className="text-muted-foreground px-4 py-3 text-xs">
                  {c.city ?? "—"}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums font-medium">
                  {new Intl.NumberFormat(locale, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(c.prepaidBalance ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Company Details Tab ──────────────────────────────────────────────────────

function CompanyDetailsTab({ company }: { company: Company }) {
  const t = useTranslations("companiesPage");
  const locale = useLocale();
  const updateCompany = useMutation(api.companies.updateCompany);
  const creditSummary = useQuery(api.companyCredit.getCompanyCreditSummary, {
    companyId: company._id,
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: company.name,
    email: company.email ?? "",
    phoneNumber: company.phoneNumber ?? "",
    website: company.website ?? "",
    country: company.country ?? "",
    city: company.city ?? "",
    address: company.address ?? "",
    taxNumber: company.taxNumber ?? "",
    nationalAddress: company.nationalAddress ?? "",
    buildingNumber: company.buildingNumber ?? "",
    district: company.district ?? "",
    secondaryNumber: company.secondaryNumber ?? "",
    zipCode: company.zipCode ?? "",
    creditLimit:
      company.creditLimit != null ? String(company.creditLimit) : "",
    creditPeriodDays:
      company.creditPeriodDays != null ? String(company.creditPeriodDays) : "",
    _countryCode: "" as Country | "",
  });

  const set = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleCountryChange = (code: string, name: string) =>
    setForm((p) => ({
      ...p,
      _countryCode: code as Country,
      country: name,
      city: "",
    }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t("createRequiredError"));
      return;
    }
    setSaving(true);
    try {
      await updateCompany({
        id: company._id,
        name: form.name.trim(),
        ...(form.email ? { email: form.email } : {}),
        ...(form.phoneNumber ? { phoneNumber: form.phoneNumber } : {}),
        ...(form.website ? { website: form.website } : {}),
        ...(form.city ? { city: form.city } : {}),
        ...(form.country ? { country: form.country } : {}),
        ...(form.address ? { address: form.address } : {}),
        ...(form.taxNumber ? { taxNumber: form.taxNumber.trim() } : {}),
        ...(form.nationalAddress ? { nationalAddress: form.nationalAddress } : {}),
        ...(form.buildingNumber ? { buildingNumber: form.buildingNumber } : {}),
        ...(form.district ? { district: form.district.trim() } : {}),
        ...(form.secondaryNumber ? { secondaryNumber: form.secondaryNumber } : {}),
        ...(form.zipCode ? { zipCode: form.zipCode } : {}),
        ...(form.creditLimit.trim()
          ? { creditLimit: parseFloat(form.creditLimit) }
          : { creditLimit: 0 }),
        ...(form.creditPeriodDays.trim()
          ? { creditPeriodDays: parseInt(form.creditPeriodDays, 10) }
          : { creditPeriodDays: 0 }),
      });
      toast.success(t("companySaved"));
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Name */}
          <div className="sm:col-span-2">
            <label className={labelCls}>{t("fieldName")} *</label>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          {/* Email */}
          <div>
            <label className={labelCls}>{t("fieldEmail")}</label>
            <input
              className={inputCls}
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          {/* Phone */}
          <div>
            <label className={labelCls}>{t("fieldPhoneNumber")}</label>
            <PhoneInput
              value={form.phoneNumber}
              onChange={(v) => set("phoneNumber", v)}
              defaultCountry={form._countryCode || "SA"}
            />
          </div>
          {/* Website */}
          <div className="sm:col-span-2">
            <label className={labelCls}>{t("fieldWebsite")}</label>
            <input
              className={inputCls}
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
            />
          </div>
          {/* Country */}
          <div>
            <label className={labelCls}>{t("fieldCountry")}</label>
            <CountrySelect
              value={form._countryCode}
              onChange={handleCountryChange}
              placeholder={form.country || t("createSelectCountry")}
              locale={locale}
            />
          </div>
          {/* City */}
          <div>
            <label className={labelCls}>{t("fieldCity")}</label>
            <CitySelect
              countryCode={form._countryCode}
              value={form.city}
              onChange={(city) => set("city", city)}
              placeholder={form.city || t("createSelectCity")}
              chooseCountryFirst={t("chooseCountryFirst")}
            />
          </div>
          {/* Address */}
          <div>
            <label className={labelCls}>{t("fieldTaxNumber")}</label>
            <input
              className={inputCls}
              value={form.taxNumber}
              placeholder={t("fieldTaxNumberPlaceholder")}
              onChange={(e) => set("taxNumber", e.target.value)}
            />
          </div>
          <SaudiNationalAddressFields
            values={{
              nationalAddress: form.nationalAddress,
              buildingNumber: form.buildingNumber,
              address: form.address,
              district: form.district,
              secondaryNumber: form.secondaryNumber,
              city: form.city,
              zipCode: form.zipCode,
            }}
            onChange={(key, value) => set(key as keyof typeof form, value)}
            showCity={false}
          />
          <div className="border-border sm:col-span-2 border-t pt-3">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              {t("tabCredit")}
            </p>
          </div>
          <div>
            <label className={labelCls}>{t("creditLimit")}</label>
            <input
              type="number"
              min="0"
              step="any"
              className={inputCls}
              value={form.creditLimit}
              onChange={(e) => set("creditLimit", e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className={labelCls}>{t("creditPeriodDays")}</label>
            <input
              type="number"
              min="0"
              step="1"
              className={inputCls}
              value={form.creditPeriodDays}
              onChange={(e) => set("creditPeriodDays", e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            className="border-border hover:bg-muted rounded-lg border px-4 py-1.5 text-sm transition-colors"
            onClick={() => setEditing(false)}
          >
            {t("cancel")}
          </button>
          <button
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-1.5 text-sm transition-colors disabled:opacity-50"
            onClick={handleSave}
          >
            {saving ? t("saving") : t("save")}
          </button>
        </div>
      </div>
    );
  }

  const Row = ({
    label,
    value,
    icon,
  }: {
    label: string;
    value?: string | null;
    icon?: ReactNode;
  }) => (
    <div className="flex items-start gap-3 py-2.5">
      {icon && (
        <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-0.5 text-sm font-medium wrap-break-word">
          {value || t("noValue")}
        </p>
      </div>
    </div>
  );

  return (
    <div className="p-4">
      <div className="mb-4 flex justify-end">
        <button
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          onClick={() => setEditing(true)}
        >
          <IconPencil className="h-4 w-4" />
          {t("edit")}
        </button>
      </div>
      <div className="divide-border divide-y rounded-xl border px-4">
        <Row label={t("fieldName")} value={company.name} />
        <Row
          label={t("fieldEmail")}
          value={company.email}
          icon={<IconMail className="h-4 w-4" />}
        />
        <Row
          label={t("fieldPhoneNumber")}
          value={company.phoneNumber}
          icon={<IconPhone className="h-4 w-4" />}
        />
        <Row
          label={t("fieldWebsite")}
          value={company.website}
          icon={<IconWorld className="h-4 w-4" />}
        />
        <Row label={t("fieldCountry")} value={company.country} />
        <Row label={t("fieldCity")} value={company.city} />
        <Row label={t("fieldShortAddress")} value={company.nationalAddress} />
        <Row label={t("fieldBuildingNumber")} value={company.buildingNumber} />
        <Row label={t("fieldStreet")} value={company.address} />
        <Row label={t("fieldDistrict")} value={company.district} />
        <Row label={t("fieldSecondaryNumber")} value={company.secondaryNumber} />
        <Row label={t("fieldPostalCode")} value={company.zipCode} />
        <Row label={t("fieldTaxNumber")} value={company.taxNumber} />
        <Row
          label={t("fieldPrepaidBalance")}
          value={new Intl.NumberFormat(locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(company.prepaidBalance ?? 0)}
        />
        <div
          className="border-border -mx-4 border-t"
          role="separator"
          aria-hidden
        />
        <Row
          label={t("creditLimit")}
          value={
            creditSummary
              ? fmtMoney(locale, creditSummary.creditLimit)
              : t("noValue")
          }
        />
        <Row
          label={t("creditAvailable")}
          value={
            creditSummary
              ? fmtMoney(locale, creditSummary.creditAvailable)
              : t("noValue")
          }
        />
        <Row
          label={t("creditUsed")}
          value={
            creditSummary
              ? fmtMoney(locale, creditSummary.creditUsed)
              : t("noValue")
          }
        />
        <Row
          label={t("creditPeriodDays")}
          value={
            creditSummary
              ? String(creditSummary.creditPeriodDays)
              : t("noValue")
          }
        />
        <Row
          label={t("creditElapsedDays")}
          value={
            creditSummary ? String(creditSummary.elapsedDays) : t("noValue")
          }
        />
        <Row
          label={t("creditRemainingDays")}
          value={
            creditSummary ? String(creditSummary.remainingDays) : t("noValue")
          }
        />
      </div>
    </div>
  );
}

// ─── Contact form fields (shared add / edit) ───────────────────────────────────

type ContactFormState = {
  firstName: string;
  lastName: string;
  jobTitle: string;
  email: string;
  phoneNumber: string;
};

const emptyContactForm = (): ContactFormState => ({
  firstName: "",
  lastName: "",
  jobTitle: "",
  email: "",
  phoneNumber: "",
});

function contactFormFromDoc(c: Contact): ContactFormState {
  return {
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    jobTitle: c.jobTitle ?? "",
    email: c.email ?? "",
    phoneNumber: c.phoneNumber ?? "",
  };
}

function ContactFormFields({
  form,
  onChange,
}: {
  form: ContactFormState;
  onChange: (k: keyof ContactFormState, v: string) => void;
}) {
  const t = useTranslations("companiesPage");

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelCls}>{t("contactFirstName")}</label>
        <input
          className={inputCls}
          value={form.firstName}
          onChange={(e) => onChange("firstName", e.target.value)}
        />
      </div>
      <div>
        <label className={labelCls}>{t("contactLastName")}</label>
        <input
          className={inputCls}
          value={form.lastName}
          onChange={(e) => onChange("lastName", e.target.value)}
        />
      </div>
      <div className="col-span-2">
        <label className={labelCls}>{t("contactJobTitle")}</label>
        <input
          className={inputCls}
          value={form.jobTitle}
          onChange={(e) => onChange("jobTitle", e.target.value)}
        />
      </div>
      <div>
        <label className={labelCls}>{t("contactEmail")}</label>
        <input
          className={inputCls}
          type="email"
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
        />
      </div>
      <div>
        <label className={labelCls}>{t("contactPhone")}</label>
        <PhoneInput
          value={form.phoneNumber}
          onChange={(v) => onChange("phoneNumber", v)}
          defaultCountry="SA"
        />
      </div>
    </div>
  );
}

function contactPayloadFromForm(form: ContactFormState) {
  return {
    ...(form.firstName.trim() ? { firstName: form.firstName.trim() } : {}),
    ...(form.lastName.trim() ? { lastName: form.lastName.trim() } : {}),
    ...(form.jobTitle.trim() ? { jobTitle: form.jobTitle.trim() } : {}),
    ...(form.email.trim() ? { email: form.email.trim() } : {}),
    ...(form.phoneNumber ? { phoneNumber: form.phoneNumber } : {}),
  };
}

// ─── Company Contacts Tab ─────────────────────────────────────────────────────

function CompanyContactsTab({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("companiesPage");
  const contacts = useQuery(api.contacts.getContacts, { companyId });
  const createContact = useMutation(api.contacts.createContact);
  const updateContact = useMutation(api.contacts.updateContact);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<Id<"contacts"> | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [form, setForm] = useState<ContactFormState>(emptyContactForm);
  const [editForm, setEditForm] = useState<ContactFormState>(emptyContactForm);

  const set = (k: keyof ContactFormState, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const setEdit = (k: keyof ContactFormState, v: string) =>
    setEditForm((p) => ({ ...p, [k]: v }));

  const startEdit = (contact: Contact) => {
    setShowForm(false);
    setEditingId(contact._id);
    setEditForm(contactFormFromDoc(contact));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyContactForm());
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createContact({
        company: companyId,
        ...contactPayloadFromForm(form),
      });
      toast.success(t("contactAdded"));
      setForm(emptyContactForm());
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setEditSaving(true);
    try {
      await updateContact({
        id: editingId,
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        jobTitle: editForm.jobTitle.trim(),
        email: editForm.email.trim(),
        phoneNumber: editForm.phoneNumber,
      });
      toast.success(t("contactSaved"));
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setEditSaving(false);
    }
  };

  if (contacts === undefined)
    return (
      <div className="border-border bg-muted/30 m-4 h-24 animate-pulse rounded-xl border" />
    );

  return (
    <div className="space-y-4 p-4">
      {contacts.length === 0 && !showForm ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {t("contactsEmpty")}
        </p>
      ) : (
        <div className="space-y-2">
          {contacts.map((c: Contact) => {
            const name =
              [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";

            if (editingId === c._id) {
              return (
                <form
                  key={c._id}
                  onSubmit={handleUpdateContact}
                  className="border-border bg-muted/30 space-y-3 rounded-xl border p-4"
                >
                  <ContactFormFields form={editForm} onChange={setEdit} />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm transition-colors"
                      onClick={cancelEdit}
                    >
                      {t("contactCancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={editSaving}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-1.5 text-sm transition-colors disabled:opacity-50"
                    >
                      {editSaving ? t("saving") : t("save")}
                    </button>
                  </div>
                </form>
              );
            }

            return (
              <div
                key={c._id}
                className="border-border bg-card flex items-start gap-3 rounded-xl border p-3"
              >
                <div className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{name}</p>
                  {c.jobTitle && (
                    <p className="text-muted-foreground text-xs">
                      {c.jobTitle}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-3">
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
                      >
                        <IconMail className="h-3.5 w-3.5" />
                        {c.email}
                      </a>
                    )}
                    {c.phoneNumber && (
                      <a
                        href={`tel:${c.phoneNumber}`}
                        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
                      >
                        <IconPhone className="h-3.5 w-3.5" />
                        {c.phoneNumber}
                      </a>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(c)}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 rounded-lg p-1.5 transition-colors"
                  aria-label={t("editContact")}
                >
                  <IconPencil className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!showForm ? (
        <button
          onClick={() => {
            cancelEdit();
            setShowForm(true);
          }}
          className="border-border hover:bg-muted text-muted-foreground flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-2.5 text-sm transition-colors"
        >
          <IconPlus className="h-4 w-4" />
          {t("addContact")}
        </button>
      ) : (
        <form
          onSubmit={handleAddContact}
          className="border-border bg-muted/30 space-y-3 rounded-xl border p-4"
        >
          <ContactFormFields form={form} onChange={set} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm transition-colors"
              onClick={() => setShowForm(false)}
            >
              {t("contactCancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-1.5 text-sm transition-colors disabled:opacity-50"
            >
              {submitting ? t("contactAdding") : t("contactSubmit")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Company Drawer ───────────────────────────────────────────────────────────

function CompanyDrawer({
  company,
  onClose,
}: {
  company: Company | null;
  onClose: () => void;
}) {
  const t = useTranslations("companiesPage");
  const [tab, setTab] = useState<"details" | "contacts" | "credit">("details");
  const isOpen = company !== null;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <div
        className={`fixed top-0 right-0 z-50 flex h-full w-full max-w-[480px] flex-col bg-card shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {company && (
          <>
            <div className="border-border flex items-center gap-3 border-b px-4 py-4">
              <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                <IconBuilding className="text-muted-foreground h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold">{company.name}</h2>
                {company.city && (
                  <p className="text-muted-foreground truncate text-xs">
                    {company.city}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5 transition-colors"
              >
                <IconX className="h-5 w-5" />
              </button>
            </div>

            <div className="border-border flex border-b px-4">
              {(
                [
                  ["details", "tabDetails"],
                  ["credit", "tabCredit"],
                  ["contacts", "tabContacts"],
                ] as const
              ).map(([tabKey, labelKey]) => (
                <button
                  key={tabKey}
                  onClick={() => setTab(tabKey)}
                  className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    tab === tabKey
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {tab === "details" ? (
                <CompanyDetailsTab key={company._id} company={company} />
              ) : tab === "credit" ? (
                <CompanyCreditTab key={company._id} companyId={company._id} />
              ) : (
                <CompanyContactsTab key={company._id} companyId={company._id} />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Companies Query Body ─────────────────────────────────────────────────────

function CompaniesQueryBody() {
  const t = useTranslations("companiesPage");
  const tList = useTranslations("listPages");
  const locale = useLocale();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const [selectedId, setSelectedId] = useState<Id<"companies"> | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { orgGroupFilter } = useOrgGroup();

  const stats = useQuery(
    api.companies.getCompanyListStats,
    authLoading || !isAuthenticated ? "skip" : { orgGroupId: orgGroupFilter },
  );

  const listArgs =
    authLoading || !isAuthenticated
      ? "skip"
      : {
          orgGroupId: orgGroupFilter,
          search: searchDebounced.trim() || undefined,
        };

  const pagination = useConvexPagedQuery<Company>(
    api.companies.listCompaniesPaginated,
    listArgs,
    {
      totalItems: searchDebounced.trim() ? undefined : stats?.total,
    },
  );

  const selectedCompanyDoc = useQuery(
    api.companies.getCompanyById,
    selectedId ? { id: selectedId } : "skip",
  );

  if (
    authLoading ||
    !isAuthenticated ||
    stats === undefined ||
    pagination.isLoading
  ) {
    return (
      <div className="border-border bg-muted/30 h-48 animate-pulse rounded-xl border" />
    );
  }

  const selectedCompany = selectedCompanyDoc ?? null;

  return (
    <>
      <ListSearchInput
        value={searchInput}
        onChange={setSearchInput}
        placeholder={tList("searchCompanies")}
      />
      <CompaniesTable
        companies={pagination.page}
        onSelect={(id) => setSelectedId(id)}
        locale={locale}
      />
      <PageNavigationBar
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        rangeStart={pagination.rangeStart}
        rangeEnd={pagination.rangeEnd}
        totalItems={pagination.totalItems}
        pageSize={pagination.pageSize}
        onPageSizeChange={pagination.setPageSize}
        canGoPrev={pagination.canGoPrev}
        canGoNext={pagination.canGoNext}
        onPrev={pagination.goPrev}
        onNext={pagination.goNext}
      />
      <CompanyDrawer
        company={selectedCompany}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

// ─── Page Root ────────────────────────────────────────────────────────────────

export default function CompaniesPageClient() {
  const t = useTranslations("companiesPage");
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
        </div>
        <button
          className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          onClick={() => setDialogOpen(true)}
        >
          {t("addCompany")}
        </button>
      </div>

      <AddCompanyDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />

      <CompaniesErrorBoundary fallbackTitle={t("errorTitle")}>
        <CompaniesQueryBody />
      </CompaniesErrorBoundary>
    </div>
  );
}
