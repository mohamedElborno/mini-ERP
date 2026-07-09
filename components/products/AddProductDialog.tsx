"use client";

import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  IconPackage,
  IconPencil,
  IconX,
  IconPlus,
  IconCheck,
  IconLoader2,
  IconTag,
  IconSearch,
  IconChevronDown,
} from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls =
  "border-input bg-background text-foreground placeholder:text-muted-foreground " +
  "focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none " +
  "focus-visible:ring-2 disabled:opacity-50";

const labelCls = "text-muted-foreground mb-1 block text-xs font-medium";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductStatus = "draft" | "active" | "archived";

// ─── Empty form ───────────────────────────────────────────────────────────────

const emptyForm = {
  name: "",
  code: "",
  description: "",
  price: "",
  stock: "",
  status: "active" as ProductStatus,
};

// ─── Inline Category Creator ──────────────────────────────────────────────────

function InlineCategoryCreator({
  onCreated,
  onCancel,
  orgGroupId,
}: {
  onCreated: (cat: Doc<"categories">) => void;
  onCancel: () => void;
  orgGroupId?: Id<"groups">;
}) {
  const t = useTranslations("productsPage");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const createCategory = useMutation(api.categories.createCategory);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const id = await createCategory({ name: trimmed, orgGroupId });
      onCreated({ _id: id, name: trimmed } as Doc<"categories">);
      toast.success(t("categoryCreated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") onCancel();
  };

  return (
    <div className="border-border bg-muted/40 mt-2 flex items-center gap-2 rounded-lg border p-2">
      <IconTag className="text-muted-foreground h-4 w-4 shrink-0" />
      <input
        ref={inputRef}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("newCategoryNamePlaceholder")}
        className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring min-w-0 flex-1 rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2"
        disabled={busy}
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={busy || !name.trim()}
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40"
        aria-label={t("newCategoryAdd")}
      >
        {busy ? (
          <IconLoader2 className="h-4 w-4 animate-spin" />
        ) : (
          <IconCheck className="h-4 w-4" />
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
        aria-label={t("createCancel")}
      >
        <IconX className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Category Multi-Selector ──────────────────────────────────────────────────

function CategoryMultiSelector({
  selectedIds,
  onChange,
  allCategories,
  orgGroupId,
}: {
  selectedIds: Id<"categories">[];
  onChange: (ids: Id<"categories">[]) => void;
  allCategories: Doc<"categories">[] | undefined;
  orgGroupId?: Id<"groups">;
}) {
  const t = useTranslations("productsPage");

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedCats =
    allCategories?.filter((c) => selectedIds.includes(c._id)) ?? [];

  const filteredCats = (allCategories ?? [])
    .filter((c) => !selectedIds.includes(c._id))
    .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  const handleAdd = (cat: Doc<"categories">) => {
    onChange([...selectedIds, cat._id]);
    setQuery("");
    setActiveIdx(0);
    inputRef.current?.focus();
  };

  const handleRemove = (id: Id<"categories">) => {
    onChange(selectedIds.filter((s) => s !== id));
  };

  const handleCreated = (cat: Doc<"categories">) => {
    onChange([...selectedIds, cat._id]);
    setShowCreate(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && e.key !== "Escape") setOpen(true);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filteredCats.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredCats[activeIdx]) handleAdd(filteredCats[activeIdx]);
        break;
      case "Escape":
        setOpen(false);
        setQuery("");
        break;
      case "Backspace":
        if (!query && selectedIds.length > 0) {
          handleRemove(selectedIds[selectedIds.length - 1]);
        }
        break;
    }
  };

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      {selectedCats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedCats.map((cat) => (
            <span
              key={cat._id}
              className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
            >
              <IconTag className="h-3 w-3 shrink-0" />
              {cat.name}
              <button
                type="button"
                onClick={() => handleRemove(cat._id)}
                className="hover:text-destructive ms-0.5 transition-colors"
                aria-label={`Remove ${cat.name}`}
              >
                <IconX className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input + New button */}
      <div className="flex items-center gap-2" ref={containerRef}>
        <div className="relative flex-1">
          {/* Trigger box — click anywhere to toggle, click input to type */}
          <div
            className={`border-input bg-background flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-shadow ${open ? "ring-ring ring-2" : ""}`}
            onClick={() => {
              if (open) {
                setOpen(false);
                setQuery("");
              } else {
                setOpen(true);
                inputRef.current?.focus();
              }
            }}
          >
            <IconSearch className="text-muted-foreground h-4 w-4 shrink-0 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIdx(0);
                if (!open) setOpen(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                allCategories === undefined
                  ? `${t("createSelectCategory")}…`
                  : filteredCats.length === 0 && !query
                    ? t("allCategoriesSelected")
                    : t("searchCategories")
              }
              className="placeholder:text-muted-foreground min-w-0 flex-1 cursor-text bg-transparent outline-none"
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (open) {
                  setOpen(false);
                  setQuery("");
                } else {
                  setOpen(true);
                  inputRef.current?.focus();
                }
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <IconChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {/* Dropdown list */}
          {open && (
            <div className="border-border bg-card absolute z-50 mt-1 w-full rounded-xl border shadow-xl">
              {filteredCats.length === 0 ? (
                <p className="text-muted-foreground px-3 py-2.5 text-sm">
                  {query ? t("categoryNoResults") : t("allCategoriesSelected")}
                </p>
              ) : (
                <ul className="max-h-48 overflow-y-auto py-1">
                  {filteredCats.map((cat, idx) => (
                    <li key={cat._id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault(); // prevent blur before click
                          handleAdd(cat);
                        }}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                          idx === activeIdx
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        <IconTag className="h-3.5 w-3.5 shrink-0" />
                        {cat.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* New category button */}
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setOpen(false);
          }}
          className={`border-border hover:bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
            showCreate
              ? "bg-primary/10 text-primary border-primary/30"
              : "text-muted-foreground"
          }`}
          title={t("newCategoryButton")}
        >
          <IconPlus className="h-4 w-4" />
        </button>
      </div>

      {/* Inline creator */}
      {showCreate && (
        <InlineCategoryCreator
          orgGroupId={orgGroupId}
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

// ─── AddProductDialog ─────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  /** Pass a product to switch to edit mode */
  product?: Doc<"products">;
}

export function AddProductDialog({ open, onClose, onCreated, product }: Props) {
  const t = useTranslations("productsPage");
  const { isAuthenticated } = useConvexAuth();
  const { orgGroupFilter, orgGroupIdForCreate, effectiveOrgGroupId } =
    useOrgGroup();
  const isEditMode = !!product;

  const settings = useQuery(
    api.settings.getSettings,
    isAuthenticated
      ? { orgGroupId: orgGroupIdForCreate ?? effectiveOrgGroupId ?? "all" }
      : "skip",
  );
  const productCodeAuto = settings?.productCodeMode === "auto";

  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<
    Id<"categories">[]
  >([]);

  // Populate form when switching between add/edit or when product changes
  useEffect(() => {
    if (open) {
      if (product) {
        setForm({
          name: product.name,
          code: product.code ?? "",
          description: product.description ?? "",
          price: product.price != null ? String(product.price) : "",
          stock: product.stock != null ? String(product.stock) : "",
          status: product.status ?? "active",
        });
        setSelectedCategoryIds(product.categories ?? []);
      } else {
        setForm(emptyForm);
        setSelectedCategoryIds([]);
      }
    }
  }, [open, product]);

  const set = <K extends keyof typeof emptyForm>(k: K, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const categories = useQuery(
    api.categories.getCategories,
    isAuthenticated ? { orgGroupId: orgGroupFilter } : "skip",
  );
  const productLive = useQuery(
    api.products.getProductById,
    open && product ? { id: product._id } : "skip",
  );

  const inventory = productLive ?? product;

  const createProduct = useMutation(api.products.createProduct);
  const updateProduct = useMutation(api.products.updateProduct);

  const handleClose = () => {
    setForm(emptyForm);
    setSelectedCategoryIds([]);
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
      if (isEditMode && product) {
        await updateProduct({
          id: product._id,
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          categories: selectedCategoryIds,
          description: form.description.trim() || undefined,
          price: form.price !== "" ? parseFloat(form.price) : undefined,
          stock: form.stock !== "" ? parseInt(form.stock, 10) : undefined,
          status: form.status,
        });
        toast.success(t("productUpdated"));
      } else {
        await createProduct({
          orgGroupId: orgGroupIdForCreate ?? effectiveOrgGroupId,
          name: form.name.trim(),
          ...(form.code.trim() ? { code: form.code.trim() } : {}),
          ...(selectedCategoryIds.length > 0
            ? { categories: selectedCategoryIds }
            : {}),
          ...(form.description.trim()
            ? { description: form.description.trim() }
            : {}),
          ...(form.price !== "" ? { price: parseFloat(form.price) } : {}),
          ...(form.stock !== "" ? { stock: parseInt(form.stock, 10) } : {}),
          status: form.status,
        });
        toast.success(t("productAdded"));
      }
      onCreated?.();
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const STATUSES: ProductStatus[] = ["active", "draft", "archived"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog panel */}
      <div className="bg-card border-border relative z-10 flex w-full max-w-lg flex-col rounded-2xl border shadow-2xl">
        {/* Header */}
        <div className="border-border flex items-center gap-3 border-b px-5 py-4">
          <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
            {isEditMode ? (
              <IconPencil className="h-5 w-5" />
            ) : (
              <IconPackage className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold">
              {isEditMode ? t("editSectionTitle") : t("createSectionTitle")}
            </h2>
            <p className="text-muted-foreground text-xs">
              {isEditMode ? t("editSubtitle") : t("createSubtitle")}
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
                onChange={(e) => set("name", e.target.value)}
                placeholder={t("createNamePlaceholder")}
                required
                autoFocus
              />
            </div>

            {/* Code (SKU) */}
            {!isEditMode && productCodeAuto ? (
              <div>
                <label className={labelCls}>{t("createCode")}</label>
                <p className="text-muted-foreground bg-muted/40 border-border rounded-lg border px-3 py-2 text-sm">
                  {t("createCodeAutoHint")}
                </p>
              </div>
            ) : (
              <div>
                <label className={labelCls}>{t("createCode")}</label>
                <input
                  className={inputCls}
                  value={form.code}
                  onChange={(e) => set("code", e.target.value)}
                  placeholder={t("createCodePlaceholder")}
                />
              </div>
            )}

            {/* Status */}
            <div>
              <label className={labelCls}>{t("createStatus")}</label>
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* Price */}
            <div>
              <label className={labelCls}>{t("createPrice")}</label>
              <input
                type="number"
                min="0"
                step="any"
                className={inputCls}
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Stock */}
            <div>
              <label className={labelCls}>{t("createStock")}</label>
              <input
                type="number"
                min="0"
                step="1"
                className={inputCls}
                value={form.stock}
                onChange={(e) => set("stock", e.target.value)}
                placeholder="0"
              />
            </div>

            {isEditMode && inventory && (
              <div className="sm:col-span-2 border-border space-y-2 rounded-xl border p-3">
                <p className="text-muted-foreground text-xs">
                  {t("inventoryFromQuotesHint")}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className={labelCls}>{t("fieldQuoteReserved")}</p>
                    <p className="text-foreground font-medium tabular-nums">
                      {inventory.reserved ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className={labelCls}>{t("fieldQuoteShortage")}</p>
                    <p
                      className={
                        (inventory.shortage ?? 0) > 0
                          ? "text-amber-700 dark:text-amber-400 font-medium tabular-nums"
                          : "text-foreground font-medium tabular-nums"
                      }
                    >
                      {inventory.shortage ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Categories — multi-select with inline create */}
            <div className="sm:col-span-2">
              <label className={labelCls}>
                {t("createCategory")}
                <span className="text-muted-foreground/60 ms-1 font-normal">
                  {t("createCategoryHint")}
                </span>
              </label>
              <CategoryMultiSelector
                selectedIds={selectedCategoryIds}
                onChange={setSelectedCategoryIds}
                allCategories={categories}
                orgGroupId={orgGroupIdForCreate ?? effectiveOrgGroupId}
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
              {submitting
                ? isEditMode
                  ? t("saving")
                  : t("creating")
                : isEditMode
                  ? t("editSubmit")
                  : t("createSubmit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
