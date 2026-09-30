import { useQuery } from "@tanstack/react-query";
import { CircleAlert, HelpCircle, Lightbulb, Loader2, MessagesSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pill } from "@/components/dash/bits";
import { DASH, fmtDateTime, humanize } from "@/components/dash/activity";
import { getQuestionSessionEvidence, type QuestionSessionTurn } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * A titled block of stored text. Question, answer and solution are all plain
 * prose the coach wrote or generated once, so they get the same frame - the
 * heading is the only thing that tells them apart.
 */
function Block({
  icon: Icon,
  title,
  body,
  tone = "default",
}: {
  icon: typeof HelpCircle;
  title: string;
  body: string;
  tone?: "default" | "answer";
}) {
  return (
    <section
      className={cn(
        "rounded-lg border px-3.5 py-3",
        tone === "answer" ? "border-primary/40 bg-primary/5" : "border-border/70 bg-background/40",
      )}
    >
      <p className="flex items-center gap-2 text-xs font-semibold">
        <Icon className="size-3.5 text-muted-foreground" />
        {title}
      </p>
      {body ? (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">Nothing stored against this session.</p>
      )}
    </section>
  );
}

/**
 * One chat turn. The student's own replies are what an officer is reading the
 * session for, so they are boxed and tinted; the coach's nudges are kept
 * beside them because a reply only reads correctly against the hint that
 * provoked it.
 */
function Turn({ turn }: { turn: QuestionSessionTurn }) {
  const isStudent = turn.role === "user";
  return (
    <li
      className={cn(
        "rounded-lg border px-3.5 py-3",
        isStudent ? "border-primary/40 bg-primary/5" : "border-border/70 bg-background/40",
      )}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-semibold">{isStudent ? "Student" : "Coach"}</span>
        {!isStudent && <Pill tone="muted">Coach</Pill>}
        {turn.created_at && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {fmtDateTime(turn.created_at)}
          </span>
        )}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{turn.content}</p>
    </li>
  );
}

/**
 * The evidence behind one question-module session card: the question as it was
 * asked, every reply the student wrote in reply, and the answer and solution
 * stored against it.
 *
 * Covers APLR, Basic Math, Situational Problem Solving, Technical / Coding and
 * DSA - the five modules that hold exactly one question per session, so one
 * card is one question and the whole attempt sits in that row. Nothing here is
 * generated on open; it is all read straight from the stored record.
 */
export function QuestionSessionDialog({
  sessionId,
  open,
  onOpenChange,
}: {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["question-session-evidence", sessionId],
    queryFn: () => getQuestionSessionEvidence(sessionId!),
    enabled: open && Boolean(sessionId),
  });

  const session = data?.session;
  const turns = session?.transcript ?? [];
  const studentTurns = turns.filter((turn) => turn.role === "user");
  const facts = [
    { label: "Status", value: session ? humanize(session.status) : DASH },
    { label: "Attempts", value: session ? String(session.attempts) : DASH },
    { label: "Hints used", value: session ? String(session.hints_used) : DASH },
    { label: "Points", value: session ? String(session.points_awarded) : DASH },
    {
      label: "Rating",
      value: session && session.star_rating ? `${session.star_rating}/5` : DASH,
    },
    { label: "Solved at", value: fmtDateTime(session?.solved_at) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dash-panel max-h-[88vh] max-w-2xl gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-[15px] font-semibold leading-snug">
            {session?.title || "Session detail"}
          </DialogTitle>
          <DialogDescription className="mt-0.5 font-mono text-[11px]">
            {data
              ? [data.module_label, session?.category ? humanize(session.category) : null]
                  .filter(Boolean)
                  .join(" · ")
              : "Reading the stored record…"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          {isPending && (
            <p className="inline-flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading this question…
            </p>
          )}

          {!isPending && error && (
            <div className="flex items-start gap-3 rounded-lg border border-border px-3.5 py-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium">Could not load this question</p>
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
          )}

          {session && (
            <>
              <dl className="grid gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 sm:grid-cols-3">
                {facts.map((fact) => (
                  <div key={fact.label} className="bg-card px-3.5 py-2.5">
                    <dt className="truncate text-[11px] text-muted-foreground">{fact.label}</dt>
                    <dd className="mt-0.5 font-mono text-sm font-medium tabular-nums">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <Block icon={HelpCircle} title="Question" body={session.question} />

              <div>
                <p className="flex items-center justify-between gap-3">
                  <span className="dash-mono-label">What the student wrote</span>
                  <Pill tone="muted">
                    <MessagesSquare className="size-3" /> {studentTurns.length} of {turns.length}{" "}
                    turns
                  </Pill>
                </p>
                {turns.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted-foreground">
                    The student never replied to this question, so no response was stored.
                  </p>
                ) : (
                  <ol className="mt-2 space-y-2">
                    {turns.map((turn, index) => (
                      <Turn key={index} turn={turn} />
                    ))}
                  </ol>
                )}
              </div>

              <Block icon={Lightbulb} title="Answer" body={session.answer} tone="answer" />

              {/* The solution is the conventional walkthrough and is often the
                  only place the method is written down, so it is shown whenever
                  the row holds one - including when it repeats the answer. */}
              {session.solution && session.solution !== session.answer && (
                <Block icon={Lightbulb} title="Solution" body={session.solution} />
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
