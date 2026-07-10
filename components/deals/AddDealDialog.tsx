"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconHeartHandshake, IconX, IconCalendar } from "@tabler/icons-react";
import { ar as arLocale, enUS as enLocale } from "date-fns/locale";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";
import { Calendar } from "@/components/ui/calendar";

// ─── Types ────────────────────────────────────────────────────────────────────

type DealStage = NonNullable<Doc<"deals">["stage"]>;

const STAGES: DealStage[] = ["lead", "contacted", "negotiation", "won", "lost"];

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls =
  "border-input bg-background text-foreground placeholder:text-muted-foreground " +
  "focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none " +
  "focus-visible:ring-2 disabled:opacity-50";

const labelCls = "text-muted-foreground mb-1 block text-xs font-medium";

// ─── Empty form ───────────────────────────────────────────────────────────────

const emptyForm = {
  title: "",
  company: "" as Id<"companies"> | "",
  contact: "" as Id<"contacts"> | "",
  stage: "lead" as DealStage,
  value: "",
  probability: "",
  description: "",
};

// ─── DatePicker field ─────────────────────────────────────────────────────────

function DatePickerField({
  value,
  onChange,
  placeholder,
  locale,
}: {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder: string;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const dateLocale = locale === "ar" ? arLocale : enLocale;

  const displayLabel = value
    ? value.toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : placeholder;

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    }
    setOpen(true);
  };

  const handleSelect = (date: Date | undefined) => {
    onChange(date);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={`${inputCls} flex items-center justify-between gap-2 text-start`}
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>
          {displayLabel}
        </span>
        <IconCalendar className="text-muted-foreground h-4 w-4 shrink-0" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-60"
              onClick={() => setOpen(false)}
            />
            {/* Calendar popup */}
            <div
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                minWidth: pos.width,
                zIndex: 61,
              }}
              className="border-border bg-card rounded-xl border shadow-2xl"
            >
              <Calendar
                mode="single"
                selected={value}
                onSelect={handleSelect}
                locale={dateLocale}
                captionLayout="dropdown"
                fromYear={new Date().getFullYear() - 1}
                toYear={new Date().getFullYear() + 5}
                initialFocus
              />
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

