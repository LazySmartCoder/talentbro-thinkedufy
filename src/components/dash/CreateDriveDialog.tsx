import { useEffect, useState, type FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createDrive,
  getCompanies,
  updateDrive,
  type DriveCreatePayload,
  type PlacementCompany,
  type PlacementDrive,
} from "@/lib/api";

const WORK_MODES = [
  ["onsite", "On-site"],
  ["hybrid", "Hybrid"],
  ["remote", "Remote"],
  ["field", "Field / Outside"],
] as const;

const DRIVE_MODES = [
  ["campus", "On Campus"],
  ["virtual", "Virtual Drive"],
  ["off_campus", "Off Campus"],
] as const;

const STATUSES = [
  ["upcoming", "Upcoming"],
  ["ongoing", "Active / Ongoing"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
] as const;

const PLACEMENT_MODES = [
  ["full_time", "Full-time"],
  ["internship_ppo", "Internship + PPO"],
  ["contract", "Contract"],
] as const;

const OFFER_STATUSES = [
  ["pending", "Pending"],
  ["offered", "Offered"],
  ["on_hold", "On Hold"],
  ["revoked", "Revoked"],
] as const;

const EMPTY = {
  company: "",
  title: "",
  role: "",
  total_vacancies: "",
  drive_mode: "campus",
  status: "upcoming",
  visit_date: "",
  application_deadline: "",
  work_mode: "onsite",
  work_location: "",
  salary_min: "",
  salary_max: "",
  eligible_branches: "",
  eligible_courses: "",
  minimum_cgpa: "",
  maximum_backlogs: "",
  graduation_year: "",
  required_skills: "",
  preferred_skills: "",
  selection_rounds: "",
  placement_mode: "full_time",
  offer_status: "pending",
};

type Draft = typeof EMPTY;

// exactOptionalPropertyTypes is on, so reading an optional key off the payload
// type yields `T | undefined`. NonNullable pins the cast to the real union.
type Choice = {
  [K in "drive_mode" | "status" | "work_mode" | "placement_mode" | "offer_status"]: NonNullable<
    DriveCreatePayload[K]
  >;
};

const csvList = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));

/** An ISO date down to the `yyyy-mm-dd` an `<input type="date">` expects. */
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * Prefill the form from a drive already on record.
 *
 * `status` is the card's display label ("Live" / "Upcoming" / ...) rather than
 * the stored key, so it is mapped back. `stored_status` carries the key itself
 * and is preferred where the server sent it: the label is derived (a visit
 * happening today reads Live while the row still says upcoming), so prefilling
 * from it would silently overwrite the field on an unrelated save.
 * `mode` is the work mode, while `drive_mode` is the separate
 * campus/virtual/off-campus choice.
 */
function draftFromDrive(d: PlacementDrive): Draft {
  const statusBack: Record<string, Draft["status"]> = {
    Live: "ongoing",
    Upcoming: "upcoming",
    Completed: "completed",
    Cancelled: "cancelled",
  };
  const stored = d.stored_status as Draft["status"] | undefined;
  return {
    company: String(d.company_id),
    title: d.title,
    role: d.role,
    total_vacancies: d.total_vacancies != null ? String(d.total_vacancies) : "",
    drive_mode: (d.drive_mode as Draft["drive_mode"]) ?? "campus",
    status: stored ?? statusBack[d.status] ?? "upcoming",
    visit_date: toDateInput(d.campus_visit_date),
    application_deadline: toDateInput(d.application_deadline),
    work_mode: (d.mode as Draft["work_mode"]) ?? "onsite",
    work_location: d.location,
    salary_min: d.ctc_min != null ? String(d.ctc_min) : "",
    salary_max: d.ctc_max != null ? String(d.ctc_max) : "",
    eligible_branches: d.eligible_branches.join(", "),
    eligible_courses: d.eligible_courses.join(", "),
    minimum_cgpa: d.minimum_cgpa != null ? String(d.minimum_cgpa) : "",
    maximum_backlogs: d.maximum_backlogs != null ? String(d.maximum_backlogs) : "",
    graduation_year: d.graduation_year != null ? String(d.graduation_year) : "",
    required_skills: d.required_skills.join(", "),
    preferred_skills: d.preferred_skills.join(", "),
    selection_rounds: d.selection_rounds.join(", "),
    placement_mode: (d.placement_mode as Draft["placement_mode"]) ?? "full_time",
    offer_status: (d.offer_status as Draft["offer_status"]) ?? "pending",
  };
}

