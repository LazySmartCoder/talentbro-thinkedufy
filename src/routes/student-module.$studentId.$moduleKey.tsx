import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, CircleAlert, Clock, Loader2 } from "lucide-react";
import { Shell } from "@/components/dash/Shell";
import { Bar, Panel, Pill } from "@/components/dash/bits";
import {
  DASH,
  MODULE_ICONS,
  SessionRow,
  fmtDateTime,
  fmtScore,
  summaryFacts,
} from "@/components/dash/activity";
import { QuestionSessionDialog } from "@/components/dash/QuestionSessionDialog";
import { EnglishSessionDialog } from "@/components/dash/EnglishSessionDialog";
import { getStudentActivity, type ActivityModuleKey, type ActivitySession } from "@/lib/api";

/**
 * The five modules that hold one question per session. Their history panel
 * promises a clickable card because a card there is a whole attempt — the
 * question, what the student replied and the answer are all one row.
 */
const QUESTION_MODULES = new Set<ActivityModuleKey>([
  "aplr",
  "basic_math",
  "situational",
  "technical",
  "dsa",
]);

export const Route = createFileRoute("/student-module/$studentId/$moduleKey")({
  head: () => ({
    meta: [
      { title: "Module history — TalentBro Placement Dashboard" },
      {
        name: "description",
        content:
          "Every practice session a student ran in one module, with the scores and evidence behind each one.",
      },
    ],
  }),
  component: StudentModulePage,
});

