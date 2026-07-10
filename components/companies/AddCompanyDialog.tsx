"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { IconX, IconBuilding } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";
import { CountrySelect, StateSelect } from "@/components/ui/location-select";
import { PhoneInput } from "@/components/ui/phone-input";
import type { Country } from "react-phone-number-input";

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls =
  "border-input bg-background text-foreground placeholder:text-muted-foreground " +
  "focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none " +
  "focus-visible:ring-2 disabled:opacity-50";

const labelCls = "text-muted-foreground mb-1 block text-xs font-medium";

// ─── Empty form state ─────────────────────────────────────────────────────────

const emptyForm = {
  name: "",
  email: "",
  phoneNumber: "",
  website: "",
  country: "",
  city: "",
  zipCode: "",
  address: "",
  _countryCode: "" as Country | "",
};

// ─── AddCompanyDialog ─────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function AddCompanyDialog({ open, onClose, onCreated }: Props) {
  const t = useTranslations("companiesPage");
  const locale = useLocale();
  const createCompany = useMutation(api.companies.createCompany);
  const { orgGroupIdForCreate } = useOrgGroup();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const set = <K extends keyof typeof emptyForm>(k: K, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleCountryChange = (code: string, name: string) => {
    setForm((p) => ({
      ...p,
      _countryCode: code as Country,
      country: name,
      city: "",
    }));
  };

  const handleClose = () => {
    setForm(emptyForm);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error(t("createRequiredError"));
      return;
    }
    setSubmitting(true);
    try {
      await createCompany({
        name: form.name.trim(),
        ...(orgGroupIdForCreate ? { orgGroupId: orgGroupIdForCreate } : {}),
        ...(form.email ? { email: form.email.trim() } : {}),
        ...(form.phoneNumber ? { phoneNumber: form.phoneNumber.trim() } : {}),
        ...(form.website ? { website: form.website.trim() } : {}),
        ...(form.country ? { country: form.country } : {}),
        ...(form.city ? { city: form.city.trim() } : {}),
        ...(form.zipCode ? { zipCode: form.zipCode.trim() } : {}),
        ...(form.address ? { address: form.address.trim() } : {}),
      });
      toast.success(t("companyAdded"));
      setForm(emptyForm);
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-20 md:pb-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm min-h-screen min-w-screen"
        onClick={handleClose}
      />

      {/* Dialog panel */}
      <div className="bg-card border-border relative z-10 flex w-full max-w-lg flex-col rounded-2xl border shadow-2xl">
        {/* Header */}
        <div className="border-border flex items-center gap-3 border-b px-5 py-4">
          <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <IconBuilding className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold">
              {t("createSectionTitle")}
            </h2>
            <p className="text-muted-foreground text-xs">
              {t("createSubtitle")}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5 transition-colors"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="max-h-[75vh] overflow-y-auto px-5 py-4"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Name */}
            <div className="sm:col-span-2">
              <label className={labelCls}>{t("createName")} *</label>
              <input
                className={inputCls}
                value={form.name}
                placeholder={t("createNamePlaceholder")}
                required
                onChange={(e) => set("name", e.target.value)}
              />
            </div>

            {/* Email */}
            <div>
              <label className={labelCls}>{t("createEmail")}</label>
              <input
                className={inputCls}
                type="email"
                value={form.email}
                placeholder="company@example.com"
                onChange={(e) => set("email", e.target.value)}
              />
            </div>

            {/* Phone with country dial code */}
            <div>
              <label className={labelCls}>{t("createPhone")}</label>
              <PhoneInput
                value={form.phoneNumber}
                onChange={(v) => set("phoneNumber", v)}
                placeholder={t("createPhonePlaceholder")}
                defaultCountry={form._countryCode || "SA"}
              />
            </div>

            {/* Website */}
            <div className="sm:col-span-2">
              <label className={labelCls}>{t("createWebsite")}</label>
              <input
                className={inputCls}
                value={form.website}
                placeholder="https://company.com"
                onChange={(e) => set("website", e.target.value)}
              />
            </div>

            {/* Divider */}
            <div className="border-border sm:col-span-2 border-t pt-1">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                {t("createLocationSection")}
              </p>
            </div>

            {/* Country — translated via Intl.DisplayNames */}
            <div>
              <label className={labelCls}>{t("createCountry")}</label>
              <CountrySelect
                value={form._countryCode}
                onChange={handleCountryChange}
                placeholder={t("createSelectCountry")}
                locale={locale}
              />
            </div>

            {/* State */}
            <div>
              <label className={labelCls}>{t("createCity")}</label>
              <StateSelect
                countryCode={form._countryCode}
                value={form.city}
                onChange={(city) => set("city", city)}
                placeholder={t("createSelectCity")}
                chooseCountryFirst={t("chooseCountryFirst")}
              />
            </div>

            {/* Zip */}
            <div>
              <label className={labelCls}>{t("createZip")}</label>
              <input
                className={inputCls}
                value={form.zipCode}
                placeholder="10001"
                onChange={(e) => set("zipCode", e.target.value)}
              />
            </div>

            {/* Address */}
            <div className="sm:col-span-2">
              <label className={labelCls}>{t("createAddress")}</label>
              <input
                className={inputCls}
                value={form.address}
                placeholder={t("createAddressPlaceholder")}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm transition-colors"
              onClick={handleClose}
            >
              {t("addCancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? t("creating") : t("createSubmit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

