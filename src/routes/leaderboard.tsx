import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Award,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Medal,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppNavHeader, AppNavIconButton } from "@/components/tb/app-nav";
import { getReadinessLeaderboard, me, type LeaderboardResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { GateError, GateLoading } from "@/components/load-state";
import { chartAxisProps, chartColors, chartRamp, chartTooltipProps } from "@/components/dash/bits";

const title = "Leaderboard | TalentBro";
const description = "Where you stand against your college.";
const PAGE_SIZE = 20;

const SELF_TRAINING_MODULES = [
  { key: "aplr", label: "Aptitude & Logical Reasoning" },
  { key: "basic_math", label: "Mathematics" },
  { key: "situational", label: "Situational Problem Solving Skills (Management)" },
  { key: "technical", label: "Problem Solving Skills (Technical)" },
  { key: "dsa", label: "DSA (Data Structure & Algorithms)" },
  { key: "communication", label: "Communication Skills" },
  { key: "english", label: "English Trainer" },
  { key: "gd", label: "Group Discussion" },
];

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LeaderboardPage,
});

function rankTone(rank: number): { icon: typeof Trophy; cls: string } {
  if (rank === 1) return { icon: Trophy, cls: "bg-amber-400 text-amber-950" };
  if (rank === 2) return { icon: Medal, cls: "bg-slate-300 text-slate-900" };
  if (rank === 3) return { icon: Medal, cls: "bg-orange-300 text-orange-950" };
  return { icon: Award, cls: "bg-muted text-muted-foreground" };
}

function wrapLabel(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    return [
      `${lines
        .slice(0, maxLines)
        .join(" ")
        .slice(0, maxChars * 2 + 3)
        .trimEnd()}…`,
    ];
  }
  return lines;
}

function RadarTick({
  x = 0,
  y = 0,
  textAnchor = "middle",
  payload,
}: {
  x?: number;
  y?: number;
  textAnchor?: "inherit" | "start" | "end" | "middle";
  payload?: { value?: string };
}) {
  const lines = wrapLabel(payload?.value ?? "", 16, 2);
  const blockOffset = -(lines.length - 1) * 4.5;
  return (
    <text x={x} y={y} dy={blockOffset} fill="currentColor" fontSize={8.5} textAnchor={textAnchor}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 8.5} dominantBaseline="central">
          {line}
        </tspan>
      ))}
    </text>
  );
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) {
    return (
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted font-mono text-[11px] font-semibold text-muted-foreground">
        —
      </span>
    );
  }
  const { icon: Icon, cls } = rankTone(rank);
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold",
        cls,
      )}
      title={`#${rank}`}
    >
      <Icon className="size-4" />
    </span>
  );
}

function ScoreBar({ value, color = "bg-emerald-500" }: { value: number | null; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all duration-500", color)}
        style={{ width: `${value != null ? Math.max(0, Math.min(100, value)) : 0}%` }}
      />
    </div>
  );
}

type PageKey = number | "…";

function pageNumbers(current: number, count: number): PageKey[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out: PageKey[] = [1];
  if (current > 3) out.push("…");
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);
  for (let i = start; i <= end; i++) out.push(i);
  if (current < count - 2) out.push("…");
  out.push(count);
  return out;
}

