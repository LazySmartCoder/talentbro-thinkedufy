import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  ArrowLeft,
  CircleAlert,
  Clock,
  Database,
  FileText,
  Loader2,
  Target,
  Trophy,
} from "lucide-react";
import { Shell } from "@/components/dash/Shell";
import { Kpi, Panel } from "@/components/dash/bits";
import { DASH, MODULE_ICONS, ModuleRow, fmtDateTime, fmtScore } from "@/components/dash/activity";
import { getStudentActivity, type StudentActivityResponse } from "@/lib/api";

export const Route = createFileRoute("/student-activity/$studentId")({
  head: () => ({
    meta: [
      { title: "Student activity — TalentBro Placement Dashboard" },
      {
        name: "description",
        content:
          "One student's mock interviews and self-training sessions with the averages across their whole record.",
      },
    ],
  }),
  component: StudentActivityPage,
});

/**
 * The module the student is strongest in: the highest average score of all the
 * modules that publish one.
 *
 * The five question modules (APLR, Basic Math, Situational, Technical, DSA) are
 * skipped on purpose - they report solve counts rather than a score, so reading
 * their missing average as zero would hand the title to whichever module did
 * have a number instead of to the one that was actually best.
 */
function bestPractised(modules: StudentActivityResponse["modules"]) {
  let best: { label: string; avg: number } | null = null;
  for (const module of modules) {
    const avg = (module.summary as { avg_score?: number | null }).avg_score;
    if (avg == null) continue;
    if (!best || avg > best.avg) best = { label: module.label, avg };
  }
  return best;
}

function StudentActivityPage() {
  const { studentId } = Route.useParams();
  const navigate = useNavigate();

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["student-activity", studentId],
    queryFn: () => getStudentActivity(studentId),
  });

  const student = data?.student;

  useEffect(() => {
    if (student) document.title = `${student.full_name || "Student"} activity | TalentBro`;
  }, [student]);

  const sessions = data?.sessions ?? [];
  const best = data ? bestPractised(data.modules) : null;

  const header = student
    ? {
        title: `${student.full_name || "Student"} — activity`,
        subtitle: [
          student.department,
          student.program,
          student.end_year ? `Class of ${student.end_year}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      }
    : { title: "Student activity", subtitle: studentId };

  return (
    <Shell
      title={header.title}
      subtitle={header.subtitle}
      actions={
        <>
          <Link
            to="/students"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <ArrowLeft className="size-4" /> All students
          </Link>
          {student && (
            <Link
              to="/student-data/$studentId"
              params={{ studentId }}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <FileText className="size-4" /> Student data
            </Link>
          )}
        </>
      }
    >
      {isPending && (
        <Panel>
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading practice history…
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

      {data && (
        <div className="space-y-4">
          {!student?.has_account && (
            <Panel>
              <p className="text-sm text-muted-foreground">
                This student was added as an email-only invite, so there is no account and no
                practice history yet. It appears here as soon as they sign up and start training.
              </p>
            </Panel>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Total sessions"
              value={data.totals.sessions}
              hint={data.truncated ? "Older sessions beyond the first 500" : "Every session shown"}
              icon={Database}
            />
            <Kpi label="Modules used" value={data.totals.modules_used} icon={Target} />
            <Kpi
              label="Last activity"
              value={
                data.totals.last_activity_at ? fmtDateTime(data.totals.last_activity_at) : DASH
              }
              icon={Clock}
            />
            <Kpi
              label="Best Practised"
              value={best?.label ?? DASH}
              hint={best ? `${fmtScore(best.avg)}/100 average score` : "No scored module yet"}
              icon={Trophy}
            />
          </div>

          <Panel
            title="Practice modules"
            description="Every average below spans the student's whole record. Open a module to read its session history and the evidence behind these numbers."
          >
            <ul className="space-y-2.5">
              {data.modules.map((module) => (
                <ModuleRow
                  key={module.key}
                  moduleKey={module.key}
                  label={module.label}
                  summary={module.summary}
                  count={sessions.filter((session) => session.module === module.key).length}
                  active={false}
                  onSelect={() =>
                    void navigate({
                      to: "/student-module/$studentId/$moduleKey",
                      params: { studentId, moduleKey: module.key },
                    })
                  }
                />
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </Shell>
  );
}
