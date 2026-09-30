import { Link } from "@tanstack/react-router";
import { Phone, User, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { StudentRecord } from "@/lib/api";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "ST"
  );
}

/** One student under the help line, with their score on this specific pillar. */
export type PillarStudent = {
  student: StudentRecord;
  score: number;
};

/**
 * The students behind one axis of the skill radar.
 *
 * The radar answers "which skill is the batch weak at"; this answers "who", which
 * is the question the officer actually acts on. A pillar card is a dead end
 * without it - the officer sees "3 students under 50 on DSA" and has nowhere to
 * go from there.
 *
 * Only students who have a score on this pillar and are under the help line are
 * listed. A student with no score at all is a different problem - they have not
 * started practising - and mixing the two would make the roster disagree with the
 * count printed on the card that opened it.
 *
 * The score shown per row is the one from that pillar, not the composite
 * performance score: a student can be strong overall and still be the reason a
 * DSA axis is low, and printing the composite here would contradict the bar on
 * the card.
 *
 * The rows come from the student list the page has already loaded, so opening
 * this costs no extra request and the names are exactly the ones the rest of the
 * dashboard is showing.
 */
export function PillarStudentsDialog({
  pillar,
  students,
  needsHelpBelow,
  onClose,
}: {
  /** Full pillar name, e.g. "Data Structures & Algorithms". */
  pillar: string;
  /** Students under the help line on this pillar, already filtered. */
  students: PillarStudent[];
  /** The score line used on the card, repeated here for context. */
  needsHelpBelow: number;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Students needing help with ${pillar}`}
      onClick={onClose}
    >
      <div
        className="panel flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{pillar}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Scored under {needsHelpBelow} on this track and needing help.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrolls on its own so the header stays put: a weak batch on one track
            can be a long list, and the count above it must not scroll away. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {students.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No student is under {needsHelpBelow} on this track.
            </p>
          ) : (
            <ul className="space-y-2">
              {students.map(({ student, score }) => (
                <li
                  key={student.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background/40 px-3.5 py-3"
                >
                  <Avatar className="size-10 shrink-0 rounded-md">
                    {student.avatar ? (
                      <AvatarImage src={student.avatar} alt={student.full_name || "Student"} />
                    ) : null}
                    <AvatarFallback className="rounded-md bg-muted font-display text-xs font-bold text-muted-foreground">
                      {initials(student.full_name || "Student")}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {student.full_name || "Unnamed student"}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      {student.department && (
                        <span className="inline-flex items-center gap-1">
                          <User className="size-3 shrink-0" />
                          {student.department}
                        </span>
                      )}
                      {student.mobile_number ? (
                        <a
                          href={`tel:${student.mobile_number}`}
                          className="inline-flex items-center gap-1 font-mono hover:text-foreground"
                        >
                          <Phone className="size-3 shrink-0" />
                          {student.mobile_number}
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3 shrink-0" /> No number recorded
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="stat-num text-sm" title={`Scored ${score} on this track`}>
                      {score}
                    </span>
                    <Link
                      to="/student-data/$studentId"
                      params={{ studentId: student.id }}
                      onClick={onClose}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-accent"
                    >
                      View profile
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <p className="text-[11px] text-muted-foreground">
            {students.length} student{students.length === 1 ? "" : "s"} on this track
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
