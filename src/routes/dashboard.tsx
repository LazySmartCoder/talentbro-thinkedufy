import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar as ChartBar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Building2, GraduationCap, TrendingUp } from "lucide-react";
import {
  getDrives,
  getInstitutionOverview,
  me,
  type DriveCompanyTier,
  type InstitutionOverview,
  type PlacementDrive,
} from "@/lib/api";
import { Shell } from "@/components/dash/Shell";
import { GateLoading } from "@/components/load-state";
import {
  Bar as MiniBar,
  Kpi,
  Panel,
  Pill,
  chartAxisProps,
  chartColors,
  chartCursor,
  chartTooltipProps,
} from "@/components/dash/bits";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — TalentBro Institutions" }],
  }),
  component: Overview,
});

const TIER_META: Record<DriveCompanyTier, { label: string; tone: "solid" | "outline" | "muted" }> =
  {
    super_dream: { label: "Super Dream", tone: "solid" },
    dream: { label: "Dream", tone: "outline" },
    core: { label: "Core", tone: "muted" },
    mass: { label: "Mass", tone: "muted" },
  };

function Overview() {
  const navigate = useNavigate();
  const [gate, setGate] = useState<"loading" | "allowed">("loading");
  const [overview, setOverview] = useState<InstitutionOverview | null>(null);
  const [drives, setDrives] = useState<PlacementDrive[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    me()
      .then((u) => {
        if (cancelled) return;
        if (u?.role === "student") {
          void navigate({ to: "/candidate-auth", search: { mode: "login" }, replace: true });
          return;
        }
        if (u?.role === "institution_staff" && u.profile_complete === false) {
          void navigate({ to: "/client-onboarding", replace: true });
          return;
        }
        setGate("allowed");
      })
      .catch(() => {
        if (!cancelled) setGate("allowed");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (gate !== "allowed") return;
    let cancelled = false;
    Promise.all([getInstitutionOverview(), getDrives()])
      .then(([ov, dr]) => {
        if (cancelled) return;
        setOverview(ov);
        setDrives(dr.drives);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the dashboard.");
      });
    return () => {
      cancelled = true;
    };
  }, [gate]);

  if (gate === "loading" || (overview === null && !error)) {
    return <GateLoading />;
  }

  if (error !== null || overview === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="panel max-w-md p-8 text-center">
          <p className="text-sm font-semibold">Dashboard unavailable</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "No institution linked to this account."}
          </p>
          <button
            onClick={() => {
              setError(null);
              setOverview(null);
              setDrives(null);
              setGate("loading");
              setTimeout(() => setGate("allowed"), 50);
            }}
            className="mt-5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const inst = overview.institution;
  const k = overview.kpis;
  const depts = overview.departments.map((d) => ({
    ...d,
    avgCtc: d.avg_expected_ctc,
  }));
  const rate = k.total_students ? Math.round((k.placed / k.total_students) * 100) : 0;
  const live = (drives ?? []).filter((d) => d.status !== "Completed");
  const upcoming = (drives ?? [])
    .filter((d) => d.status !== "Completed")
    .sort((a, b) => (a.campus_visit_date ?? "").localeCompare(b.campus_visit_date ?? ""))
    .slice(0, 5);
  const maxTier = Math.max(1, ...overview.tiers.map((t) => t.count));
  const funnelTotal = overview.funnel[0]?.value ?? 0;
  const funnelData = overview.funnel
    .filter((s) => s.stage !== "Total Students")
    .map((s) => {
      const pct = funnelTotal ? Math.round((s.value / funnelTotal) * 100) : 0;
      return {
        stage: s.stage,
        value: s.value,
        pct,
        label: `${s.value.toLocaleString("en-IN")} · ${pct}%`,
      };
    });

  return (
    <Shell
      title="Placement Overview"
      subtitle={`${inst.name} · ${inst.city ?? ""}${inst.state ? `, ${inst.state}` : ""} · Batch of ${overview.batch.year}`}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Total Students"
          value={k.total_students}
          hint={`${k.eligible_students} eligible (readiness 40+)`}
          icon={GraduationCap}
        />
        <Kpi
          label="Placement Rate"
          value={rate}
          suffix="%"
          hint={`${k.placed} placed · ${k.in_selection} in selection`}
          icon={TrendingUp}
        />
        <Kpi
          label="Average CGPA"
          value={k.avg_cgpa?.toFixed(2) ?? "—"}
          hint={`highest ${k.highest_cgpa?.toFixed(2) ?? "—"}`}
          icon={GraduationCap}
        />
        <Kpi
          label="Active Recruiters"
          value={k.recruiters}
          hint={`${k.active_drives} active drives · ${k.total_openings} openings`}
          icon={Building2}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Placement Momentum"
          description="Students onboarded per month"
        >
          <ResponsiveContainer width="100%" height={268}>
            <AreaChart data={overview.monthly} margin={{ left: -18, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColors.ink} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={chartColors.ink} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chartColors.grid} vertical={false} />
              <XAxis dataKey="month" {...chartAxisProps} />
              <YAxis {...chartAxisProps} />
              <Tooltip {...chartTooltipProps} cursor={{ stroke: chartColors.light }} />
              <Area
                type="monotone"
                dataKey="students"
                stroke={chartColors.ink}
                strokeWidth={2}
                fill="url(#ink)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Placement Funnel" description="NOTE: ELIGIBLE MEANS NOT PLACED">
          <ResponsiveContainer width="100%" height={210}>
            <BarChart
              data={funnelData}
              layout="vertical"
              margin={{ top: 2, right: 10, bottom: 0, left: 0 }}
            >
              <CartesianGrid stroke={chartColors.grid} horizontal={false} />
              <XAxis type="number" hide domain={[0, 100]} />
              <YAxis
                type="category"
                dataKey="stage"
                width={86}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                tick={{ fill: chartColors.axis }}
              />
              <Tooltip
                {...chartTooltipProps}
                cursor={chartCursor}
                formatter={(value) => [`${value}%`, "of students"]}
              />
              <ChartBar dataKey="pct" radius={[0, 4, 4, 0]} fill={chartColors.ink} barSize={20}>
                <LabelList
                  dataKey="label"
                  position="right"
                  fontSize={11}
                  fill={chartColors.label}
                />
              </ChartBar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Department Analytics"
          description="Placement rate and average expected CTC by branch"
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={depts} margin={{ left: -18, right: 6, top: 6 }}>
              <CartesianGrid stroke={chartColors.grid} vertical={false} />
              <XAxis dataKey="short" {...chartAxisProps} />
              <YAxis {...chartAxisProps} />
              <Tooltip {...chartTooltipProps} cursor={chartCursor} />
              <ChartBar dataKey="rate" name="Placement %" radius={[4, 4, 0, 0]}>
                {depts.map((d, i) => (
                  <Cell key={d.department} fill={i % 2 ? chartColors.mid : chartColors.ink} />
                ))}
              </ChartBar>
              <ChartBar
                dataKey="avgCtc"
                name="Avg Exp CTC (LPA)"
                fill={chartColors.light}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {depts.map((d) => (
              <div
                key={d.department}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{d.department}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {d.placed}/{d.total} placed · {d.eligible} eligible · ₹{d.avgCtc} LPA avg
                  </p>
                </div>
                <span className="stat-num text-sm">{d.rate}%</span>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Company Tiers" description="Recorded recruiter spread">
            <div className="space-y-3">
              {overview.tiers.map((t) => (
                <div key={t.tier}>
                  <div className="flex justify-between text-xs">
                    <span>{t.label}</span>
                    <span className="font-mono text-muted-foreground">{t.count} companies</span>
                  </div>
                  <div className="mt-1.5">
                    <MiniBar value={t.count} max={maxTier} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Active Drives"
          description={`${live.length} drives in progress or scheduled`}
          action={
            <Link to="/drives" className="text-xs font-medium underline underline-offset-4">
              View all
            </Link>
          }
          bodyClassName="p-0"
        >
          <div className="divide-y divide-border">
            {live.map((d) => (
              <div key={d.company_id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted font-display text-xs font-bold">
                  {d.company_name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {d.company_name} ·{" "}
                    <span className="text-muted-foreground">{d.role || d.industry}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {d.campus_visit_date ?? "Date TBD"} · {d.mode} · ₹{d.ctc_min ?? "—"}–
                    {d.ctc_max ?? "—"} LPA · {d.eligible_count} eligible
                  </p>
                </div>
                <div className="w-32">
                  <MiniBar
                    value={d.eligible_count}
                    max={Math.max(1, ...live.map((x) => x.eligible_count))}
                  />
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {d.eligible_count} eligible
                  </p>
                </div>
                <Pill tone={TIER_META[d.tier].tone}>{TIER_META[d.tier].label}</Pill>
              </div>
            ))}
            {live.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                No drives are scheduled yet. Add companies on the Companies page.
              </p>
            )}
          </div>
        </Panel>

        <Panel title="Next Campus Visits" description="Soonest dates first" bodyClassName="p-0">
          <ul className="divide-y divide-border">
            {upcoming.map((d) => (
              <li key={d.company_id} className="flex gap-3 px-5 py-3.5">
                <div className="grid w-16 shrink-0 place-items-center rounded-md border border-border px-1 py-1 text-center">
                  <p className="font-mono text-[9px] uppercase text-muted-foreground">
                    {d.campus_visit_date
                      ? new Date(d.campus_visit_date).toLocaleDateString("en-IN", {
                          month: "short",
                        })
                      : "TBD"}
                  </p>
                  <p className="stat-num text-sm">
                    {d.campus_visit_date ? new Date(d.campus_visit_date).getDate() : "At"}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.company_name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {d.location ?? "—"} · {d.openings ?? "—"} openings · {d.eligible_count} eligible
                  </p>
                </div>
                <Pill tone={TIER_META[d.tier].tone}>{TIER_META[d.tier].label}</Pill>
              </li>
            ))}
            {upcoming.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-muted-foreground">
                No visits scheduled.
              </li>
            )}
          </ul>
        </Panel>
      </div>
    </Shell>
  );
}
