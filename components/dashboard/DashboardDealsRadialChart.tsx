"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
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

type DashboardDealsRadialChartProps = {
  won: number;
  lost: number;
};

export function DashboardDealsRadialChart({
  won,
  lost,
}: DashboardDealsRadialChartProps) {
  const t = useTranslations("dashboardHome");
  const locale = useLocale();
  const closed = won + lost;
  const winRate = closed > 0 ? Math.round((won / closed) * 1000) / 10 : null;

  const chartConfig = {
    won: {
      label: t("dealsRadialWon"),
      color: "var(--chart-1)",
    },
    lost: {
      label: t("dealsRadialLost"),
      color: "var(--chart-3)",
    },
  } satisfies ChartConfig;

  const chartData = [{ won, lost }];

  if (closed === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="items-center pb-0 text-center">
          <CardTitle>{t("dealsRadialTitle")}</CardTitle>
          <CardDescription>{t("dealsRadialDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center pb-6">
          <p className="text-muted-foreground text-center text-sm">
            {t("dealsRadialEmpty")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0 text-center">
        <CardTitle>{t("dealsRadialTitle")}</CardTitle>
        <CardDescription>{t("dealsRadialDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 items-center pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square w-full max-w-[260px]"
        >
          <RadialBarChart
            data={chartData}
            endAngle={180}
            innerRadius={80}
            outerRadius={112}
          >
            <RadialBar
              dataKey="won"
              stackId="a"
              cornerRadius={5}
              fill="var(--color-won)"
              className="stroke-transparent stroke-2"
            />
            <RadialBar
              dataKey="lost"
              stackId="a"
              cornerRadius={5}
              fill="var(--color-lost)"
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
                          y={cy - 16}
                          className="fill-foreground text-2xl font-bold"
                        >
                          {closed.toLocaleString(locale)}
                        </tspan>
                        <tspan
                          x={cx}
                          y={cy + 4}
                          className="fill-muted-foreground text-xs"
                        >
                          {t("dealsRadialCenterLabel")}
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2 text-sm">
        <div className="flex items-center justify-center gap-2 leading-none font-medium">
          {winRate !== null ? (
            <>
              <span>{t("dealsRadialWinRate", { rate: String(winRate) })}</span>
              {winRate >= 50 ? (
                <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <TrendingDown className="h-4 w-4 shrink-0" aria-hidden />
              )}
            </>
          ) : null}
        </div>
        <div className="text-muted-foreground text-center leading-none">
          {t("dealsRadialFooterHint")}
        </div>
      </CardFooter>
    </Card>
  );
}
