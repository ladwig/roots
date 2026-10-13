"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

// Report charts (shadcn chart = Recharts with the theme's --chart-* colors). Labels come translated from the page.

/** Bars per category; several series stack (e.g. per event: with ticket / members / guests). */
export function StackedBars({ data, series, height = 240 }: { data: Record<string, string | number>[]; series: { key: string; label: string }[]; height?: number }) {
  const config = Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: `var(--chart-${(i % 5) + 1})` }])) satisfies ChartConfig
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <BarChart data={data} margin={{ left: -16, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} stackId="a" fill={`var(--color-${s.key})`} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

/** One value per category, side by side (e.g. joined vs. left per month). */
export function GroupedBars({ data, series, height = 240 }: { data: Record<string, string | number>[]; series: { key: string; label: string }[]; height?: number }) {
  const config = Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: `var(--chart-${(i % 5) + 1})` }])) satisfies ChartConfig
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <BarChart data={data} margin={{ left: -16, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={4} />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
