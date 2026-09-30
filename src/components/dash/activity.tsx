import {
  BookOpenText,
  Calculator,
  Clock,
  Compass,
  Cpu,
  MessageCircle,
  MessagesSquare,
  Network,
  Puzzle,
  ScrollText,
  Star,
  Users,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import { Bar, Pill } from "@/components/dash/bits";
import type { ActivityModuleKey, ActivityModuleSummary, ActivitySession } from "@/lib/api";
import { cn } from "@/lib/utils";

export const DASH = "—";

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtScore(value: number | null | undefined) {
  if (value == null) return DASH;
  return value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
}

export function humanize(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function scoreTone(value: number | null | undefined) {
  if (value == null) return "muted";
  if (value >= 75) return "solid";
  return "outline";
}

const QUESTION_MODULES: ActivityModuleKey[] = [
  "aplr",
  "basic_math",
  "situational",
  "technical",
  "dsa",
];

function isQuestionModule(key: ActivityModuleKey) {
  return QUESTION_MODULES.includes(key);
}

/** One icon per practice module, so a row is recognisable before it is read. */
export const MODULE_ICONS: Record<ActivityModuleKey, ComponentType<{ className?: string }>> = {
  mock_interview: MessagesSquare,
  aplr: Puzzle,
  basic_math: Calculator,
  situational: Compass,
  technical: Cpu,
  dsa: Network,
  communication: MessageCircle,
  english: BookOpenText,
  gd: Users,
};

/** Averages are shown per module, so each summary only prints its own keys. */
export function summaryFacts(key: ActivityModuleKey, summary: ActivityModuleSummary) {
  const facts: { label: string; value: ReactNode }[] = [
    { label: "Sessions", value: fmtScore((summary as { sessions?: number }).sessions ?? 0) },
  ];

  if (key === "mock_interview") {
    const s = summary as { completed?: number; scored?: number; completion_rate?: number | null };
    facts.push(
      { label: "Completed", value: s.completed ?? 0 },
      { label: "Scored", value: s.scored ?? 0 },
      {
        label: "Completion rate",
        value: s.completion_rate != null ? `${s.completion_rate}%` : DASH,
      },
    );
  } else if (isQuestionModule(key)) {
    const s = summary as {
      solved?: number;
      gave_up?: number;
      active?: number;
      solve_rate?: number | null;
      avg_attempts?: number | null;
      avg_hints_used?: number | null;
      avg_points_awarded?: number | null;
      avg_star_rating?: number | null;
    };
    facts.push(
      { label: "Solved", value: s.solved ?? 0 },
      { label: "Gave up", value: s.gave_up ?? 0 },
      { label: "In progress", value: s.active ?? 0 },
      { label: "Solve rate", value: s.solve_rate != null ? `${s.solve_rate}%` : DASH },
      { label: "Avg attempts", value: fmtScore(s.avg_attempts) },
      { label: "Avg hints", value: fmtScore(s.avg_hints_used) },
      { label: "Avg points", value: fmtScore(s.avg_points_awarded) },
      { label: "Avg rating", value: fmtScore(s.avg_star_rating) },
    );
  } else {
    const s = summary as {
      analyzed?: number;
      avg_duration_minutes?: number | null;
      averages?: Record<string, number>;
      avg_score?: number | null;
      best_score?: number | null;
      latest_score?: number | null;
      first_score?: number | null;
    };
    facts.push({ label: "Analysed", value: s.analyzed ?? 0 });
    if (key === "gd") {
      facts.push({ label: "Avg minutes", value: fmtScore(s.avg_duration_minutes) });
    }
    facts.push(
      { label: "Average score", value: fmtScore(s.avg_score) },
      { label: "Best", value: fmtScore(s.best_score) },
      { label: "Latest", value: fmtScore(s.latest_score) },
      { label: "First", value: fmtScore(s.first_score) },
    );
    for (const [field, value] of Object.entries(s.averages ?? {})) {
      facts.push({ label: `Avg ${humanize(field).toLowerCase()}`, value: fmtScore(value) });
    }
  }

  return facts;
}

export function ModuleRow({
  moduleKey,
  label,
  summary,
  count,
  active,
  onSelect,
}: {
  moduleKey: ActivityModuleKey;
  label: string;
  summary: ActivityModuleSummary;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  const facts = summaryFacts(moduleKey, summary);
  const avg = (summary as { avg_score?: number | null }).avg_score;
  const Icon = MODULE_ICONS[moduleKey];
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          "flex w-full cursor-pointer items-start gap-3.5 rounded-lg border bg-card px-4 py-3.5 text-left transition-colors",
          active ? "border-primary" : "border-border hover:border-primary/50 hover:bg-accent/40",
        )}
      >
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="text-sm font-semibold">{label}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-display text-lg font-bold tabular-nums">
                {avg != null ? `${fmtScore(avg)}/100` : DASH}
              </span>
              <Pill tone={count ? "solid" : "muted"}>
                {count} session{count === 1 ? "" : "s"}
              </Pill>
            </span>
          </div>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {facts.map((fact) => (
              <div key={fact.label} className="flex items-baseline gap-1.5">
                <dt className="text-[11px] text-muted-foreground">{fact.label}</dt>
                <dd className="font-mono text-[11px] font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </button>
    </li>
  );
}

/**
 * How a mock interview's stored status reads on a card.
 *
 * `not_scored` is the status of an interview that ran to the end but was left
 * unscored for want of enough real answers to judge, so it is labelled
 * "Completed" here. Printing the stored status made a finished session read like
 * an abandoned one, which is the opposite of what happened; the score pill beside
 * it still says whether a number was ever published.
 */
const MOCK_STATUS_LABEL: Record<string, string> = {
  active: "In progress",
  completed: "Completed",
  not_scored: "Completed",
};

const MOCK_STATUS_NOTE: Record<string, string> = {
  not_scored: "Finished, but too few answers were given to publish a score.",
};

/** The status pill for one session, and why it reads that way when it needs saying. */
export function mockInterviewStatusMeta(status: string) {
  return {
    label: MOCK_STATUS_LABEL[status] ?? (status ? humanize(status) : DASH),
    note: MOCK_STATUS_NOTE[status] ?? "",
  };
}

export function sessionStatus(session: ActivitySession) {
  if (session.module === "mock_interview") {
    return mockInterviewStatusMeta(session.status ?? "");
  }
  const raw = session.status ?? "";
  return { label: raw ? humanize(raw) : DASH, note: "" };
}

export function sessionFacts(session: ActivitySession) {
  const facts: { label: string; value: ReactNode }[] = [];
  const add = (label: string, value: unknown) => {
    if (value == null || value === "") return;
    facts.push({ label, value: typeof value === "number" ? fmtScore(value) : String(value) });
  };
  // Neither Company nor Role gets a fact row: the mock-interview title is built
  // as "company · role", so both are already the heading of the card and
  // printing them again below says the same thing twice on one card.
  //
  // The category is stored as a slug ("workplace_conflict"), so it goes through
  // `humanize` rather than being printed raw: an underscore on a placement
  // officer's card is a column name leaking through, not a label they can act on.
  if (session.category) add("Category", humanize(session.category));
  if (session.attempts != null) add("Attempts", session.attempts);
  if (session.hints_used) add("Hints used", session.hints_used);
  if (session.points_awarded) add("Points", session.points_awarded);
  if (session.star_rating) add("Rating", session.star_rating);
  if (session.scored_dimensions) add("Scored dimensions", session.scored_dimensions);
  if (session.communication_score != null) add("Communication", session.communication_score);
  // English is the one module that gets neither Writing nor Finalised. The score
  // is already one of the Scores chips below this grid - printing it twice, once
  // as a fact and once as a chip, said the same thing on the same card - and
  // "finalised" is when the analysis was generated, not when the student
  // practised, which the timestamp in the card header already covers. Both were
  // carrying no information the card did not already show.
  if (session.writing_score != null && session.module !== "english") {
    add("Writing", session.writing_score);
  }
  if (session.solved_at) add("Solved at", fmtDateTime(session.solved_at));
  if (session.finalized_at && session.module !== "english") {
    add("Finalised", fmtDateTime(session.finalized_at));
  }
  if (session.ended_at) add("Ended", fmtDateTime(session.ended_at));
  return facts;
}

/**
 * The evidence for one practice session: when it ran, how it ended, and every
 * number the platform scored it on. Shown on the per-module history page.
 *
 * `studentId` is only needed by the mock-interview module, whose cards carry an
 * Evidence button that opens the stored transcript of that one interview. Without
 * it the card simply shows no button.
 *
 /**
 * `onOpenDetail` opens the stored evidence for a session as a modal, and only
 * applies to the modules that hold it: the five question modules - APLR, Basic
 * Math, Situational, Technical and DSA - and English Writing. A card in those
 * modules is a whole attempt rather than a number, so clicking it should read
 * what was asked, what the student replied and what the right answer was; for
 * English that is the chat plus every correction Maya flagged. When it is passed
 * the card itself becomes the button.
 */
export function SessionRow({
  session,
  studentId,
  onOpenDetail,
}: {
  session: ActivitySession;
  studentId?: string;
  onOpenDetail?: (session: ActivitySession) => void;
}) {
  const facts = sessionFacts(session);
  const scores = Object.entries(session.scores ?? {}).filter(([, value]) => value != null);
  const criteria = session.criteria ?? [];
  const status = sessionStatus(session);
  const canOpenEvidence = session.module === "mock_interview" && Boolean(studentId);
  const canOpenDetail =
    Boolean(onOpenDetail) && (isQuestionModule(session.module) || session.module === "english");
  const card = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{session.title || "Untitled session"}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" /> {fmtDateTime(session.created_at)}
            </span>
            {session.module === "mock_interview" && session.message_count != null && (
              <span className="inline-flex items-center gap-1">
                <MessagesSquare className="size-3" /> {session.message_count} messages
              </span>
            )}
            {(session.duration_minutes ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" /> {session.duration_minutes} min
              </span>
            )}
            {session.duration && (
              <span className="inline-flex items-center gap-1">
                {/* Stored lowercase ("standard"); capitalised so it reads as the
                    length label it is, sitting beside real nouns. */}
                <Clock className="size-3" /> {humanize(session.duration)}
              </span>
            )}
            {/* Panelists are deliberately not printed: the ids are our internal personas
                (atlas, maya, carl and friends), not people the coach can act on,
                so a row of them reads as noise next to the real numbers. */}
            {criteria.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3" /> {session.grade ?? DASH}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span title={status.note || undefined}>
            <Pill tone="muted">{status.label}</Pill>
          </span>
          <Pill tone={scoreTone(session.overall_score)}>
            {session.overall_score != null
              ? `${fmtScore(session.overall_score)}/100`
              : "Not scored"}
          </Pill>
          {canOpenEvidence && (
            <Link
              to="/student-interview-evidence/$studentId/$interviewId"
              params={{ studentId: studentId!, interviewId: session.id }}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background transition-opacity hover:opacity-90"
            >
              <ScrollText className="size-3.5" /> Evidence
            </Link>
          )}
          {/* Spelled out beside the status rather than left to the whole-card
              hover: the card reads as a record, and nothing on it otherwise
              says the evidence behind it is one click away. */}
          {canOpenDetail && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background">
              <ScrollText className="size-3.5" /> Open
            </span>
          )}
        </div>
      </div>

      {session.overall_score != null && (
        <div className="mt-3">
          <Bar value={session.overall_score} />
        </div>
      )}

      {facts.length > 0 && (
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-border/60 pt-2.5 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 items-baseline gap-2">
              <dt className="shrink-0 text-[11px] text-muted-foreground">{fact.label}</dt>
              {/* Left-aligned, not right. Values are words of uneven length
                  (a role, a band, a timestamp), and right-aligning them in a
                  narrow column stops the eye scanning down a clean left edge. */}
              <dd className="min-w-0 truncate text-sm font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {criteria.length > 0 && (
        <div className="mt-2.5 border-t border-border/60 pt-2.5">
          <p className="dash-mono-label">Criteria</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {criteria.map((criterion) => (
              <span
                key={criterion.label}
                className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {criterion.label}: {fmtScore(criterion.score)}
              </span>
            ))}
          </div>
        </div>
      )}

      {scores.length > 0 && (
        <div className="mt-2.5 border-t border-border/60 pt-2.5">
          <p className="dash-mono-label">Scores</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {scores.map(([field, value]) => (
              <span
                key={field}
                className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {humanize(field)}: {fmtScore(value)}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );

  if (canOpenDetail) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onOpenDetail?.(session)}
          className="w-full cursor-pointer rounded-lg border border-border/70 bg-card px-4 py-3.5 text-left transition-colors hover:border-primary/50 hover:bg-accent/30"
        >
          {card}
        </button>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-border/70 bg-card px-4 py-3.5 transition-shadow hover:shadow-sm">
      {card}
    </li>
  );
}
