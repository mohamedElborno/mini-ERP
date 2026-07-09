"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type DashboardSalesChartProps = {
  data: Array<{ date: string; sales: number }>;
  title: string;
  description: string;
  totalLabel: string;
  formattedTotal: string;
  locale: string;
  salesLegendLabel: string;
};

export function DashboardSalesChart({
  data,
  title,
  description,
  totalLabel,
  formattedTotal,
  locale,
  salesLegendLabel,
}: DashboardSalesChartProps) {
  const chartConfig = {
    sales: {
      label: salesLegendLabel,
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  return (
    <Card className="py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pt-4 pb-3 sm:py-6">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex flex-col justify-center gap-1 border-t px-6 py-4 text-left sm:border-t-0 sm:border-l sm:px-8 sm:py-6">
          <span className="text-muted-foreground text-xs">{totalLabel}</span>
          <span className="text-lg leading-none font-bold sm:text-3xl">
            {formattedTotal}
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <BarChart
            accessibilityLayer
            data={data}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(`${value}T12:00:00`);
                return date.toLocaleDateString(locale, {
                  month: "short",
                  day: "numeric",
                });
              }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="min-w-[140px]"
                  nameKey="sales"
                  labelFormatter={(value) => {
                    const date = new Date(`${value}T12:00:00`);
                    return date.toLocaleDateString(locale, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });
                  }}
                  formatter={(value) =>
                    typeof value === "number"
                      ? value.toLocaleString(locale, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })
                      : String(value)
                  }
                />
              }
            />
            <Bar
              dataKey="sales"
              name={salesLegendLabel}
              fill="var(--color-sales)"
              radius={4}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