const inputCls =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20";

/**
 * Schedule or amend one placement drive against a company that is already
 * registered.
 *
 * A company is registered on its own; everything in here describes a single
 * visit — the one role being hired for, the dates, the selection rounds and
 * where the offer stands — so the same recruiter can be registered for years
 * before hiring, and can run a fresh drive on new terms afterwards. One role per
 * drive: to open a second role, schedule a second drive.
 *
 * Passing `editing` turns the same form into an amendment of a drive already on
 * record. The company picker is replaced by a read-only name, because a drive's
 * company is its identity — moving a visit to a different recruiter is a
 * different operation from changing its terms.
 */
export function CreateDriveDialog({
  companies,
  onClose,
  onCreated,
  editing = null,
  onUpdated,
}: {
  companies: PlacementCompany[];
  onClose: () => void;
  onCreated: (drive: PlacementDrive) => void;
  editing?: PlacementDrive | null;
  onUpdated?: (drive: PlacementDrive) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => (editing ? draftFromDrive(editing) : EMPTY));
  const [saving, setSaving] = useState(false);
  const isEdit = editing !== null;

  // Companies arrive with the dialog so the picker is populated the moment it
  // opens. If the caller has none loaded yet, fetch them here.
  const [options, setOptions] = useState<PlacementCompany[]>(companies);
  useEffect(() => {
    setOptions(companies);
  }, [companies]);

  useEffect(() => {
    if (companies.length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await getCompanies();
        if (!cancelled) setOptions(data.companies);
      } catch {
        // The picker simply stays empty; the user can still close and retry.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companies.length]);

  // Naming the drive after the company is the common case, so seed the title as
  // soon as one is picked — the user can always overwrite it. On an edit the
  // title is already the drive's own, so it counts as touched from the start.
  const [titleTouched, setTitleTouched] = useState(isEdit);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const onPickCompany = (pk: string) => {
    const picked = options.find((c) => String(c.id) === pk);
    setDraft((prev) => ({
      ...prev,
      company: pk,
      title: titleTouched ? prev.title : picked ? `${picked.company_name} Drive` : prev.title,
      work_location: picked?.work_location || prev.work_location,
      salary_min: picked?.salary_min != null ? String(picked.salary_min) : prev.salary_min,
      salary_max: picked?.salary_max != null ? String(picked.salary_max) : prev.salary_max,
      minimum_cgpa: picked?.minimum_cgpa != null ? String(picked.minimum_cgpa) : prev.minimum_cgpa,
      eligible_branches: prev.eligible_branches || picked?.eligible_branches.join(", ") || "",
    }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || (!isEdit && (!draft.company || !draft.title.trim()))) return;
    if (isEdit && !draft.title.trim()) return;
    setSaving(true);
    try {
      const fields = {
        title: draft.title.trim(),
        role: draft.role.trim(),
        total_vacancies: numberOrNull(draft.total_vacancies),
        drive_mode: draft.drive_mode as Choice["drive_mode"],
        status: draft.status as Choice["status"],
        visit_date: draft.visit_date || null,
        application_deadline: draft.application_deadline || null,
        work_mode: draft.work_mode as Choice["work_mode"],
        work_location: draft.work_location.trim(),
        salary_min: numberOrNull(draft.salary_min),
        salary_max: numberOrNull(draft.salary_max),
        eligible_branches: csvList(draft.eligible_branches),
        eligible_courses: csvList(draft.eligible_courses),
        minimum_cgpa: numberOrNull(draft.minimum_cgpa),
        maximum_backlogs: numberOrNull(draft.maximum_backlogs),
        graduation_year: numberOrNull(draft.graduation_year),
        required_skills: csvList(draft.required_skills),
        preferred_skills: csvList(draft.preferred_skills),
        selection_rounds: csvList(draft.selection_rounds),
        placement_mode: draft.placement_mode as Choice["placement_mode"],
        offer_status: draft.offer_status as Choice["offer_status"],
      };
      if (editing) {
        const saved = await updateDrive(editing.drive_id, fields);
        toast.success(`Updated ${saved.title}`);
        onUpdated?.(saved);
        onClose();
        return;
      }
      const created = await createDrive({
        ...fields,
        company: Number(draft.company),
      });
      toast.success(`Scheduled ${created.title}`);
      onCreated(created);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the drive.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center">
      <div className="panel max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <form onSubmit={submit}>
          <div className="flex items-start justify-between border-b border-border px-6 py-5">
            <div>
              <h2 className="text-lg font-bold">
                {isEdit ? "Edit placement drive" : "Schedule a placement drive"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {isEdit
                  ? "Amend the terms of this visit. The company stays as it is."
                  : "Pick a registered company, then record what this particular visit offers."}
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
            <div>
              <label className="mono-label" htmlFor="dc-company">
                Company
              </label>
              {isEdit ? (
                <>
                  <div
                    id="dc-company"
                    className={`${inputCls} mt-1.5 cursor-not-allowed bg-muted text-muted-foreground`}
                  >
                    {editing.company_name}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    A drive belongs to the company it was created for and can&apos;t be moved.
                  </p>
                </>
              ) : (
                <>
                  <select
                    id="dc-company"
                    required
                    value={draft.company}
                    onChange={(e) => onPickCompany(e.target.value)}
                    className={`${inputCls} mt-1.5`}
                  >
                    <option value="">Select a registered company…</option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name}
                      </option>
                    ))}
                  </select>
                  {options.length === 0 && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      No companies registered yet — add one on the Companies page first.
                    </p>
                  )}
                </>
              )}
            </div>
            <div>
              <label className="mono-label" htmlFor="dc-title">
                Drive title
              </label>
              <input
                id="dc-title"
                required
                value={draft.title}
                onChange={(e) => {
                  setTitleTouched(true);
                  set("title", e.target.value);
                }}
                placeholder="e.g. TCS Campus Drive 2026"
                className={`${inputCls} mt-1.5`}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mono-label" htmlFor="dc-role">
                Job role
              </label>
              <input
                id="dc-role"
                value={draft.role}
                onChange={(e) => set("role", e.target.value)}
                placeholder="Software Engineer"
                className={`${inputCls} mt-1.5`}
              />
            </div>

            <div>
              <label className="mono-label" htmlFor="dc-status">
                Recruitment status
              </label>
              <select
                id="dc-status"
                value={draft.status}
                onChange={(e) => set("status", e.target.value)}
                className={`${inputCls} mt-1.5`}
              >
                {STATUSES.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mono-label" htmlFor="dc-drive-mode">
                Drive type
              </label>
              <select
                id="dc-drive-mode"
                value={draft.drive_mode}
                onChange={(e) => set("drive_mode", e.target.value)}
                className={`${inputCls} mt-1.5`}
              >
                {DRIVE_MODES.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mono-label" htmlFor="dc-visit">
                Campus visit date
              </label>
              <input
                id="dc-visit"
                type="date"
                value={draft.visit_date}
                onChange={(e) => set("visit_date", e.target.value)}
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="mono-label" htmlFor="dc-deadline">
                Application deadline
              </label>
              <input
                id="dc-deadline"
                type="date"
                value={draft.application_deadline}
                onChange={(e) => set("application_deadline", e.target.value)}
                className={`${inputCls} mt-1.5`}
              />
            </div>

            <div>
              <label className="mono-label" htmlFor="dc-work-mode">
                Work mode
              </label>
              <select
                id="dc-work-mode"
                value={draft.work_mode}
                onChange={(e) => set("work_mode", e.target.value)}
                className={`${inputCls} mt-1.5`}
              >
                {WORK_MODES.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mono-label" htmlFor="dc-location">
                Work location
              </label>
              <input
                id="dc-location"
                value={draft.work_location}
                onChange={(e) => set("work_location", e.target.value)}
                placeholder="Defaults to the company's location"
                className={`${inputCls} mt-1.5`}
              />
            </div>

            <div>
              <label className="mono-label" htmlFor="dc-salary-min">
                CTC min (LPA)
              </label>
              <input
                id="dc-salary-min"
                type="number"
                min="0"
                step="0.1"
                value={draft.salary_min}
                onChange={(e) => set("salary_min", e.target.value)}
                placeholder="Defaults to company band"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="mono-label" htmlFor="dc-salary-max">
                CTC max (LPA)
              </label>
              <input
                id="dc-salary-max"
                type="number"
                min="0"
                step="0.1"
                value={draft.salary_max}
                onChange={(e) => set("salary_max", e.target.value)}
                placeholder="Defaults to company band"
                className={`${inputCls} mt-1.5`}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mono-label" htmlFor="dc-rounds">
                Selection rounds
              </label>
              <input
                id="dc-rounds"
                value={draft.selection_rounds}
                onChange={(e) => set("selection_rounds", e.target.value)}
                placeholder="Aptitude Test, Technical Interview, HR Round"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mono-label" htmlFor="dc-required">
                Required skills
              </label>
              <input
                id="dc-required"
                value={draft.required_skills}
                onChange={(e) => set("required_skills", e.target.value)}
                placeholder="Java, SQL, DSA (comma separated)"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mono-label" htmlFor="dc-preferred">
                Preferred skills
              </label>
              <input
                id="dc-preferred"
                value={draft.preferred_skills}
                onChange={(e) => set("preferred_skills", e.target.value)}
                placeholder="Spring Boot, AWS (comma separated)"
                className={`${inputCls} mt-1.5`}
              />
            </div>

            <div>
              <label className="mono-label" htmlFor="dc-branches">
                Eligible branches
              </label>
              <input
                id="dc-branches"
                value={draft.eligible_branches}
                onChange={(e) => set("eligible_branches", e.target.value)}
                placeholder="Defaults to company — blank for all"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="mono-label" htmlFor="dc-courses">
                Eligible courses
              </label>
              <input
                id="dc-courses"
                value={draft.eligible_courses}
                onChange={(e) => set("eligible_courses", e.target.value)}
                placeholder="Blank for all"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="mono-label" htmlFor="dc-cgpa">
                Min CGPA
              </label>
              <input
                id="dc-cgpa"
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={draft.minimum_cgpa}
                onChange={(e) => set("minimum_cgpa", e.target.value)}
                placeholder="Defaults to company"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="mono-label" htmlFor="dc-backlogs">
                Max backlogs
              </label>
              <input
                id="dc-backlogs"
                type="number"
                min="0"
                value={draft.maximum_backlogs}
                onChange={(e) => set("maximum_backlogs", e.target.value)}
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="mono-label" htmlFor="dc-batch">
                Batch year
              </label>
              <input
                id="dc-batch"
                type="number"
                value={draft.graduation_year}
                onChange={(e) => set("graduation_year", e.target.value)}
                placeholder="e.g. 2026"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="mono-label" htmlFor="dc-vacancies">
                Total vacancies
              </label>
              <input
                id="dc-vacancies"
                type="number"
                min="0"
                value={draft.total_vacancies}
                onChange={(e) => set("total_vacancies", e.target.value)}
                placeholder="Blank to fill later"
                className={`${inputCls} mt-1.5`}
              />
            </div>

            <div>
              <label className="mono-label" htmlFor="dc-placement-mode">
                Placement mode
              </label>
              <select
                id="dc-placement-mode"
                value={draft.placement_mode}
                onChange={(e) => set("placement_mode", e.target.value)}
                className={`${inputCls} mt-1.5`}
              >
                {PLACEMENT_MODES.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mono-label" htmlFor="dc-offer-status">
                Offer status
              </label>
              <select
                id="dc-offer-status"
                value={draft.offer_status}
                onChange={(e) => set("offer_status", e.target.value)}
                className={`${inputCls} mt-1.5`}
              >
                {OFFER_STATUSES.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
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
              disabled={saving || !draft.title.trim() || (!isEdit && !draft.company)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {saving ? "Saving…" : isEdit ? "Save changes" : "Schedule drive"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
