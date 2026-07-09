"use client";

import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type DocumentSummaryStats = {
  count: number;
  totalValue: number;
  approvedCount: number;
  cancelledCount: number;
};

type DashboardDocumentSummaryCardProps = {
  title: string;
  description: string;
  icon: ReactNode;
  stats: DocumentSummaryStats;
  labels: {
    count: string;
    totalValue: string;
    approved: string;
    cancelled: string;
  };
  formatMoney: (value: number) => string;
  formatInt: (value: number) => string;
};

export function DashboardDocumentSummaryCard({
  title,
  description,
  icon,
  stats,
  labels,
  formatMoney,
  formatInt,
}: DashboardDocumentSummaryCardProps) {
  const items = [
    { label: labels.count, value: formatInt(stats.count) },
    { label: labels.totalValue, value: formatMoney(stats.totalValue) },
    { label: labels.approved, value: formatInt(stats.approvedCount) },
    { label: labels.cancelled, value: formatInt(stats.cancelledCount) },
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            {icon}
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <div
              key={item.label}
              className={cn(
                "border-border bg-muted/20 rounded-lg border px-3 py-2.5",
              )}
            >
              <dt className="text-muted-foreground text-xs">{item.label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
