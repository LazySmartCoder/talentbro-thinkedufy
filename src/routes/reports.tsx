import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/dash/Shell";
import {
  Bar,
  Kpi,
  Panel,
  chartAxisProps,
  chartColors,
  chartCursor,
  chartTooltipProps,
} from "@/components/dash/bits";
import { getReportsData, type ReportsData } from "@/lib/api";
import { randomMotivationQuote } from "@/lib/quotes";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — TalentBro Placement Analytics" },
      {
        name: "description",
        content:
          "Live placement analytics computed from the institution's recorded students and companies.",
      },
      { property: "og:title", content: "Reports — TalentBro" },
      {
        property: "og:description",
        content: "Live placement analytics — students, drives, eligibility and CTC bands.",
      },
    ],
  }),
  component: ReportsPage,
});

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// One flat sheet: a KPI block, the department table, then the tier, industry and
// CTC breakdowns. Excel opens the blank line between blocks as a table break.
function buildReportCsv(data: ReportsData) {
  const lines: string[] = ["Metric,Value", `Students covered,${data.kpis.students}`];
  lines.push(`Placement rate (%),${data.kpis.rate}`);
  lines.push(`Placed,${data.kpis.placed}`);
  lines.push(`Eligible (readiness 40+),${data.kpis.eligible}`);
  lines.push(`Average expected CTC (LPA),${data.kpis.avg_expected_ctc ?? ""}`);
  lines.push(`Recruiters,${data.kpis.recruiters}`);
  lines.push(`Openings,${data.kpis.openings}`);
  lines.push(`Batch year,${data.batch.year}`);
  lines.push("");
  lines.push(
    "Department,Students,Eligible (readiness 40+),Placed,Rate (%),Avg CGPA,Avg expected CTC (LPA)",
  );
  for (const d of data.depts) {
    lines.push(
      [d.department, d.total, d.eligible, d.placed, d.rate, d.avg_cgpa, d.avg_expected_ctc]
        .map(csvCell)
        .join(","),
    );
  }
  lines.push("");
  lines.push("Hiring tier,Companies");
  for (const t of data.tiers) lines.push(`${csvCell(t.label)},${t.count}`);
  lines.push("");
  lines.push("Industry,Companies");
  for (const i of data.industries) lines.push(`${csvCell(i.industry)},${i.count}`);
  lines.push("");
  lines.push("CTC band,Companies");
  for (const b of data.ctc_bands) lines.push(`${csvCell(b.band)},${b.companies}`);
  return lines.join("\n");
}

function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingQuote] = useState(randomMotivationQuote);

  useEffect(() => {
    let cancelled = false;
    getReportsData()
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load reports.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (data === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <span className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
          {error ?? loadingQuote}
        </span>
      </div>
    );
  }

  const k = data.kpis;
  const totalIndustry = Math.max(
    1,
    data.industries.reduce((a, i) => a + i.count, 0),
  );
  const maxTier = Math.max(1, ...data.tiers.map((t) => t.count));
  const maxBand = Math.max(1, ...data.ctc_bands.map((b) => b.companies));

  function exportCsv() {
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${buildReportCsv(data!)}`], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `talentbro-placement-report-${data!.batch.year}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Placement report downloaded");
  }

  return (
    <Shell
      title="Reports"
      subtitle="Live placement analytics computed from the recorded students and companies"
      actions={
        <>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-xs font-medium hover:bg-accent"
          >
            <Printer className="size-3.5" /> Print
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Download className="size-3.5" /> Export CSV
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Students Covered" value={k.students} hint={`batch of ${data.batch.year}`} />
        <Kpi
          label="Placement Rate"
          value={k.rate}
          suffix="%"
          hint={`${k.placed} placed · ${k.eligible} eligible (readiness 40+)`}
        />
        <Kpi
          label="Avg Expected CTC"
          value={k.avg_expected_ctc?.toFixed(1) ?? "—"}
          suffix="LPA"
          hint="students' stated expectations"
        />
        <Kpi label="Recruiters" value={k.recruiters} hint={`${k.openings} openings recorded`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Students Onboarded"
          description="Profiles added to the platform each month"
        >
          <ResponsiveContainer width="100%" height={252}>
            <LineChart data={data.monthly} margin={{ left: -18, right: 6, top: 6 }}>
              <CartesianGrid stroke={chartColors.grid} vertical={false} />
              <XAxis dataKey="month" {...chartAxisProps} />
              <YAxis {...chartAxisProps} />
              <Tooltip {...chartTooltipProps} cursor={chartCursor} />
              <Line
                type="monotone"
                dataKey="students"
                stroke={chartColors.ink}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Company Tiers" description="Recorded recruiters by tier">
          <div className="space-y-3">
            {data.tiers.map((t) => (
              <div key={t.tier}>
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{t.label}</span>
                  <span className="font-mono text-muted-foreground">{t.count} companies</span>
                </div>
                <div className="mt-1.5">
                  <Bar value={t.count} max={maxTier} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Department Summary"
        description="Placement performance by branch"
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {[
                  "Department",
                  "Students",
                  "Eligible",
                  "Placed",
                  "Rate",
                  "Avg CGPA",
                  "Avg Exp CTC",
                ].map((h) => (
                  <th key={h} className="mono-label px-5 py-3 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.depts.map((d) => (
                <tr key={d.department} className="hover:bg-muted/60">
                  <td className="px-5 py-3 font-medium">{d.department}</td>
                  <td className="px-5 py-3 font-mono">{d.total}</td>
                  <td className="px-5 py-3 font-mono">{d.eligible}</td>
                  <td className="px-5 py-3 font-mono">{d.placed}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20">
                        <Bar value={d.rate} />
                      </div>
                      <span className="font-mono text-xs">{d.rate}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono">{d.avg_cgpa.toFixed(2)}</td>
                  <td className="px-5 py-3 font-mono">₹{d.avg_expected_ctc} LPA</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Industry Breakdown"
          description="Recruiters recorded by industry"
        >
          <div className="space-y-3.5">
            {data.industries.map((i) => (
              <div key={i.industry}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium">{i.industry}</span>
                  <span className="font-mono text-muted-foreground">
                    {i.count > 1 ? `${i.count} companies` : `${i.count} company`} ·{" "}
                    {Math.round((i.count / totalIndustry) * 100)}%
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar value={i.count} max={totalIndustry} />
                </div>
              </div>
            ))}
            {data.industries.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No companies recorded yet.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="CTC Bands" description="Companies by advertised CTC">
          <div className="space-y-3">
            {data.ctc_bands.map((b) => (
              <div key={b.band}>
                <div className="flex justify-between text-xs">
                  <span>{b.band}</span>
                  <span className="font-mono text-muted-foreground">
                    {b.companies > 1 ? `${b.companies} companies` : `${b.companies} company`}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar value={b.companies} max={maxBand} />
                </div>
              </div>
            ))}
            {data.ctc_bands.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No salary data recorded.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </Shell>
  );
}
