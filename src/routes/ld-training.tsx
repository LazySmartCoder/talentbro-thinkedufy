import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, CalendarPlus, Clock, Loader2, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Bar as ChartBar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
import { Shell } from "@/components/dash/Shell";
import { ClassroomSessionDialog } from "@/components/dash/ClassroomSessionDialog";
import { PillarStudentsDialog, type PillarStudent } from "@/components/dash/PillarStudentsDialog";
import {
  Bar,
  Panel,
  Pill,
  chartColors,
  chartCursor,
  chartFill,
  chartTooltipProps,
} from "@/components/dash/bits";
import { GateError, GateLoading } from "@/components/load-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getClassroomLDSessions,
  getInstitutionOverview,
  getStudents,
  removeClassroomLDSession,
  type ClassroomLDSession,
  type ClassroomLDSessions,
  type InstitutionOverview,
  type StudentRecord,
} from "@/lib/api";

// The board is rebuilt from the live batch: every track is one of the
// self-training modules the backend already scores per student, so the averages
// here are the same numbers the student's own dashboard is built on.
const TRACKS = [
  { key: "aplr", label: "Aptitude & Logical Reasoning", track: "APL" },
  { key: "basic_math", label: "Basic Mathematics", track: "BMT" },
  { key: "situational", label: "Situational Problem Solving", track: "SPS" },
  { key: "technical", label: "Technical / Coding", track: "TEC" },
  { key: "dsa", label: "Data Structures & Algorithms", track: "DSA" },
  { key: "communication", label: "Communication Skills", track: "CDP" },
  { key: "english", label: "English Writing", track: "EWP" },
  { key: "gd", label: "Group Discussion", track: "GDA" },
] as const;

/**
 * The line the "needs help" list on the radar uses.
 *
 * A student under it on a module has not got that skill yet, which is a
 * different question from whether a track is worth running a session on.
 */
const NEEDS_HELP_BELOW = 50;

/**
 * What the skill radar breaks the batch down by: the mock-interview pillar and
 * every self-training module, rather than the composite scores.
 *
 * A composite hides the thing an officer acts on. "Self-training 31" does not say
 * whether one student has not opened anything or the whole batch is weak at DSA,
 * so each module gets its own axis and its own "who needs help" count.
 *
 * `short` is what fits on a radar spoke; `label` is what the list beside the chart
 * prints, where there is room for the full name.
 */
const RADAR_PILLARS = [
  {
    key: "mock_interview",
    short: "Mock",
    label: "Mock interview",
    score: (row: StudentRecord) => row.performance?.mock_interview ?? null,
  },
  ...TRACKS.map((t) => ({
    key: t.key,
    short: t.track,
    label: t.label,
    score: (row: StudentRecord) =>
      row.performance?.modules?.find((m) => m.key === t.key)?.score ?? null,
  })),
] as const;

type PillarStat = {
  key: string;
  short: string;
  label: string;
  /** Mean of the students who have a score here, rounded. 0 when nobody does. */
  score: number;
  /** How many students have a score here at all. */
  measured: number;
  /** How many of those are under {@link NEEDS_HELP_BELOW}. */
  needsHelp: number;
};

/** One row per radar axis: the batch average and who is falling behind on it. */
function pillarStats(rows: StudentRecord[]): PillarStat[] {
  return RADAR_PILLARS.map((pillar) => {
    const values = rows
      .map((row) => pillar.score(row))
      .filter((value): value is number => typeof value === "number");
    return {
      key: pillar.key,
      short: pillar.short,
      label: pillar.label,
      score: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
      measured: values.length,
      needsHelp: values.filter((value) => value < NEEDS_HELP_BELOW).length,
    };
  });
}

/**
 * The students under the help line on one radar axis, weakest first.
 *
 * Same filter the card's count is computed from, so opening the card and the
 * list agreeing is a property of one function rather than a coincidence. A
 * student with no score on this axis is excluded: they have not practised, which
 * is a different list from "practised and is still below the line".
 */
