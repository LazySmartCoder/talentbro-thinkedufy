import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  description,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("dash-panel", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  suffix,
  delta,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  delta?: number;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="dash-panel p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <p className="dash-mono-label">{label}</p>
        {Icon && <Icon className="size-4 text-muted-foreground" />}
      </div>
      <p className="dash-stat-num mt-3 text-3xl">
        {value}
        {suffix && <span className="ml-1 text-base text-muted-foreground">{suffix}</span>}
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono font-medium",
              up ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta)}%
          </span>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "solid" | "muted" | "outline";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        tone === "solid" && "bg-primary text-primary-foreground",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "outline" && "border border-border text-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function Bar({ value, max = 100 }: { value: number; max?: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      />
    </div>
  );
}

/*
 * Chart ink.
 *
 * These are CSS variables rather than colours so a chart follows the theme:
 * recharts writes whatever it is given straight onto an SVG `fill`/`stroke`,
 * and `var()` resolves there, so flipping `.dark` re-inks every chart with no
 * prop needing to know a theme exists. The light/dark values live in
 * `styles.css` next to the rest of the palette.
 */
export const chartColors = {
  ink: "var(--chart-ink)",
  mid: "var(--chart-mid)",
  light: "var(--chart-light)",
  faint: "var(--chart-faint)",
  grid: "var(--chart-grid)",
  // Axis ticks and the value labels drawn on top of a bar. These were the
  // hardcoded dark greys that disappeared against a dark card.
  axis: "var(--chart-axis)",
  label: "var(--chart-label)",
};

// Every dashboard chart shares one tooltip look and one ink→light ramp so a bar
// in the students table and a bar in the placement-cell funnel read as the same
// system. `chartFill(index)` walks the ramp for a categorical series.
//
// Recharts' default tooltip content is where dark-mode text goes missing, and
// it takes three separate props to fix. Spread {@link chartTooltipProps} onto
// the `<Tooltip>` rather than passing `contentStyle` on its own.
//
// The non-obvious one is `itemStyle`. Recharts paints each item row with the
// *series* colour (`entry.color`, i.e. the bar's own fill) as an inline style on
// that row — so a light bar colour renders as washed-out text on the dark
// surface, and it beats the wrapper's `color` because it is set on the row
// itself. `labelStyle` has the same problem on the bold header line.
export const chartTooltip = {
  borderRadius: 8,
  border: "1px solid var(--chart-surface-border)",
  // Recharts hardcodes `backgroundColor: '#fff'` as its own default and only
  // lets `contentStyle` override it, so this has to be `backgroundColor` rather
  // than the `background` shorthand to actually replace it.
  backgroundColor: "var(--chart-surface)",
  color: "var(--chart-surface-fg)",
  fontSize: 12,
  fontFamily: "inherit",
} as const;

export const chartTooltipLabel = { color: "var(--chart-surface-fg)", fontWeight: 600 } as const;

export const chartTooltipItem = { color: "var(--chart-surface-fg)" } as const;

/**
 * The whole tooltip appearance as one spreadable object:
 * `<Tooltip {...chartTooltipProps} cursor={chartCursor} />`.
 */
export const chartTooltipProps = {
  contentStyle: chartTooltip,
  labelStyle: chartTooltipLabel,
  itemStyle: chartTooltipItem,
} as const;

export const chartCursor = { fill: "var(--chart-cursor)" } as const;

export const chartRamp = [chartColors.ink, chartColors.mid, chartColors.light, chartColors.faint];

export function chartFill(index: number): string {
  return chartRamp[index % chartRamp.length] ?? chartColors.ink;
}

/**
 * Axis props for a chart that has no custom axis rendering.
 *
 * Recharts' own default tick colour is a mid grey chosen for a white chart
 * background, which is why ticks were hard to read in dark mode. Pair it with
 * {@link chartTooltip} and a chart is legible in both themes.
 */
export const chartAxisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: chartColors.axis, fontSize: 11 },
} as const;
