"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Btn, FieldRow, Input, SectionCard } from "./settingsShared";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";

export function CurrenciesTab() {
  const t = useTranslations("settingsPage");
  const { orgGroupFilter, orgGroupIdForCreate, effectiveOrgGroupId } =
    useOrgGroup();
  const currencies =
    useQuery(api.currencies.getCurrencies, { orgGroupId: orgGroupFilter }) ?? [];
  const defaultCurrency = currencies.find((c) => c.default);
  const defaultSymbol = defaultCurrency?.symbol ?? "—";
  const createCurrency = useMutation(api.currencies.createCurrency);
  const updateCurrency = useMutation(api.currencies.updateCurrency);
  const setDefault = useMutation(api.currencies.setDefaultCurrency);
  const deleteCurrency = useMutation(api.currencies.deleteCurrency);

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<{
    id: Id<"currencies">;
    name: string;
    symbol: string;
    exchangeRate: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const handleAdd = async () => {
    if (!name.trim() || !symbol.trim()) {
      toast.error(t("currencyRequiredError"));
      return;
    }
    setSaving(true);
    try {
      await createCurrency({
        orgGroupId: orgGroupIdForCreate ?? effectiveOrgGroupId,
        name: name.trim(),
        symbol: symbol.trim(),
        exchangeRate: exchangeRate ? parseFloat(exchangeRate) : undefined,
      });
      toast.success(t("currencyAdded"));
      setName("");
      setSymbol("");
      setExchangeRate("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: Id<"currencies">) => {
    try {
      await setDefault({ id });
      toast.success(t("currencyDefaultSet"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    }
  };

  const handleDelete = async (id: Id<"currencies">) => {
    try {
      await deleteCurrency({ id });
      toast.success(t("currencyDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    }
  };

  const startEdit = (c: Doc<"currencies">) => {
    setEditing({
      id: c._id,
      name: c.name,
      symbol: c.symbol,
      exchangeRate: c.exchangeRate != null ? String(c.exchangeRate) : "",
    });
  };

  const cancelEdit = () => setEditing(null);

  const handleSaveEdit = async () => {
    if (!editing) return;
    const nameT = editing.name.trim();
    const symT = editing.symbol.trim();
    if (!nameT || !symT) {
      toast.error(t("currencyRequiredError"));
      return;
    }
    const clearRate = editing.exchangeRate.trim() === "";
    if (!clearRate) {
      const n = parseFloat(editing.exchangeRate);
      if (Number.isNaN(n) || n <= 0) {
        toast.error(t("currencyRateInvalid"));
        return;
      }
    }
    setSavingEdit(true);
    try {
      await updateCurrency({
        id: editing.id,
        name: nameT,
        symbol: symT,
        ...(clearRate
          ? { clearExchangeRate: true as const }
          : { exchangeRate: parseFloat(editing.exchangeRate) }),
      });
      toast.success(t("currencyUpdated"));
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard title={t("currenciesListTitle")}>
        {currencies.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("currenciesEmpty")}
          </p>
        ) : (
          <div className="divide-border divide-y">
            {currencies.map((c) => {
              const isEditing = editing?.id === c._id;
              if (isEditing && editing) {
                return (
                  <div
                    key={c._id}
                    className="border-border bg-muted/20 space-y-3 rounded-lg border py-4 pe-2 ps-2 first:pt-2"
                  >
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <label className="text-muted-foreground text-xs font-medium">
                          {t("currencyName")}
                        </label>
                        <Input
                          value={editing.name}
                          onChange={(e) =>
                            setEditing((prev) =>
                              prev
                                ? { ...prev, name: e.target.value }
                                : null,
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-muted-foreground text-xs font-medium">
                          {t("currencySymbol")}
                        </label>
                        <Input
                          value={editing.symbol}
                          onChange={(e) =>
                            setEditing((prev) =>
                              prev
                                ? { ...prev, symbol: e.target.value }
                                : null,
                            )
                          }
                          maxLength={10}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-muted-foreground text-xs font-medium">
                          {t("currencyExchangeRateLabel", {
                            symbol: editing.symbol || "—",
                            defaultSymbol,
                          })}
                        </label>
                        <Input
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          value={editing.exchangeRate}
                          onChange={(e) =>
                            setEditing((prev) =>
                              prev
                                ? { ...prev, exchangeRate: e.target.value }
                                : null,
                            )
                          }
                          placeholder={t("currencyExchangeRatePlaceholder")}
                        />
                      </div>
                    </div>
                    <div className="text-muted-foreground space-y-1.5 text-xs leading-relaxed">
                      <p>{t("currencyExchangeRateNote")}</p>
                      <p>{t("currencyExchangeRateHint")}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Btn
                        variant="ghost"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                      >
                        {t("cancelEdit")}
                      </Btn>
                      <Btn onClick={handleSaveEdit} disabled={savingEdit}>
                        {savingEdit ? t("saving") : t("saveCurrency")}
                      </Btn>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={c._id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="bg-muted text-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold">
                      {c.symbol}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      {c.exchangeRate != null && !c.default && (
                        <p className="text-muted-foreground text-xs">
                          {t("currencyExchangeRateDisplay", {
                            symbol: c.symbol,
                            rate: c.exchangeRate,
                            defaultSymbol,
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                    {c.default ? (
                      <span className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 rounded-md px-2 py-0.5 text-xs font-medium">
                        {t("defaultBadge")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(c._id)}
                        className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 transition-colors hover:underline"
                      >
                        {t("setDefault")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className="text-muted-foreground hover:text-foreground p-1.5 transition-colors"
                      aria-label={t("editCurrency")}
                    >
                      <IconPencil className="h-4 w-4" />
                    </button>
                    {!c.default && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c._id)}
                        className="text-destructive/70 hover:text-destructive p-1.5 transition-colors"
                        aria-label={t("delete")}
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title={t("addCurrencyTitle")}>
        <div className="space-y-4">
          <FieldRow label={t("currencyName")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("currencyNamePlaceholder")}
            />
          </FieldRow>
          <FieldRow label={t("currencySymbol")}>
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder={t("currencySymbolPlaceholder")}
              maxLength={5}
            />
          </FieldRow>
          <FieldRow
            label={t("currencyExchangeRateLabel", {
              symbol: symbol || "—",
              defaultSymbol,
            })}
          >
            <div className="space-y-1.5">
              <Input
                type="number"
                min="0.0001"
                step="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                placeholder={t("currencyExchangeRatePlaceholder")}
              />
              <p className="text-muted-foreground text-xs leading-relaxed">
                {t("currencyExchangeRateNote")}
              </p>
            </div>
          </FieldRow>
          <div className="flex justify-end">
            <Btn onClick={handleAdd} disabled={saving}>
              {saving ? t("saving") : t("addCurrency")}
            </Btn>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
