import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenCheck,
  CircleAlert,
  Loader2,
  MessagesSquare,
  PenLine,
  TriangleAlert,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Bar, Pill } from "@/components/dash/bits";
import { DASH, fmtDateTime, humanize } from "@/components/dash/activity";
import {
  getEnglishSessionEvidence,
  type EnglishSessionEvidenceResponse,
  type QuestionSessionTurn,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type Mistake = EnglishSessionEvidenceResponse["session"]["mistakes"][number];

/**
 * The eight dimensions Maya scores, in the order the student-facing report
 * prints them. Kept as a list rather than read off the raw column names so the
 * dash says "Spelling & punctuation" rather than "Spelling", and so
 * ``writing_score`` is never mistaken for a ninth dimension.
 */
const DIMENSIONS: { key: string; label: string }[] = [
  { key: "clarity", label: "Clarity" },
  { key: "structure", label: "Structure" },
  { key: "grammar", label: "Grammar" },
  { key: "vocabulary", label: "Vocabulary" },
  { key: "spelling", label: "Spelling & punctuation" },
  { key: "conciseness", label: "Conciseness" },
  { key: "task_focus", label: "Task focus" },
  { key: "professional_tone", label: "Professional tone" },
];

const FEEDBACK: {
  key: "strengths" | "areas_for_improvement" | "recurring_mistakes" | "ai_recommendations";
  label: string;
}[] = [
  { key: "strengths", label: "Strengths" },
  { key: "areas_for_improvement", label: "Areas to improve" },
  { key: "recurring_mistakes", label: "Recurring mistakes" },
  { key: "ai_recommendations", label: "Recommendations" },
];

/**
 * One flagged mistake: the phrase as the student wrote it struck through, the
 * corrected phrasing beside it, and why. The crossed-out / replacement pairing
 * is the whole point of the block - an officer reading it should be able to say
 * what to change without interpreting the numbers.
 */
function MistakeCard({ mistake }: { mistake: Mistake }) {
  return (
    <li className="rounded-lg border border-border/70 bg-background/40 px-3.5 py-3">
      <p className="flex flex-wrap items-center gap-2">
        {mistake.category && <Pill tone="muted">{humanize(mistake.category)}</Pill>}
        <span className="text-[11px] text-muted-foreground">Message #{mistake.turn_index + 1}</span>
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="min-w-0 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2">
          <p className="dash-mono-label">As written</p>
          <p className="mt-0.5 text-sm leading-relaxed text-destructive line-through decoration-destructive/40">
            {mistake.original || DASH}
          </p>
        </div>
        <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
        <div className="min-w-0 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
          <p className="dash-mono-label">Write it as</p>
          <p className="mt-0.5 text-sm font-medium leading-relaxed">{mistake.corrected || DASH}</p>
        </div>
      </div>
      {mistake.explanation && (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{mistake.explanation}</p>
      )}
    </li>
  );
}

/**
 * One chat turn. Student turns are tinted and numbered, and the number is the
 * one a mistake's "Message #n" refers to - it is the index into the student's
 * own turns, which is how the analysis was generated, so counting every turn
 * here would point a coach at the wrong message.
 */
function Turn({
  turn,
  messageNumber,
}: {
  turn: QuestionSessionTurn;
  messageNumber: number | null;
}) {
  const isStudent = turn.role === "user";
  return (
    <li
      className={cn(
        "rounded-lg border px-3.5 py-3",
        isStudent ? "border-primary/40 bg-primary/5" : "border-border/70 bg-background/40",
      )}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-semibold">{isStudent ? "Student" : "Maya"}</span>
        {isStudent && messageNumber != null && (
          <span className="font-mono text-[11px] text-muted-foreground">
            Message #{messageNumber}
          </span>
        )}
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
 * The evidence behind one English Writing session card: the chat as it happened,
 * and every mistake flagged in it - what the student wrote and what to write
 * instead.
 *
 * Everything shown is read straight from the stored record. A session that was
 * never finalised has no scores and no mistakes, and is said so rather than
 * being shown zeroes that read as a student who scored nothing.
 */
export function EnglishSessionDialog({
  sessionId,
  open,
  onOpenChange,
}: {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["english-session-evidence", sessionId],
    queryFn: () => getEnglishSessionEvidence(sessionId!),
    enabled: open && Boolean(sessionId),
  });

  const session = data?.session;
  const turns = session?.transcript ?? [];
  const mistakes = session?.mistakes ?? [];
  const analyzed = session?.finalized_at != null;
  // Student turns are numbered in the order the analysis counted them, so the
  // counter lives here rather than in the turn map below.
  let studentTurn = 0;
  const numberedTurns = turns.map((turn) => {
    if (turn.role !== "user") return { turn, messageNumber: null };
    studentTurn += 1;
    return { turn, messageNumber: studentTurn };
  });
  const writingScore = session?.scores?.["writing_score"] ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dash-panel max-h-[88vh] max-w-3xl gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-[15px] font-semibold leading-snug">
            {session?.title || "English writing session"}
          </DialogTitle>
          <DialogDescription className="mt-0.5 font-mono text-[11px]">
            {[data?.module_label, fmtDateTime(session?.created_at)]
              .filter((part) => part && part !== DASH)
              .join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-5 py-4">
          {isPending && (
            <p className="inline-flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading this writing…
            </p>
          )}

          {!isPending && error && (
            <div className="flex items-start gap-3 rounded-lg border border-border px-3.5 py-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-medium">Could not load this writing</p>
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
              {!analyzed && (
                <p className="flex items-start gap-2 rounded-lg border border-border bg-background/40 px-3.5 py-2.5 text-xs text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  This session was never finalised, so no analysis was generated for it. The chat
                  below is everything that was stored.
                </p>
              )}

              {analyzed && (
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="dash-mono-label">Writing score</span>
                    <span className="font-display text-2xl font-bold tabular-nums">
                      {writingScore != null ? writingScore : DASH}
                      <span className="text-sm font-normal text-muted-foreground">/100</span>
                    </span>
                  </div>
                  <div className="mt-2">
                    <Bar value={writingScore ?? 0} />
                  </div>
                  <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    {DIMENSIONS.map((dimension) => {
                      const value = session.scores?.[dimension.key] ?? null;
                      return (
                        <div key={dimension.key}>
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-xs text-muted-foreground">{dimension.label}</dt>
                            <dd className="font-mono text-xs font-medium tabular-nums">
                              {value != null ? value : DASH}
                            </dd>
                          </div>
                          <div className="mt-1">
                            <Bar value={value ?? 0} />
                          </div>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              )}

              <div>
                <p className="flex items-center justify-between gap-3">
                  <span className="dash-mono-label">What went wrong</span>
                  <Pill tone={mistakes.length ? "solid" : "muted"}>
                    <PenLine className="size-3" /> {mistakes.length}{" "}
                    {mistakes.length === 1 ? "correction" : "corrections"}
                  </Pill>
                </p>
                {mistakes.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted-foreground">
                    {analyzed
                      ? "No mistakes were flagged in this writing."
                      : "No corrections were stored for this session."}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {mistakes.map((mistake, index) => (
                      <MistakeCard key={`${mistake.turn_index}-${index}`} mistake={mistake} />
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="flex items-center justify-between gap-3">
                  <span className="dash-mono-label">The chat</span>
                  <Pill tone="muted">
                    <MessagesSquare className="size-3" /> {turns.length} turns
                  </Pill>
                </p>
                {turns.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted-foreground">
                    No conversation was stored for this session.
                  </p>
                ) : (
                  <ol className="mt-2 space-y-2">
                    {numberedTurns.map(({ turn, messageNumber }, index) => (
                      <Turn
                        key={index}
                        turn={turn}
                        messageNumber={messageNumber as number | null}
                      />
                    ))}
                  </ol>
                )}
              </div>

              {analyzed && FEEDBACK.some(({ key }) => (session[key] ?? "").trim()) && (
                <div>
                  <p className="dash-mono-label">Maya's feedback</p>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                    {FEEDBACK.map(({ key, label }) => (
                      <div
                        key={key}
                        className="rounded-lg border border-border/70 bg-background/40 px-3.5 py-3"
                      >
                        <dt className="flex items-center gap-2 text-xs font-semibold">
                          <BookOpenCheck className="size-3.5 text-muted-foreground" />
                          {label}
                        </dt>
                        <dd className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                          {(session[key] ?? "").trim() || DASH}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
