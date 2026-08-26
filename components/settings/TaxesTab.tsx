"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconTrash } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Switch } from "@/components/ui/switch";
import { Btn, FieldRow, Input, SectionCard } from "./settingsShared";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";

export function TaxesTab() {
  const t = useTranslations("settingsPage");
  const { orgGroupFilter, orgGroupIdForCreate, effectiveOrgGroupId } =
    useOrgGroup();
  const taxes = useQuery(api.taxes.getTaxes, { orgGroupId: orgGroupFilter }) ?? [];
  const settings = useQuery(api.settings.getSettings, {
    orgGroupId: effectiveOrgGroupId ?? "all",
  });
  const createTax = useMutation(api.taxes.createTax);
  const deleteTax = useMutation(api.taxes.deleteTax);
  const updateSettings = useMutation(api.settings.updateSettings);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);

  const [allowPerLineTaxes, setAllowPerLineTaxes] = useState(false);
  const [defaultTaxIds, setDefaultTaxIds] = useState<Id<"taxes">[]>([]);
  const [policySaving, setPolicySaving] = useState(false);
  const [policyDirty, setPolicyDirty] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setAllowPerLineTaxes(settings.allowPerLineTaxes ?? false);
    setDefaultTaxIds((settings.defaultTaxIds ?? []) as Id<"taxes">[]);
    setPolicyDirty(false);
  }, [settings?._id, settings?.updatedAt]);

  const handleAdd = async () => {
    if (!name.trim() || !rate) {
      toast.error(t("taxRequiredError"));
      return;
    }
    setSaving(true);
    try {
      await createTax({
        orgGroupId: orgGroupIdForCreate ?? effectiveOrgGroupId,
        name: name.trim(),
        code: code.trim() || undefined,
        rate: parseFloat(rate) / 100,
      });
      toast.success(t("taxAdded"));
      setName("");
      setCode("");
      setRate("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: Id<"taxes">) => {
    try {
      await deleteTax({ id });
      setDefaultTaxIds((prev) => prev.filter((x) => x !== id));
      toast.success(t("taxDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    }
  };

  const toggleDefaultTax = (id: Id<"taxes">) => {
    setPolicyDirty(true);
    setDefaultTaxIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSavePolicy = async () => {
    setPolicySaving(true);
    try {
      await updateSettings({
        orgGroupId: orgGroupIdForCreate ?? effectiveOrgGroupId,
        allowPerLineTaxes,
        defaultTaxIds,
      });
      toast.success(t("taxPolicySaved"));
      setPolicyDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setPolicySaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard title={t("taxPolicyTitle")}>
        <p className="text-muted-foreground mb-4 text-sm">{t("taxPolicyHint")}</p>

        <div className="border-border mb-4 flex items-center justify-between gap-4 rounded-xl border p-4">
          <div>
            <p className="text-sm font-medium">{t("allowPerLineTaxes")}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t("allowPerLineTaxesHint")}
            </p>
          </div>
          <Switch
            checked={allowPerLineTaxes}
            onCheckedChange={(checked) => {
              setAllowPerLineTaxes(checked);
              setPolicyDirty(true);
            }}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">{t("defaultQuoteTaxes")}</p>
          <p className="text-muted-foreground mb-3 text-xs">
            {t("defaultQuoteTaxesHint")}
          </p>
          {taxes.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("taxesEmpty")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {taxes.map((tax) => (
                <label
                  key={tax._id}
                  className="border-border bg-background has-checked:border-primary/50 has-checked:bg-primary/5 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="rounded border"
                    checked={defaultTaxIds.includes(tax._id)}
                    onChange={() => toggleDefaultTax(tax._id)}
                  />
                  <span>
                    {tax.name}
                    {tax.rate != null && (
                      <span className="text-muted-foreground ms-1">
                        ({(tax.rate * 100).toFixed(2)}%)
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Btn
            onClick={handleSavePolicy}
            disabled={policySaving || !policyDirty}
          >
            {policySaving ? t("saving") : t("saveTaxPolicy")}
          </Btn>
        </div>
      </SectionCard>

      <SectionCard title={t("taxesListTitle")}>
        {taxes.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("taxesEmpty")}</p>
        ) : (
          <div className="divide-border divide-y">
            {taxes.map((tax) => (
              <div
                key={tax._id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium">
                    {tax.name}
                    {tax.code && (
                      <span className="text-muted-foreground ms-2 font-mono text-xs">
                        ({tax.code})
                      </span>
                    )}
                  </p>
                  {tax.rate != null && (
                    <p className="text-muted-foreground text-xs">
                      {(tax.rate * 100).toFixed(2)}%
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(tax._id)}
                  className="text-destructive/70 hover:text-destructive transition-colors"
                  aria-label={t("delete")}
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={t("addTaxTitle")}>
        <div className="space-y-4">
          <FieldRow label={t("taxName")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("taxNamePlaceholder")}
            />
          </FieldRow>
          <FieldRow label={t("taxCode")}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("taxCodePlaceholder")}
            />
          </FieldRow>
          <FieldRow label={t("taxRate")}>
            <div className="relative">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="15"
              />
              <span className="text-muted-foreground absolute inset-e-3 top-1/2 -translate-y-1/2 text-sm">
                %
              </span>
            </div>
          </FieldRow>
          <div className="flex justify-end">
            <Btn onClick={handleAdd} disabled={saving}>
              {saving ? t("saving") : t("addTax")}
            </Btn>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