// ─── AddDealDialog ────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function AddDealDialog({ open, onClose, onCreated }: Props) {
  const t = useTranslations("dealsPage");
  const locale = useLocale();
  const { isAuthenticated } = useConvexAuth();

  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [currencyId, setCurrencyId] = useState<Id<"currencies"> | "">("");
  const [expectedCloseDate, setExpectedCloseDate] = useState<
    Date | undefined
  >();

  const set = <K extends keyof typeof emptyForm>(k: K, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  // ── Data queries ──────────────────────────────────────────────────────────

  const { orgGroupFilter, orgGroupIdForCreate } = useOrgGroup();

  const companies = useQuery(
    api.companies.getCompanies,
    isAuthenticated ? { orgGroupId: orgGroupFilter } : "skip",
  );

  const settings = useQuery(
    api.settings.getSettings,
    isAuthenticated && orgGroupIdForCreate
      ? { orgGroupId: orgGroupIdForCreate }
      : isAuthenticated
        ? { orgGroupId: orgGroupFilter }
        : "skip",
  );

  const currencies = useQuery(
    api.currencies.getCurrencies,
    isAuthenticated ? { orgGroupId: orgGroupFilter } : "skip",
  );

  const defaultCurrencyId = useMemo(() => {
    if (!currencies?.length) return undefined;
    const fromSettings = settings?.defaultCurrency;
    if (fromSettings) return fromSettings;
    return currencies.find((c) => c.default)?._id;
  }, [settings?.defaultCurrency, currencies]);

  useEffect(() => {
    if (!open || !defaultCurrencyId) return;
    setCurrencyId(defaultCurrencyId);
  }, [open, defaultCurrencyId]);

  // Contacts load only after a company is selected
  const contacts = useQuery(
    api.contacts.getContacts,
    isAuthenticated && form.company
      ? { companyId: form.company as Id<"companies"> }
      : "skip",
  );

  const createDeal = useMutation(api.deals.createDeal);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCompanyChange = (companyId: string) => {
    setForm((p) => ({
      ...p,
      company: companyId as Id<"companies"> | "",
      contact: "",
    }));
  };

  const handleClose = () => {
    setForm(emptyForm);
    setCurrencyId("");
    setExpectedCloseDate(undefined);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.contact) {
      toast.error(t("createRequiredError"));
      return;
    }
    if (!currencyId) {
      toast.error(t("createCurrencyRequired"));
      return;
    }
    setSubmitting(true);
    try {
      await createDeal({
        title: form.title.trim(),
        contact: form.contact as Id<"contacts">,
        ...(form.company ? { company: form.company as Id<"companies"> } : {}),
        ...(orgGroupIdForCreate ? { orgGroupId: orgGroupIdForCreate } : {}),
        stage: form.stage,
        currency: currencyId,
        ...(form.value !== "" ? { value: parseFloat(form.value) } : {}),
        ...(form.probability !== ""
          ? { probability: parseFloat(form.probability) }
          : {}),
        ...(expectedCloseDate
          ? { expectedCloseDate: expectedCloseDate.getTime() }
          : {}),
        ...(form.description.trim()
          ? { description: form.description.trim() }
          : {}),
      });
      toast.success(t("dealCreated"));
      setForm(emptyForm);
      setCurrencyId(defaultCurrencyId ?? "");
      setExpectedCloseDate(undefined);
      onCreated?.();
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const contactsReady = form.company !== "" && contacts !== undefined;
  const contactsLoading = form.company !== "" && contacts === undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-20 md:pb-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm min-h-screen min-w-screen"
        onClick={handleClose}
      />

      {/* Dialog panel */}
      <div className="bg-card border-border relative z-10 flex w-full max-w-lg flex-col rounded-2xl border shadow-2xl">
        {/* Header */}
        <div className="border-border flex items-center gap-3 border-b px-5 py-4">
          <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            <IconHeartHandshake className="h-5 w-5" />
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
            {/* Title */}
            <div className="sm:col-span-2">
              <label className={labelCls}>{t("createTitle")} *</label>
              <input
                className={inputCls}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder={t("createTitlePlaceholder")}
                required
              />
            </div>

            {/* Company — select first */}
            <div className="sm:col-span-2">
              <label className={labelCls}>{t("createCompany")}</label>
              <select
                className={inputCls}
                value={form.company}
                onChange={(e) => handleCompanyChange(e.target.value)}
              >
                <option value="">{t("createSelectCompany")}</option>
                {companies?.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Contact — loaded after company selection */}
            <div className="sm:col-span-2">
              <label className={labelCls}>{t("createContact")} *</label>
              {!form.company ? (
                <div
                  className={`${inputCls} text-muted-foreground cursor-not-allowed`}
                >
                  {t("selectCompanyFirst")}
                </div>
              ) : contactsLoading ? (
                <div
                  className={`${inputCls} text-muted-foreground animate-pulse`}
                >
                  {t("loadingContacts")}
                </div>
              ) : (
                <>
                  <select
                    className={inputCls}
                    value={form.contact}
                    onChange={(e) => set("contact", e.target.value)}
                    required
                  >
                    <option value="">{t("createSelectContact")}</option>
                    {contacts?.map((c) => (
                      <option key={c._id} value={c._id}>
                        {[c.firstName, c.lastName].filter(Boolean).join(" ") ||
                          c.email ||
                          c._id}
                      </option>
                    ))}
                  </select>
                  {contactsReady && contacts.length === 0 && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t("noContactsForCompany")}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Stage */}
            <div>
              <label className={labelCls}>{t("createStage")}</label>
              <select
                className={inputCls}
                value={form.stage}
                onChange={(e) => set("stage", e.target.value)}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {t(`stage.${s}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* Currency */}
            <div>
              <label className={labelCls}>{t("createCurrency")}</label>
              <select
                className={inputCls}
                value={currencyId}
                onChange={(e) =>
                  setCurrencyId(e.target.value as Id<"currencies">)
                }
                required
              >
                <option value="">{t("createSelectCurrency")}</option>
                {currencies?.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.symbol} — {c.name}
                    {c.default ? ` (${t("defaultCurrencyBadge")})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Value */}
            <div>
              <label className={labelCls}>{t("createValue")}</label>
              <input
                type="number"
                min="0"
                step="any"
                className={inputCls}
                value={form.value}
                onChange={(e) => set("value", e.target.value)}
                placeholder="0"
              />
            </div>

            {/* Probability */}
            <div>
              <label className={labelCls}>{t("createProbability")}</label>
              <input
                type="number"
                min="0"
                max="100"
                className={inputCls}
                value={form.probability}
                onChange={(e) => set("probability", e.target.value)}
                placeholder="0 – 100"
              />
            </div>

            {/* Expected Close Date — Calendar picker */}
            <div>
              <label className={labelCls}>{t("createExpectedClose")}</label>
              <DatePickerField
                value={expectedCloseDate}
                onChange={setExpectedCloseDate}
                placeholder={t("pickDate")}
                locale={locale}
              />
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className={labelCls}>{t("createDescription")}</label>
              <textarea
                className={inputCls}
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder={t("createDescriptionPlaceholder")}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm transition-colors"
              onClick={handleClose}
            >
              {t("createCancel")}
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

