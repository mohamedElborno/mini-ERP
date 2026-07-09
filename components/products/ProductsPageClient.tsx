"use client";

import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconTag, IconPencil } from "@tabler/icons-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { AddProductDialog } from "@/components/products/AddProductDialog";
import { useOrgGroup } from "@/components/providers/OrgGroupProvider";
import {
  FilterableKpiCards,
  ListSearchInput,
  PageNavigationBar,
} from "@/components/ui/list-page-controls";
import {
  totalForStatusFilter,
  useConvexPagedQuery,
} from "@/lib/useConvexPagedQuery";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductStatus = NonNullable<Doc<"products">["status"]>;

const STATUSES: ProductStatus[] = ["active", "draft", "archived"];

// ─── Error Boundary ──────────────────────────────────────────────────────────

class ProductsErrorBoundary extends Component<
  { children: ReactNode; fallbackTitle: string },
  { message: string | null }
> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Products page error:", error, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/10 text-destructive rounded-xl border p-4 text-sm"
        >
          <p className="font-medium">{this.props.fallbackTitle}</p>
          <p className="text-muted-foreground mt-1">{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadgeClass(status: ProductStatus | undefined) {
  switch (status) {
    case "active":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "archived":
      return "bg-muted text-muted-foreground";
    case "draft":
    default:
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
  }
}

// ─── Products Table ───────────────────────────────────────────────────────────

function ProductsTable({
  products,
  locale,
  onStatusChange,
  onEdit,
  pendingId,
  categoriesMap,
}: {
  products: Doc<"products">[];
  locale: string;
  onStatusChange: (id: Id<"products">, status: ProductStatus) => void;
  onEdit: (product: Doc<"products">) => void;
  pendingId: Id<"products"> | null;
  categoriesMap: Map<string, string>;
}) {
  const t = useTranslations("productsPage");

  const moneyFmt = (n: number | undefined) =>
    n == null
      ? "—"
      : new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);

  if (products.length === 0) {
    return (
      <div className="border-border bg-card/40 text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
        {t("empty")}
      </div>
    );
  }

  const textAlign = locale === "ar" ? "right" : "left";

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="overflow-x-auto">
        <table className={`w-full min-w-[1000px] text-${textAlign} text-sm`}>
          <thead className="border-border bg-muted/40 border-b">
            <tr>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colName")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colCode")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colCategory")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colPrice")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colStock")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colQuoteReserved")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colQuoteShortage")}
              </th>
              <th className="text-muted-foreground px-4 py-3 font-medium">
                {t("colStatus")}
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {products.map((product) => {
              const status = product.status ?? "draft";
              const cats = product.categories ?? [];

              return (
                <tr
                  key={product._id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  {/* Name + description */}
                  <td className="px-4 py-3">
                    <div className="max-w-[200px]">
                      <span className="font-medium">{product.name}</span>
                      {product.description && (
                        <p className="text-muted-foreground line-clamp-1 text-xs">
                          {product.description}
                        </p>
                      )}
                    </div>
                  </td>

                  {/* SKU */}
                  <td className="text-muted-foreground px-4 py-3 font-mono text-xs whitespace-nowrap">
                    {product.code ?? "—"}
                  </td>

                  {/* Categories */}
                  <td className="px-4 py-3">
                    {cats.length === 0 ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {cats.map((catId) => (
                          <span
                            key={catId}
                            className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                          >
                            <IconTag className="h-2.5 w-2.5 shrink-0" />
                            {categoriesMap.get(catId) ?? "…"}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Price */}
                  <td className="text-muted-foreground px-4 py-3 tabular-nums whitespace-nowrap">
                    {moneyFmt(product.price)}
                  </td>

                  {/* Stock */}
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                    <span
                      className={
                        (product.stock ?? 0) === 0
                          ? "text-destructive font-medium"
                          : "text-foreground"
                      }
                    >
                      {product.stock ?? 0}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-4 py-3 tabular-nums">
                    {product.reserved ?? 0}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <span
                      className={
                        (product.shortage ?? 0) > 0
                          ? "text-amber-700 dark:text-amber-400 font-medium"
                          : "text-muted-foreground"
                      }
                    >
                      {product.shortage ?? 0}
                    </span>
                  </td>

                  {/* Status badge + changer */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}
                      >
                        {t(`status.${status}`)}
                      </span>
                      <select
                        className="border-input bg-background text-foreground focus-visible:ring-ring max-w-[130px] rounded-md border px-2 py-1 text-xs outline-none focus-visible:ring-2"
                        value={status}
                        disabled={pendingId === product._id}
                        aria-label={t("changeStatus")}
                        onChange={(e) =>
                          onStatusChange(
                            product._id,
                            e.target.value as ProductStatus,
                          )
                        }
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {t(`status.${s}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  {/* Edit action */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onEdit(product)}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5 transition-colors"
                      aria-label={t("editProduct")}
                      title={t("editProduct")}
                    >
                      <IconPencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Products Query Body ──────────────────────────────────────────────────────

function ProductsQueryBody() {
  const t = useTranslations("productsPage");
  const tList = useTranslations("listPages");
  const locale = useLocale();
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();

  const { orgGroupFilter } = useOrgGroup();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const stats = useQuery(
    api.products.getProductListStats,
    authLoading || !isAuthenticated ? "skip" : { orgGroupId: orgGroupFilter },
  );

  const listArgs =
    authLoading || !isAuthenticated
      ? "skip"
      : {
          orgGroupId: orgGroupFilter,
          statusFilter: statusFilter === "all" ? undefined : statusFilter,
          search: searchDebounced.trim() || undefined,
        };

  const pagination = useConvexPagedQuery<Doc<"products">>(
    api.products.listProductsPaginated,
    listArgs,
    {
      totalItems: searchDebounced.trim()
        ? undefined
        : totalForStatusFilter(stats, statusFilter),
    },
  );

  const allCategories = useQuery(
    api.categories.getCategories,
    authLoading || !isAuthenticated ? "skip" : { orgGroupId: orgGroupFilter },
  );

  const updateProduct = useMutation(api.products.updateProduct);
  const [pendingId, setPendingId] = useState<Id<"products"> | null>(null);
  const [editingProduct, setEditingProduct] = useState<Doc<"products"> | null>(
    null,
  );

  if (authLoading || !isAuthenticated || stats === undefined || pagination.isLoading) {
    return (
      <div className="border-border bg-muted/30 h-48 animate-pulse rounded-xl border" />
    );
  }

  const categoriesMap = new Map<string, string>(
    (allCategories ?? []).map((c) => [c._id, c.name]),
  );

  const kpiCards = [
    { id: "all", label: tList("filterAll"), value: stats.total },
    { id: "active", label: t("kpiActive"), value: stats.active },
    { id: "draft", label: t("kpiDraft"), value: stats.draft },
    { id: "archived", label: t("kpiArchived"), value: stats.archived },
  ];

  const handleStatusChange = async (
    id: Id<"products">,
    status: ProductStatus,
  ) => {
    setPendingId(id);
    try {
      await updateProduct({ id, status });
      toast.success(t("statusUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <FilterableKpiCards
        cards={kpiCards}
        activeId={statusFilter}
        onSelect={setStatusFilter}
        columnsClassName="grid-cols-2 sm:grid-cols-4"
      />
      <ListSearchInput
        value={searchInput}
        onChange={setSearchInput}
        placeholder={tList("searchProducts")}
      />
      <ProductsTable
        products={pagination.page}
        locale={locale}
        onStatusChange={handleStatusChange}
        onEdit={setEditingProduct}
        pendingId={pendingId}
        categoriesMap={categoriesMap}
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

      {/* Edit Dialog */}
      <AddProductDialog
        open={editingProduct !== null}
        product={editingProduct ?? undefined}
        onClose={() => setEditingProduct(null)}
        onCreated={() => setEditingProduct(null)}
      />
    </>
  );
}

// ─── Page Root ───────────────────────────────────────────────────────────────

export default function ProductsPageClient() {
  const t = useTranslations("productsPage");
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
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
          {t("addProduct")}
        </button>
      </div>

      {/* Add Product Dialog */}
      <AddProductDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => setDialogOpen(false)}
      />

      {/* Products List */}
      <ProductsErrorBoundary fallbackTitle={t("errorTitle")}>
        <ProductsQueryBody />
      </ProductsErrorBoundary>
    </div>
  );
}
