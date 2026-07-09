"use client";

import { useLocale, useTranslations } from "next-intl";
import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type CreditSummary = {
  totalLimit: number;
  totalUsed: number;
  totalRemaining: number;
};

type DashboardCreditRadialCardProps = {
  summary: CreditSummary;
};

export function DashboardCreditRadialCard({
  summary,
}: DashboardCreditRadialCardProps) {
  const t = useTranslations("dashboardHome");
  const locale = useLocale();

  const fmtMoney = (v: number) =>
    v.toLocaleString(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  const { totalLimit, totalUsed, totalRemaining } = summary;
  const hasCredit = totalLimit > 0 || totalUsed > 0;

  const chartConfig = {
    used: {
      label: t("creditTotalUsed"),
      color: "var(--chart-1)",
    },
    remaining: {
      label: t("creditTotalRemaining"),
      color: "var(--chart-2)",
    },
  } satisfies ChartConfig;

  const chartData = [{ used: totalUsed, remaining: totalRemaining }];
  const usageRate =
    totalLimit > 0
      ? Math.round((totalUsed / totalLimit) * 1000) / 10
      : null;

  const statRows = [
    { label: t("creditTotalLimit"), value: fmtMoney(totalLimit) },
    { label: t("creditTotalUsed"), value: fmtMoney(totalUsed) },
    {
      label: t("creditTotalRemaining"),
      value: fmtMoney(totalRemaining),
      emphasize: true,
    },
  ];

  if (!hasCredit) {
    return (
      <Card className="flex h-full flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("creditSummaryTitle")}</CardTitle>
          <CardDescription>{t("creditSummaryDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center pb-6">
          <p className="text-muted-foreground text-center text-sm">
            {t("creditRadialEmpty")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("creditSummaryTitle")}</CardTitle>
        <CardDescription>{t("creditSummaryDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 pb-2 sm:flex-row sm:items-center">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square w-full max-w-[220px] shrink-0"
        >
          <RadialBarChart
            data={chartData}
            endAngle={180}
            innerRadius={68}
            outerRadius={98}
          >
            <RadialBar
              dataKey="used"
              stackId="a"
              cornerRadius={5}
              fill="var(--color-used)"
              className="stroke-transparent stroke-2"
            />
            <RadialBar
              dataKey="remaining"
              stackId="a"
              cornerRadius={5}
              fill="var(--color-remaining)"
              className="stroke-transparent stroke-2"
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    const cx = viewBox.cx ?? 0;
                    const cy = viewBox.cy ?? 0;
                    return (
                      <text x={cx} y={cy} textAnchor="middle">
                        <tspan
                          x={cx}
                          y={cy - 14}
                          className="fill-foreground text-lg font-bold"
                        >
                          {fmtMoney(totalLimit)}
                        </tspan>
                        <tspan
                          x={cx}
                          y={cy + 4}
                          className="fill-muted-foreground text-[11px]"
                        >
                          {t("creditRadialCenterLabel")}
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>

        <dl className="grid flex-1 gap-2 sm:min-w-[140px]">
          {statRows.map((row) => (
            <div
              key={row.label}
              className="border-border bg-muted/20 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
            >
              <dt className="text-muted-foreground text-xs">{row.label}</dt>
              <dd
                className={
                  row.emphasize
                    ? "text-base font-semibold tabular-nums"
                    : "text-sm font-medium tabular-nums"
                }
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
      <CardFooter className="text-muted-foreground justify-center pt-0 text-center text-sm">
        {usageRate !== null
          ? t("creditRadialUsageRate", { rate: String(usageRate) })
          : t("creditRadialFooterHint")}
      </CardFooter>
    </Card>
  );
}