function StudentModulePage() {
  const { studentId, moduleKey } = Route.useParams();

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["student-activity", studentId],
    queryFn: () => getStudentActivity(studentId),
  });

  // The card a placement officer has clicked open, and the module it belongs to
  // at the moment it was clicked. One id is enough to fetch — the modal reads
  // the question or the writing itself — but English needs its own dialog, so
  // the module is captured with the id rather than read back off the URL, which
  // cannot change while a modal is open but is not worth depending on.
  const [openSession, setOpenSession] = useState<{
    id: string;
    module: ActivityModuleKey;
  } | null>(null);

  const student = data?.student;
  const module = data?.modules.find((entry) => entry.key === moduleKey);
  const Icon = MODULE_ICONS[moduleKey as ActivityModuleKey];
  const sessions = (data?.sessions ?? []).filter((session) => session.module === moduleKey);
  const avg = module ? ((module.summary as { avg_score?: number | null }).avg_score ?? null) : null;
  const lastActivity = sessions.at(0)?.created_at ?? null;
  const bestScore = bestOf(sessions);

  const closeSession = () => setOpenSession(null);
  const openIsEnglish = openSession?.module === "english";

  useEffect(() => {
    if (student && module) {
      document.title = `${module.label} history — ${student.full_name || "Student"} | TalentBro`;
    }
  }, [student, module]);

  const header = {
    title: module ? `${module.label} — ${student?.full_name || "Student"}` : "Module history",
    subtitle: student
      ? [
          student.department,
          student.program,
          student.end_year ? `Class of ${student.end_year}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : studentId,
  };

  return (
    <Shell
      title={header.title}
      subtitle={header.subtitle}
      actions={
        <>
          <Link
            to="/student-activity/$studentId"
            params={{ studentId }}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <ArrowLeft className="size-4" /> All modules
          </Link>
          <Link
            to="/student-data/$studentId"
            params={{ studentId }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Student data
          </Link>
        </>
      }
    >
      {isPending && (
        <Panel>
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading this module’s history…
          </p>
        </Panel>
      )}

      {!isPending && error && (
        <Panel>
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium">Could not load this activity record</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-3 cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                Try again
              </button>
            </div>
          </div>
        </Panel>
      )}

      {data && !module && (
        <Panel>
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 text-destructive" />
            <div>
              <p className="text-sm font-medium">Unknown practice module</p>
              <p className="mt-1 text-sm text-muted-foreground">
                “{moduleKey}” is not a module this student can practise in.
              </p>
              <Link
                to="/student-activity/$studentId"
                params={{ studentId }}
                className="mt-3 inline-block rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                Back to all modules
              </Link>
            </div>
          </div>
        </Panel>
      )}

      {data && module && (
        <div className="space-y-4">
          <Panel>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-6" />
                </span>
                <div className="min-w-0">
                  <p className="dash-mono-label">Practice module</p>
                  <h2 className="font-display text-xl font-bold tracking-tight">{module.label}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sessions.length} session{sessions.length === 1 ? "" : "s"} recorded
                    {lastActivity ? ` · most recent ${fmtDateTime(lastActivity)}` : ""}
                    {data.truncated ? " · record capped at 500" : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-end gap-8 border-t border-border/60 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <div>
                  <p className="dash-mono-label">Average</p>
                  <p className="font-display text-3xl font-bold tabular-nums">
                    {avg != null ? fmtScore(avg) : DASH}
                  </p>
                </div>
                <div>
                  <p className="dash-mono-label">Best</p>
                  <p className="font-display text-3xl font-bold tabular-nums text-muted-foreground">
                    {bestScore != null ? fmtScore(bestScore) : DASH}
                  </p>
                </div>
              </div>
            </div>
            {avg != null && (
              <div className="mt-6">
                <div className="mb-1.5 flex items-baseline justify-between text-[11px] text-muted-foreground">
                  <span>Average score across {sessions.length} sessions</span>
                  <span className="font-mono">/100</span>
                </div>
                <Bar value={avg} />
              </div>
            )}
          </Panel>

          {/* Not shown for mock interviews: every fact it would print is already
              on screen. The panel above carries the average and the best, and
              the session count is repeated on the Session history panel below,
              leaving only completed / scored / completion rate - three numbers
              about how often the student finished, which is a coaching signal,
              not a record of what they practised. */}
          {moduleKey !== "mock_interview" && (
            <Panel
              title="Module record"
              description="Averages across every session this student has run in this module."
            >
              <dl className="grid gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 sm:grid-cols-2 lg:grid-cols-3">
                {summaryFacts(module.key, module.summary).map((fact) => (
                  <div key={fact.label} className="bg-card px-3.5 py-2.5">
                    <dt className="truncate text-[11px] text-muted-foreground">{fact.label}</dt>
                    <dd className="mt-0.5 font-mono text-sm font-medium tabular-nums">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          )}

          <Panel
            title="Session history"
            description={
              moduleKey === "mock_interview"
                ? "Newest first. Each card carries the outcome and every score on record — open Evidence on a card to read the transcript behind it."
                : QUESTION_MODULES.has(moduleKey as ActivityModuleKey)
                  ? "Newest first. Each card is one question — open it to read the question, what the student replied and the answer."
                  : moduleKey === "english"
                    ? "Newest first. Each card is one writing task — open it to read the chat and every correction Maya flagged."
                    : "Newest first. Each card carries the outcome, the status and every score the platform recorded for that session."
            }
            action={
              <Pill tone={sessions.length ? "solid" : "muted"}>
                {sessions.length} session{sessions.length === 1 ? "" : "s"}
              </Pill>
            }
          >
            {sessions.length === 0 ? (
              <div className="grid place-items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
                <Clock className="size-5 text-muted-foreground" />
                <p className="text-sm font-medium">No sessions in this module yet</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Once {student?.full_name || "the student"} practises {module.label}, every session
                  will be listed here with the evidence behind it.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {sessions.map((session) => (
                  <SessionRow
                    key={`${session.module}-${session.id}`}
                    session={session}
                    studentId={studentId}
                    onOpenDetail={(row: ActivitySession) =>
                      setOpenSession({ id: row.id, module: row.module })
                    }
                  />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      <QuestionSessionDialog
        sessionId={openIsEnglish ? null : (openSession?.id ?? null)}
        open={openSession !== null && !openIsEnglish}
        onOpenChange={(next) => {
          if (!next) closeSession();
        }}
      />
      <EnglishSessionDialog
        sessionId={openIsEnglish ? openSession.id : null}
        open={openIsEnglish}
        onOpenChange={(next) => {
          if (!next) closeSession();
        }}
      />
    </Shell>
  );
}

function bestOf(sessions: { overall_score?: number | null }[]) {
  const scores = sessions
    .map((session) => session.overall_score)
    .filter((score): score is number => score != null);
  return scores.length > 0 ? Math.max(...scores) : null;
}
