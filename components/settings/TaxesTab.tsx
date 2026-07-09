"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconTrash } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Btn, FieldRow, Input, SectionCard } from "./settingsShared";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";

export function TaxesTab() {
  const t = useTranslations("settingsPage");
  const { orgGroupFilter, orgGroupIdForCreate, effectiveOrgGroupId } =
    useOrgGroup();
  const taxes = useQuery(api.taxes.getTaxes, { orgGroupId: orgGroupFilter }) ?? [];
  const createTax = useMutation(api.taxes.createTax);
  const deleteTax = useMutation(api.taxes.deleteTax);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);

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
      toast.success(t("taxDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    }
  };

  return (
    <div className="space-y-6">
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