function studentsNeedingHelp(pillarKey: string, rows: StudentRecord[]): PillarStudent[] {
  const pillar = RADAR_PILLARS.find((p) => p.key === pillarKey);
  if (!pillar) return [];
  return rows
    .map((student) => ({ student, score: pillar.score(student) }))
    .filter(
      (entry): entry is { student: StudentRecord; score: number } =>
        typeof entry.score === "number" && entry.score < NEEDS_HELP_BELOW,
    )
    .sort((a, b) => a.score - b.score);
}

type DepartmentStat = {
  department: string;
  /** Mean readiness of the students who have one, rounded. 0 when none do. */
  avg: number;
  /** How many students in the department have a readiness score to average. */
  measured: number;
  /** Everyone in the department, measured or not. */
  total: number;
};

/**
 * Average readiness per department, best first.
 *
 * A student only counts once they have a readiness score, and the row says how
 * many that is: a department of 60 where one student has practised would
 * otherwise print as if the whole department were at that one score.
 */
function departmentReadiness(rows: StudentRecord[]): DepartmentStat[] {
  const groups = new Map<string, { sum: number; measured: number; total: number }>();
  for (const row of rows) {
    const department = row.department?.trim() || "Unassigned";
    const entry = groups.get(department) ?? { sum: 0, measured: 0, total: 0 };
    entry.total += 1;
    const score = row.performance?.score;
    if (typeof score === "number") {
      entry.sum += score;
      entry.measured += 1;
    }
    groups.set(department, entry);
  }
  return [...groups.entries()]
    .map(([department, entry]) => ({
      department,
      avg: entry.measured ? Math.round(entry.sum / entry.measured) : 0,
      measured: entry.measured,
      total: entry.total,
    }))
    .sort((a, b) => b.avg - a.avg);
}

export const Route = createFileRoute("/ld-training")({
  head: () => ({
    meta: [
      { title: "L&D Training — TalentBro Placement Dashboard" },
      {
        name: "description",
        content:
          "Learning & Development readiness for your batch — training tracks, cohort coverage and the sessions to run next.",
      },
      { property: "og:title", content: "L&D Training — TalentBro" },
      {
        property: "og:description",
        content: "Training tracks, readiness pillars and the sessions to run next.",
      },
    ],
  }),
  component: LdTrainingPage,
});

/**
 * One block of the classroom-sessions panel.
 *
 * Past sessions are printed in the same shape as upcoming ones but dimmed, so
 * the record of what ran stays on the board without competing with what still
 * has to happen.
 */
