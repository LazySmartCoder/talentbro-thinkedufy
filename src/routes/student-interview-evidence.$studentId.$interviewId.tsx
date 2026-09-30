import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, CircleAlert, Loader2, MessagesSquare, ShieldAlert, Users } from "lucide-react";
import { Shell } from "@/components/dash/Shell";
import { Panel, Pill } from "@/components/dash/bits";
import { DASH, fmtDateTime, mockInterviewStatusMeta } from "@/components/dash/activity";
import { getStudentInterviewEvidence, type ServerMockMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student-interview-evidence/$studentId/$interviewId")({
  head: () => ({
    meta: [
      { title: "Interview evidence — TalentBro Placement Dashboard" },
      {
        name: "description",
        content:
          "The full stored transcript of one mock interview: every question the panel asked and every answer the student gave.",
      },
    ],
  }),
  component: StudentInterviewEvidencePage,
});

/** One reviewer on the panel, in the order the backend stores their remarks. */
const PANELIST_NAMES: Record<string, string> = {
  atlas: "Atlas",
  maya: "Maya",
  albert: "Albert",
  peter: "Peter",
  daniel: "Daniel",
  ada: "Ada",
  carl: "Carl",
};

/** Only the score is shown when one exists; nothing is generated on this read. */
function Turn({ message }: { message: ServerMockMessage }) {
  const isCandidate = message.role === "user";
  const panelist = PANELIST_NAMES[message.panelist ?? ""] ?? (message.panelist || "Panel");
  return (
    <li
      className={cn(
        "rounded-lg border px-3.5 py-3",
        isCandidate ? "border-primary/40 bg-primary/5" : "border-border/70 bg-background/40",
      )}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-semibold">{isCandidate ? "Student" : panelist}</span>
        {!isCandidate && <Pill tone="outline">Panel</Pill>}
        {message.tone && <Pill tone="muted">{message.tone}</Pill>}
        <span className="font-mono text-[11px] text-muted-foreground">
          {fmtDateTime(message.created_at)}
        </span>
      </p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
    </li>
  );
}

function StudentInterviewEvidencePage() {
  const { studentId, interviewId } = Route.useParams();

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["student-interview-evidence", interviewId],
    queryFn: () => getStudentInterviewEvidence(interviewId),
  });

  const student = data?.student;
  const interview = data?.interview;
  const messages = interview?.messages ?? [];
  const remarks = Object.entries(interview?.panelist_response ?? {}).filter(([, text]) =>
    Boolean(text),
  );

  useEffect(() => {
    if (student) {
      document.title = `Interview evidence — ${student.full_name || "Student"} | TalentBro`;
    }
  }, [student]);

  const title = interview
    ? `${interview.company_name || "Mock interview"}${interview.role ? ` · ${interview.role}` : ""}`
    : "Interview evidence";

  return (
    <Shell
      title={title}
      subtitle={
        interview
          ? [
              student?.full_name || "Student",
              fmtDateTime(interview.created_at),
              `${interview.message_count} turns`,
              interview.duration || null,
            ]
              .filter(Boolean)
              .join(" · ")
          : studentId
      }
      actions={
        <>
          <Link
            to="/student-module/$studentId/$moduleKey"
            params={{ studentId, moduleKey: "mock_interview" }}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <ArrowLeft className="size-4" /> Mock interviews
          </Link>
          <Link
            to="/student-activity/$studentId"
            params={{ studentId }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            All modules
          </Link>
        </>
      }
    >
      {isPending && (
        <Panel>
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading the transcript…
          </p>
        </Panel>
      )}

      {!isPending && error && (
        <Panel>
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium">Could not load this transcript</p>
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

      {interview && (
        <div className="space-y-4">
          <Panel
            title="How this session ended"
            description="Read straight from the stored record. Nothing on this page is generated or re-scored when it is opened."
          >
            <dl className="grid gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Status", value: mockInterviewStatusMeta(interview.status).label },
                {
                  label: "Score",
                  value:
                    interview.analysis?.overall_score != null
                      ? `${interview.analysis.overall_score}/100`
                      : "Not scored",
                },
                {
                  label: "Scored dimensions",
                  value: interview.analysis
                    ? `${interview.analysis.scored_dimensions}/${interview.analysis.total_dimensions}`
                    : DASH,
                },
                {
                  label: "Focus losses",
                  value: interview.suspection ? String(interview.suspection) : "None recorded",
                },
              ].map((fact) => (
                <div key={fact.label} className="bg-card px-3.5 py-2.5">
                  <dt className="truncate text-[11px] text-muted-foreground">{fact.label}</dt>
                  <dd className="mt-0.5 font-mono text-sm font-medium tabular-nums">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>

            {interview.panelists.length > 0 && (
              <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" /> Panel:
                {interview.panelists.map((panelist) => (
                  <span key={panelist} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                    {PANELIST_NAMES[panelist] ?? panelist}
                  </span>
                ))}
              </p>
            )}

            {interview.suspection ? (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                {interview.suspection} focus loss{interview.suspection === 1 ? "" : "es"} recorded.
                Counted but never scored — the interview still ran and the answers still counted.
              </p>
            ) : null}

            {interview.questions.length > 0 && (
              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="dash-mono-label">Focus areas briefed into this interview</p>
                <ul className="mt-1.5 space-y-1">
                  {interview.questions.map((question, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-foreground" />
                      {question}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel
            title="Transcript"
            description="Every question the panel asked and every answer given, in the order it happened."
            action={
              <Pill tone="muted">
                <MessagesSquare className="size-3" /> {messages.length} turns
              </Pill>
            }
          >
            {messages.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                This interview has no stored turns yet.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {messages.map((message, index) => (
                  <Turn key={index} message={message} />
                ))}
              </ol>
            )}
          </Panel>

          {remarks.length > 0 && (
            <Panel
              title="Panel's closing remarks"
              description="What each panelist wrote at the end of the session, exactly as it was stored."
            >
              <div className="space-y-2.5">
                {remarks.map(([panelist, text]) => (
                  <div
                    key={panelist}
                    className="rounded-lg border border-border/70 bg-background/40 px-3.5 py-3"
                  >
                    <p className="dash-mono-label">{PANELIST_NAMES[panelist] ?? panelist}</p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}
    </Shell>
  );
}
