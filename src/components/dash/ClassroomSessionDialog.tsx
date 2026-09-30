import { useMemo, useState, type FormEvent } from "react";
import { CalendarPlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  addClassroomLDSession,
  type ClassroomLDSession,
  type ClassroomLDSessionPayload,
} from "@/lib/api";

const inputCls =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20";

const EMPTY = {
  topic: "",
  agenda: "",
  venue: "",
  department: "",
  faculty_name: "",
  starts_at: "",
  ends_at: "",
};

type Draft = typeof EMPTY;

/**
 * `datetime-local` wants `YYYY-MM-DDTHH:mm` in the browser's own timezone and
 * sends nothing else. Left alone, `new Date("2026-10-04T10:00")` would be read
 * as UTC, so a session typed for 10am would land a few hours off wherever the
 * machine's zone sits. This is the inverse: read the field's own wall-clock
 * reading and say so, letting the browser attach the offset.
 */
function toIso(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Schedule one classroom L&D session.
 *
 * Only `topic` and the two times are required: venue, department and faculty are
 * often not settled when a session is put on the calendar, and a half-filled
 * row that exists is more useful than one blocked on a form nobody has finished.
 */
export function ClassroomSessionDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (session: ClassroomLDSession) => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const startIso = useMemo(() => toIso(draft.starts_at), [draft.starts_at]);
  const endIso = useMemo(() => toIso(draft.ends_at), [draft.ends_at]);

  // Only complain once a start has been typed, so an untouched form is not red
  // before the officer has decided on a day.
  const endError =
    !draft.ends_at || !startIso || !endIso
      ? null
      : new Date(endIso) <= new Date(startIso)
        ? "The session must end after it starts."
        : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || endError) return;
    if (!startIso || !endIso) {
      toast.error("Enter both a start time and an end time.");
      return;
    }
    setSaving(true);
    try {
      const payload: ClassroomLDSessionPayload = {
        topic: draft.topic.trim(),
        agenda: draft.agenda.trim(),
        venue: draft.venue.trim(),
        department: draft.department.trim(),
        faculty_name: draft.faculty_name.trim(),
        starts_at: startIso,
        ends_at: endIso,
      };
      const res = await addClassroomLDSession(payload);
      onAdded(res.session);
      toast.success(`Scheduled ${res.session.topic}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not schedule the session.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center">
      <div className="panel max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <form onSubmit={submit}>
          <div className="flex items-start justify-between border-b border-border px-6 py-5">
            <div>
              <h2 className="text-lg font-bold">Schedule a classroom session</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                It shows on your L&amp;D board under upcoming, and moves to done once it finishes.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mono-label" htmlFor="cs-topic">
                Topic
              </label>
              <input
                id="cs-topic"
                required
                value={draft.topic}
                onChange={(e) => set("topic", e.target.value)}
                placeholder="e.g. Aptitude mock test and review"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mono-label" htmlFor="cs-agenda">
                Agenda
              </label>
              <textarea
                id="cs-agenda"
                rows={3}
                value={draft.agenda}
                onChange={(e) => set("agenda", e.target.value)}
                placeholder="What the session covers, in order"
                className="mt-1.5 w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <div>
              <label className="mono-label" htmlFor="cs-start">
                Starts at
              </label>
              <input
                id="cs-start"
                type="datetime-local"
                required
                value={draft.starts_at}
                onChange={(e) => set("starts_at", e.target.value)}
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="mono-label" htmlFor="cs-end">
                Ends at
              </label>
              <input
                id="cs-end"
                type="datetime-local"
                required
                value={draft.ends_at}
                aria-invalid={endError ? true : undefined}
                onChange={(e) => set("ends_at", e.target.value)}
                className={`${inputCls} mt-1.5 ${
                  endError ? "border-destructive focus:ring-destructive/20" : ""
                }`}
              />
              {endError && <p className="mt-1.5 text-[11px] text-destructive">{endError}</p>}
            </div>
            <div>
              <label className="mono-label" htmlFor="cs-venue">
                Venue
              </label>
              <input
                id="cs-venue"
                value={draft.venue}
                onChange={(e) => set("venue", e.target.value)}
                placeholder="e.g. Seminar Hall B"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="mono-label" htmlFor="cs-department">
                Department
              </label>
              <input
                id="cs-department"
                value={draft.department}
                onChange={(e) => set("department", e.target.value)}
                placeholder="e.g. CSE, or leave for all"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mono-label" htmlFor="cs-faculty">
                Faculty
              </label>
              <input
                id="cs-faculty"
                value={draft.faculty_name}
                onChange={(e) => set("faculty_name", e.target.value)}
                placeholder="Who is taking it"
                className={`${inputCls} mt-1.5`}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3.5 py-2 text-xs font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || endError !== null}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CalendarPlus className="size-3.5" />
              )}
              {saving ? "Scheduling…" : "Schedule session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