function SessionGroup({
  heading,
  sessions,
  emptyLabel,
  removingId,
  onRequestRemove,
}: {
  heading: string;
  sessions: ClassroomLDSession[];
  emptyLabel: string;
  /** The id currently being deleted, so its button shows the spinner. */
  removingId: string | null;
  onRequestRemove: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {heading}
        </h3>
        <Pill tone="muted">{sessions.length}</Pill>
      </div>
      {sessions.length === 0 ? (
        <p className="px-3.5 py-3 text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const busy = removingId === session.id;
            return (
              <div
                key={session.id}
                className={`rounded-lg border border-border p-3.5 ${
                  session.is_past ? "bg-muted/25" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4
                      className={`text-sm font-semibold ${
                        session.is_past ? "text-muted-foreground" : ""
                      }`}
                    >
                      {session.topic}
                    </h4>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" />
                        {session.starts_at_display}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3.5" />
                        {session.starts_at_time} – {session.ends_at_time}
                      </span>
                      {session.venue && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-3.5" />
                          {session.venue}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {session.department && <Pill tone="outline">{session.department}</Pill>}
                    <button
                      onClick={() => onRequestRemove(session.id)}
                      disabled={busy}
                      aria-label={`Remove ${session.topic}`}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                {session.faculty_name && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Taken by{" "}
                    <span className="font-medium text-foreground">{session.faculty_name}</span>
                    {session.duration_minutes > 0 && ` · ${session.duration_minutes} min`}
                  </p>
                )}
                {session.agenda && (
                  <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">
                    {session.agenda}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LdTrainingPage() {
  const [rows, setRows] = useState<StudentRecord[] | null>(null);
  const [overview, setOverview] = useState<InstitutionOverview | null>(null);
  const [sessions, setSessions] = useState<ClassroomLDSessions | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  // Which radar axis the "who needs help" sheet is showing, if any.
  const [openPillar, setOpenPillar] = useState<string | null>(null);
  // The id waiting for confirmation, kept apart from the in-flight flag so the
  // dialog can stay open and disable its buttons while the delete runs.
  const [pendingSessionRemoval, setPendingSessionRemoval] = useState<string | null>(null);
  const [removingSessionBusy, setRemovingSessionBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([getStudents(), getInstitutionOverview()])
      .then(([students, ov]) => {
        if (cancelled) return;
        setRows(students.students);
        setOverview(ov);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the L&D board.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Fetched apart from the readiness board on purpose: a timetable that fails to
  // load should cost the officer their sessions, not the whole page. Only the
  // sessions panel reports this one, and the panel offers a retry.
  useEffect(() => {
    let cancelled = false;
    setSessionsError(null);
    getClassroomLDSessions()
      .then((res) => {
        if (!cancelled) setSessions(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSessionsError(
          err instanceof Error ? err.message : "Could not load the classroom sessions.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // The server has already sorted and split both halves, so a new session only
  // has to slot into the right list to keep the board correct without a round trip.
  function onSessionAdded(session: ClassroomLDSession) {
    setSessions((prev) => {
      const upcoming = prev?.upcoming ?? [];
      const done = prev?.done ?? [];
      const nextUpcoming = session.is_past
        ? upcoming
        : [...upcoming, session].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      const nextDone = session.is_past ? [session, ...done] : done;
      return {
        upcoming: nextUpcoming,
        done: nextDone,
        counts: { upcoming: nextUpcoming.length, done: nextDone.length },
      };
    });
  }

  async function onSessionRemoved(id: string) {
    setRemovingSessionBusy(true);
    try {
      await removeClassroomLDSession(id);
      setSessions((prev) => {
        if (!prev) return prev;
        const upcoming = prev.upcoming.filter((s) => s.id !== id);
        const done = prev.done.filter((s) => s.id !== id);
        return {
          upcoming,
          done,
          counts: { upcoming: upcoming.length, done: done.length },
        };
      });
      toast.success("Session removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the session.");
    } finally {
      setRemovingSessionBusy(false);
      setPendingSessionRemoval(null);
    }
  }

  // Named in the confirmation, so the officer sees which row they are about to
  // cancel rather than a bare "are you sure".
  const removingSessionTopic =
    sessions === null || pendingSessionRemoval === null
      ? null
      : ([...sessions.upcoming, ...sessions.done].find((s) => s.id === pendingSessionRemoval)
          ?.topic ?? null);

  if (rows === null && error === null) return <GateLoading />;
  if (rows === null) {
    return (
      <Shell title="L&D Training" subtitle="Readiness and training coverage for your batch">
        <GateError
          message={error}
          onRetry={() => {
            setReloadKey((n) => n + 1);
          }}
        />
      </Shell>
    );
  }

  const pillars = pillarStats(rows);
  // The help list is sized against the worst pillar, so a bar never looks full
  // when only a handful of students are actually struggling.
  const maxNeedsHelp = Math.max(1, ...pillars.map((p) => p.needsHelp));
  const unmeasured = pillars.filter((p) => p.measured === 0);
  // Resolved from the student rows already in hand, so the sheet needs no request
  // of its own and cannot show a name the rest of the page does not have.
  const openPillarStat = openPillar ? pillars.find((p) => p.key === openPillar) : undefined;
  const openPillarStudents = openPillar ? studentsNeedingHelp(openPillar, rows) : [];

  const departments = departmentReadiness(rows);
  const cohort = overview?.batch;
  const termLabel = cohort ? `Batch ${cohort.year} · ${cohort.students} students` : "Current batch";

  return (
    <Shell
      title="L&D Training"
      subtitle={`Learning & Development readiness for ${overview?.institution.name ?? "your college"}`}
      actions={
        <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium">
          <CalendarDays className="size-3.5 text-muted-foreground" /> {termLabel}
        </span>
      }
    >
      <Panel
        title="Readiness by department"
        description="Average composite readiness across every department, best first. A bar only averages the students who have a readiness score, and says how many that is."
        action={
          <Pill tone={departments.length ? "solid" : "muted"}>
            {departments.length} department{departments.length === 1 ? "" : "s"}
          </Pill>
        }
      >
        {departments.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No students on record yet, so there is nothing to average.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, departments.length * 38)}>
            <BarChart
              data={departments}
              layout="vertical"
              margin={{ top: 4, right: 44, bottom: 0, left: 0 }}
            >
              <CartesianGrid stroke={chartColors.grid} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: chartColors.axis }}
                stroke={chartColors.grid}
              />
              <YAxis
                type="category"
                dataKey="department"
                width={128}
                tickLine={false}
                axisLine={false}
                fontSize={11}
                tick={{ fill: chartColors.axis }}
              />
              <Tooltip
                {...chartTooltipProps}
                cursor={chartCursor}
                formatter={(value, _name, item) => [
                  `${value}/100 average readiness`,
                  `${(item?.payload as DepartmentStat | undefined)?.measured ?? 0} of ${
                    (item?.payload as DepartmentStat | undefined)?.total ?? 0
                  } students scored`,
                ]}
              />
              <ChartBar dataKey="avg" radius={[0, 4, 4, 0]} barSize={20}>
                {departments.map((row, i) => (
                  <Cell key={row.department} fill={chartFill(i)} />
                ))}
                <LabelList dataKey="avg" position="right" fontSize={11} fill={chartColors.label} />
              </ChartBar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel
        className="mt-4"
        title="Skill radar"
        description={`Mock interview and every self-training module, with the batch average on each and how many students are under ${NEEDS_HELP_BELOW} and need help with it`}
      >
        {/* The radar is the headline of this panel, so it gets the full width and
            sits centred on its own. The per-pillar detail used to share a
            two-column row with it, which squeezed the chart into half the panel
            and left the numbers below rather than beside their axis. */}
        <div className="mx-auto w-full max-w-2xl">
          <ResponsiveContainer width="100%" height={340}>
            <RadarChart data={pillars} outerRadius="72%">
              <PolarGrid stroke={chartColors.grid} />
              <PolarAngleAxis dataKey="short" tick={{ fontSize: 10, fill: chartColors.axis }} />
              {/* tick={false} drops the 25/50/75/100 ring labels. The scale is fixed at
                  0-100 and the exact average is printed on each card below, so
                  the rings only crowd the spokes at this size. */}
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={false}
                axisLine={false}
                stroke={chartColors.grid}
              />
              <Tooltip
                {...chartTooltipProps}
                cursor={chartCursor}
                formatter={(_value, _name, item) => {
                  const row = item?.payload as PillarStat | undefined;
                  return [
                    `${row?.score ?? 0}/100 average · ${row?.needsHelp ?? 0} need help`,
                    row?.label ?? "",
                  ];
                }}
              />
              <Radar
                dataKey="score"
                name="Batch average"
                stroke={chartColors.ink}
                fill={chartColors.ink}
                fillOpacity={0.16}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {/* Clickable only when there is somebody to show: a card with no
              students under the line has nothing behind it, so it stays a plain
              card rather than opening an empty sheet. */}
          {pillars.map((p) => {
            const openable = p.needsHelp > 0;
            const body = (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <Pill tone="outline">{p.short}</Pill>
                      <span className="truncate text-xs font-medium">{p.label}</span>
                    </p>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {p.measured === 0 ? (
                        "No student has a score here yet"
                      ) : p.needsHelp === 0 ? (
                        `${p.measured} measured · nobody under ${NEEDS_HELP_BELOW}`
                      ) : (
                        <>
                          <span className="font-medium text-destructive">
                            {p.needsHelp} student{p.needsHelp === 1 ? "" : "s"}
                          </span>{" "}
                          under {NEEDS_HELP_BELOW} of {p.measured} need help with this
                        </>
                      )}
                    </p>
                  </div>
                  <span className="stat-num text-sm">{p.score}</span>
                </div>
                {p.needsHelp > 0 && (
                  <div className="mt-2">
                    <Bar value={p.needsHelp} max={maxNeedsHelp} />
                  </div>
                )}
              </>
            );
            return openable ? (
              <button
                key={p.key}
                type="button"
                onClick={() => setOpenPillar(p.key)}
                aria-haspopup="dialog"
                title={`See the ${p.needsHelp} student${p.needsHelp === 1 ? "" : "s"} under ${NEEDS_HELP_BELOW} on ${p.label}`}
                className="w-full cursor-pointer rounded-md border border-border px-3.5 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                {body}
              </button>
            ) : (
              <div key={p.key} className="rounded-md border border-border px-3.5 py-2.5">
                {body}
              </div>
            );
          })}
          {unmeasured.length === pillars.length && (
            <p className="py-2 text-xs text-muted-foreground sm:col-span-2">
              No readiness scores recorded yet — students appear here once they start practice.
            </p>
          )}
        </div>
      </Panel>

      <Panel
        className="mt-4"
        title="Classroom sessions"
        description="Everything your college has scheduled, split into what is still to come and what has already run"
        action={
          <button
            onClick={() => setShowSessionDialog(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <CalendarPlus className="size-3.5" /> Create session
          </button>
        }
      >
        {sessionsError ? (
          <div className="py-10 text-center">
            <p className="text-sm text-muted-foreground">{sessionsError}</p>
            <button
              onClick={() => setReloadKey((n) => n + 1)}
              className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Try again
            </button>
          </div>
        ) : sessions === null ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading sessions…
          </p>
        ) : sessions.upcoming.length === 0 && sessions.done.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No classroom sessions yet. Create one to put it on the board.
          </p>
        ) : (
          <div className="space-y-5">
            <SessionGroup
              heading="Upcoming"
              sessions={sessions.upcoming}
              emptyLabel="Nothing scheduled ahead."
              removingId={removingSessionBusy ? pendingSessionRemoval : null}
              onRequestRemove={(id) => setPendingSessionRemoval(id)}
            />
            <SessionGroup
              heading="Done"
              sessions={sessions.done}
              emptyLabel="No session has run yet."
              removingId={removingSessionBusy ? pendingSessionRemoval : null}
              onRequestRemove={(id) => setPendingSessionRemoval(id)}
            />
          </div>
        )}
      </Panel>

      {openPillarStat && (
        <PillarStudentsDialog
          pillar={openPillarStat.label}
          students={openPillarStudents}
          needsHelpBelow={NEEDS_HELP_BELOW}
          onClose={() => setOpenPillar(null)}
        />
      )}

      {showSessionDialog && (
        <ClassroomSessionDialog
          onClose={() => setShowSessionDialog(false)}
          onAdded={onSessionAdded}
        />
      )}

      {/* A scheduled session is a commitment to a room and a faculty member's
          hour, so a stray click on a small icon must not cancel it. */}
      <AlertDialog
        open={pendingSessionRemoval !== null}
        onOpenChange={(open) => {
          if (!open && !removingSessionBusy) setPendingSessionRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {removingSessionTopic ? `“${removingSessionTopic}” is taken off your L&D board.` : ""}{" "}
              Nobody is notified, so tell the room and the faculty yourself. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingSessionBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (pendingSessionRemoval) void onSessionRemoved(pendingSessionRemoval);
              }}
              disabled={removingSessionBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removingSessionBusy ? "Removing…" : "Remove session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}