function PageNav({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  const navBtn =
    "grid size-8 cursor-pointer place-items-center rounded-md border border-border text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className={navBtn}
      >
        <ChevronLeft className="size-4" />
      </button>
      {pageNumbers(page, pageCount).map((key, i) =>
        key === "…" ? (
          <span
            key={`gap-${i}`}
            className="grid size-8 place-items-center text-xs text-muted-foreground"
          >
            …
          </span>
        ) : (
          <button
            key={key}
            type="button"
            aria-current={key === page ? "page" : undefined}
            onClick={() => onPage(key)}
            className={cn(
              "grid min-w-8 cursor-pointer place-items-center rounded-md px-2 py-0 text-xs font-medium tabular-nums transition-colors",
              key === page
                ? "bg-foreground text-background"
                : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {key}
          </button>
        ),
      )}
      <button
        type="button"
        aria-label="Next page"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
        className={navBtn}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

function LeaderboardPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [deptFilter, setDeptFilter] = useState<string>("All");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await me();
        if (cancelled) return;
        if (!current) {
          void navigate({ to: "/candidate-auth", search: { mode: "login" }, replace: true });
          return;
        }
        const board = await getReadinessLeaderboard();
        if (cancelled) return;
        setData(board);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : null);
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const distribution = useMemo(() => {
    const buckets = [
      { key: "0–19", label: "0–19", min: 0, max: 19, count: 0, color: chartRamp[0] },
      { key: "20–39", label: "20–39", min: 20, max: 39, count: 0, color: chartRamp[1] },
      { key: "40–59", label: "40–59", min: 40, max: 59, count: 0, color: chartRamp[2] },
      { key: "60–79", label: "60–79", min: 60, max: 79, count: 0, color: chartRamp[3] },
      { key: "80–100", label: "80–100", min: 80, max: 100, count: 0, color: chartRamp[0] },
    ];
    for (const s of data?.students ?? []) {
      const score = s.performance_score;
      if (score == null) continue;
      const bucket = buckets.find((b) => score >= b.min && score <= b.max);
      if (bucket) bucket.count += 1;
    }
    return buckets;
  }, [data]);

  const skillRadar = useMemo(() => {
    const modules = new Map<string, { label: string; sum: number; count: number }>();
    for (const mod of SELF_TRAINING_MODULES) {
      modules.set(mod.key, { label: mod.label, sum: 0, count: 0 });
    }
    for (const s of data?.students ?? []) {
      const perf = s.performance;
      if (!perf) continue;
      for (const m of perf.modules ?? []) {
        const row = modules.get(m.key);
        if (!row) continue;
        row.sum += m.score;
        row.count += 1;
      }
    }
    return Array.from(modules.values()).map((row) => ({
      axis: row.label,
      score: row.count > 0 ? Math.round((row.sum / row.count) * 10) / 10 : 0,
      students: row.count,
    }));
  }, [data]);

  const departments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of data?.students ?? []) {
      const dept = s.department || "Unknown";
      counts.set(dept, (counts.get(dept) ?? 0) + 1);
    }
    return Array.from(counts.keys()).sort();
  }, [data]);

  const visible = useMemo(() => {
    const rows =
      deptFilter === "All"
        ? (data?.students ?? [])
        : (data?.students ?? []).filter((s) => (s.department || "Unknown") === deptFilter);
    return rows.filter((s) => s.overall_rank != null || true);
  }, [data, deptFilter]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const paged = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageFrom = visible.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageTo = Math.min(currentPage * PAGE_SIZE, visible.length);

  if (status === "loading") return <GateLoading />;
  if (status === "error")
    return (
      <GateError message={errorMessage} onRetry={() => void navigate({ to: "/leaderboard" })} />
    );

  return (
    <>
      <div className="flex min-h-screen flex-col bg-background">
        <AppNavHeader
          left={
            <div className="flex items-center gap-2.5">
              <AppNavIconButton label="Back to chat" onClick={() => void navigate({ to: "/chat" })}>
                <ArrowLeft className="size-4" />
              </AppNavIconButton>
              <span className="grid size-9 place-items-center rounded-lg bg-foreground text-background">
                <LayoutGrid className="size-4" />
              </span>
              <span>
                <p className="text-sm font-semibold leading-tight">College Leaderboard</p>
              </span>
            </div>
          }
        />

        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
          <header>
            <div>
              <p className="dash-mono-label uppercase tracking-wider text-muted-foreground">
                {data?.institution || "Your college"}
              </p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
                Placement Readiness Board
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {data?.total ?? 0} students in the roll · {data?.ranked ?? 0} actively training. The
                AIR denominator counts the whole college.
              </p>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-6 py-4 text-center shadow-sm">
                <Users className="size-4 text-muted-foreground" />
                <div>
                  <p className="dash-mono-label">Total</p>
                  <p className="font-display text-lg font-bold tabular-nums">{data?.total}</p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-6 py-4 text-center shadow-sm">
                <TrendingUp className="size-4 text-muted-foreground" />
                <div>
                  <p className="dash-mono-label">Active</p>
                  <p className="font-display text-lg font-bold tabular-nums">{data?.ranked}</p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-6 py-4 text-center shadow-sm">
                <LayoutGrid className="size-4 text-muted-foreground" />
                <div>
                  <p className="dash-mono-label">Departments</p>
                  <p className="font-display text-lg font-bold tabular-nums">
                    {data
                      ? new Set((data.students ?? []).map((s) => s.department || "Unknown")).size
                      : 0}
                  </p>
                </div>
              </div>
            </div>
          </header>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="dash-panel">
              <header className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="text-[15px] font-semibold">Score distribution</h2>
                <span className="text-xs text-muted-foreground">how your college is spread</span>
              </header>
              <div className="p-4">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={distribution} margin={{ left: -14, right: 8, top: 8 }}>
                    <CartesianGrid stroke={chartColors.grid} vertical={false} />
                    <XAxis dataKey="label" {...chartAxisProps} />
                    <YAxis {...chartAxisProps} allowDecimals={false} />
                    <Tooltip
                      {...chartTooltipProps}
                      cursor={{ stroke: chartColors.axis, strokeDasharray: 4 }}
                      formatter={(value: number | string | Array<number | string>) => [
                        `${value} student${Number(value) === 1 ? "" : "s"}`,
                        "Score band",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Students"
                      stroke="oklch(0.62 0.19 160)"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "oklch(0.62 0.19 160)", strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="dash-panel">
              <header className="flex items-center justify-between border-b border-border px-5 py-4">
                <h2 className="text-[15px] font-semibold">Skill radar</h2>
                <span className="text-xs text-muted-foreground">college averages</span>
              </header>
              <div className="p-4">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={skillRadar} outerRadius="72%">
                      <PolarGrid stroke="currentColor" strokeOpacity={0.15} />
                      <PolarAngleAxis dataKey="axis" tick={<RadarTick />} />
                      <PolarRadiusAxis
                        domain={[0, 100]}
                        tickCount={5}
                        tick={{ fontSize: 9, fill: "currentColor", opacity: 0.4 }}
                      />
                      <Tooltip
                        {...chartTooltipProps}
                        formatter={(value: number | string | Array<number | string>) => [
                          `${Number(value).toFixed(1)}/100`,
                          "College avg",
                        ]}
                      />
                      <Radar
                        dataKey="score"
                        stroke="oklch(0.62 0.19 160)"
                        fill="oklch(0.62 0.19 160)"
                        fillOpacity={0.35}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <div className="lg:col-span-2">
              <SectionTiles data={data} />
            </div>
          </div>

          <section className="dash-panel mt-4">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold">Class standings</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  click any student for their breakdown &amp; graphs
                </p>
              </div>
              <select
                value={deptFilter}
                onChange={(e) => {
                  setDeptFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 cursor-pointer rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="All">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </header>

            <ul className="divide-y divide-border">
              {paged.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({
                        to: "/student-detail/$studentId",
                        params: { studentId: s.id },
                      })
                    }
                    className={cn(
                      "grid w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted sm:grid-cols-[32px_minmax(0,1fr)_140px_180px_72px] sm:px-5",
                      s.is_self && "bg-primary/[0.04] hover:bg-primary/[0.07]",
                    )}
                  >
                    <RankBadge rank={s.overall_rank} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {s.full_name || "Student"}
                        {s.is_self && (
                          <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                            YOU
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.department || "No department"}
                        {s.cgpa != null && ` · CGPA ${s.cgpa}`}
                      </p>
                      {/* Headline, so the board reads as people rather than rows. */}
                      {s.bio && (
                        <p
                          className="truncate text-[11px] font-semibold text-muted-foreground/90"
                          title={s.bio}
                        >
                          {s.bio}
                        </p>
                      )}
                    </div>
                    <div className="hidden text-xs text-muted-foreground sm:block">
                      {s.overall_rank != null
                        ? `AIR #${s.overall_rank} of ${s.overall_total}`
                        : "Not ranked yet"}
                      <p className="mt-0.5">
                        {s.department_rank != null
                          ? `Dept #${s.department_rank} of ${s.department_total}`
                          : "No dept rank"}
                      </p>
                    </div>
                    <div className="hidden sm:block">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground">Readiness</span>
                        <span className="font-mono text-xs font-semibold tabular-nums">
                          {s.performance_score != null ? s.performance_score.toFixed(1) : "—"}
                        </span>
                      </div>
                      <ScoreBar value={s.performance_score} />
                    </div>
                    <div className="hidden text-right text-[11px] font-medium text-primary sm:block">
                      View →
                    </div>
                  </button>
                </li>
              ))}
              {visible.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No students in this department yet.
                </li>
              )}
            </ul>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-5 py-4 sm:flex-row">
              <p className="text-xs text-muted-foreground">
                {visible.length === 0
                  ? "0 students"
                  : `Showing ${pageFrom}–${pageTo} of ${visible.length} student${
                      visible.length === 1 ? "" : "s"
                    }`}
              </p>
              {pageCount > 1 && (
                <PageNav page={currentPage} pageCount={pageCount} onPage={setPage} />
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function SectionTiles({ data }: { data: LeaderboardResponse | null }) {
  const self = data?.students.find((s) => s.is_self);
  return (
    <div className="grid gap-4">
      {!self?.overall_rank && (
        <div className="dash-panel p-4">
          <p className="text-xs text-muted-foreground">
            You don&apos;t have a readiness score yet. Start a mock interview, a skill module, or
            chat with TalentBro to get ranked on this board.
          </p>
          <button
            type="button"
            className="mt-3 cursor-pointer rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={() => {
              // navigated via URL
            }}
          >
            Start training
          </button>
        </div>
      )}
    </div>
  );
}
