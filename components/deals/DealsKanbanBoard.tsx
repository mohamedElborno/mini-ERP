"use client";

import { useMemo } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useLocale, useTranslations } from "next-intl";
import { IconGripVertical } from "@tabler/icons-react";
import { Link } from "@/i18n/navigation";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type DealStage = NonNullable<Doc<"deals">["stage"]>;

export type EnrichedDeal = Doc<"deals"> & {
  contactName: string;
  companyName: string | null;
  currencySymbol?: string | null;
  valueInDefault?: number;
};

const STAGES: DealStage[] = ["lead", "contacted", "negotiation", "won", "lost"];

const DRAG_PREFIX = "deal-" as const;
const DROP_PREFIX = "stage-" as const;

export const dragId = (id: Id<"deals">) => `${DRAG_PREFIX}${id}`;
const parseDragId = (s: string | number): Id<"deals"> | null => {
  const str = String(s);
  if (!str.startsWith(DRAG_PREFIX)) return null;
  return str.slice(DRAG_PREFIX.length) as Id<"deals">;
};

export const dropId = (stage: DealStage) => `${DROP_PREFIX}${stage}`;
const parseDropId = (s: string | number): DealStage | null => {
  const str = String(s);
  if (!str.startsWith(DROP_PREFIX)) return null;
  const st = str.slice(DROP_PREFIX.length) as DealStage;
  return STAGES.includes(st) ? st : null;
};

function stageHeaderClass(stage: DealStage) {
  switch (stage) {
    case "won":
      return "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/20";
    case "lost":
      return "bg-destructive/10 text-destructive border-destructive/20";
    case "negotiation":
      return "bg-amber-500/10 text-amber-900 dark:text-amber-200 border-amber-500/20";
    case "contacted":
      return "bg-sky-500/10 text-sky-900 dark:text-sky-200 border-sky-500/20";
    case "lead":
    default:
      return "bg-muted/80 text-foreground border-border";
  }
}

function KanbanColumn({
  stage,
  count,
  children,
}: {
  stage: DealStage;
  count: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("dealsPage");
  const { setNodeRef, isOver } = useDroppable({ id: dropId(stage) });

  return (
    <div
      className="border-border bg-muted/20 flex w-[min(100%,18rem)] shrink-0 flex-col rounded-t-2xl border"
      data-stage={stage}
    >
      <div
        className={cn(
          "shrink-0 border-b px-3 py-2.5 text-sm font-semibold rounded-t-md",
          stageHeaderClass(stage),
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span>{t(`stage.${stage}`)}</span>
          <span className="text-muted-foreground bg-background/50 rounded-md px-1.5 text-xs font-medium tabular-nums">
            {count}
          </span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-48 flex-1 flex-col gap-2 p-2 transition-colors",
          isOver && "bg-primary/5 ring-primary/30 ring-2 ring-inset",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function DealKanbanCard({
  deal,
  disabled,
  locale,
}: {
  deal: EnrichedDeal;
  disabled: boolean;
  locale: string;
}) {
  const t = useTranslations("dealsPage");
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: dragId(deal._id),
      disabled,
    });

  const style = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
  };

  const moneyFmt = (n: number | undefined) =>
    n == null
      ? "—"
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-border bg-card group shadow-sm transition-[opacity,box-shadow] rounded-xl border p-2.5",
        isDragging && "z-20 scale-[1.01] cursor-grabbing opacity-90 shadow-md",
        !isDragging && "hover:border-primary/20 hover:shadow",
      )}
    >
      <div className="flex gap-1.5">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground -ms-0.5 mt-0.5 shrink-0 touch-none rounded p-0.5"
          title={t("kanbanDragHandle")}
          aria-label={t("kanbanDragHandle")}
          disabled={disabled}
          {...listeners}
          {...attributes}
        >
          <IconGripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <Link
            href={`/deals/${deal._id}`}
            className="text-foreground group-hover:text-primary line-clamp-2 text-sm font-medium leading-tight"
          >
            {deal.title}
          </Link>
          <p className="text-muted-foreground line-clamp-1 text-xs">
            {deal.contactName}
            {deal.companyName ? ` · ${deal.companyName}` : ""}
          </p>
          <div className="text-foreground/90 flex flex-wrap items-baseline justify-between gap-1 text-xs">
            <span className="text-muted-foreground font-medium">
              {t("colValue")}:
            </span>
            <span className="font-semibold tabular-nums">
              {deal.value != null
                ? `${deal.currencySymbol ? `${deal.currencySymbol} ` : ""}${moneyFmt(deal.value)}`
                : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

type Props = {
  deals: EnrichedDeal[];
  onStageChange: (id: Id<"deals">, stage: DealStage) => void;
  pendingId: Id<"deals"> | null;
};

export function DealsKanbanBoard({ deals, onStageChange, pendingId }: Props) {
  const t = useTranslations("dealsPage");
  const locale = useLocale();

  const byStage = useMemo(() => {
    const m = new Map<DealStage, EnrichedDeal[]>();
    for (const s of STAGES) m.set(s, []);
    for (const d of deals) {
      const st = d.stage ?? "lead";
      const list = m.get(st);
      if (list) list.push(d);
    }
    return m;
  }, [deals]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const dealId = parseDragId(active.id);
    if (!dealId) return;

    let newStage = parseDropId(over.id);
    if (!newStage) {
      const otherId = parseDragId(over.id);
      if (otherId) {
        const other = deals.find((d) => d._id === otherId);
        newStage = other?.stage ?? "lead";
      }
    }
    if (!newStage) return;

    const current = deals.find((d) => d._id === dealId);
    if (current && (current.stage ?? "lead") === newStage) return;

    onStageChange(dealId, newStage);
  };

  if (deals.length === 0) {
    return (
      <div className="border-border bg-card/40 text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
        {t("empty")}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={onDragEnd}
    >
      <div
        className="overflow-x-auto pb-1"
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <div className="flex min-h-[min(70vh,42rem)] gap-3 p-1">
          {STAGES.map((stage) => {
            const colDeals = byStage.get(stage) ?? [];
            return (
              <KanbanColumn key={stage} stage={stage} count={colDeals.length}>
                {colDeals.map((deal) => (
                  <DealKanbanCard
                    key={deal._id}
                    deal={deal}
                    disabled={pendingId === deal._id}
                    locale={locale}
                  />
                ))}
              </KanbanColumn>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}
