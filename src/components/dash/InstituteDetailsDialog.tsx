import { useState, type FormEvent } from "react";
import {
  AtSign,
  Building,
  Globe,
  GraduationCap,
  Hash,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Save,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/dash/bits";
import {
  updateInstitution,
  type DashboardInstitution,
  type InstitutionUpdatePayload,
} from "@/lib/api";

const inputCls =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20";

/**
 * The college record behind these dashboards, viewable and correctable.
 *
 * The header used to carry a single institution-type chip, which told the
 * placement officer nothing they did not already know about their own college.
 * Everything on record lives here instead.
 *
 * Two things are deliberate:
 *
 * - Read-only by default. The common case is "what is our address", and opening
 *   a form to answer that invites accidental edits to the college's legal
 *   record. Editing is a mode you switch into and switch out of.
 * - Master-only writes. A Beta account is read-only across the placement cell,
 *   so the save is refused by the server. `canEdit` hides the button for those
 *   accounts rather than offering a control that can only ever fail.
 */
export function InstituteDetailsDialog({
  institution,
  canEdit,
  onClose,
}: {
  institution: DashboardInstitution;
  /** Whether this account may save changes. False hides the edit button. */
  canEdit: boolean;
  /** Called with the server's copy of the record after a successful save. */
  onClose: (updated?: DashboardInstitution) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<InstitutionUpdatePayload>(() => ({
    name: institution.name,
    institution_type: institution.institution_type,
    placement_department_name: institution.placement_department_name,
    placement_office_email: institution.placement_office_email,
    address: institution.address,
    city: institution.city,
    state: institution.state,
    pin_code: institution.pin_code,
    approximate_student_strength: institution.approximate_student_strength ?? undefined,
    courses_offered: institution.courses_offered,
    departments: institution.departments,
  }));

  // Every field the institution record holds gets its own row, so the dialog is
  // a complete copy of the record rather than a highlight reel. Address, city,
  // state and PIN are split apart for the same reason: joined into one line they
  // read as a sentence and none of them can be pointed at individually.
  const rows = [
    {
      icon: Landmark,
      label: "Institution type",
      value: institution.institution_type,
      link: false,
    },
    { icon: Building, label: "College name", value: institution.name, link: false },
    {
      icon: Building,
      label: "Placement department",
      value: institution.placement_department_name,
      link: false,
    },
    {
      icon: Mail,
      label: "Placement office email",
      value: institution.placement_office_email,
      link: false,
    },
    { icon: AtSign, label: "Email domain", value: institution.email_domain, link: false },
    { icon: Globe, label: "Website", value: institution.website, link: true },
    { icon: MapPin, label: "Campus address", value: institution.address, link: false },
    { icon: MapPin, label: "City", value: institution.city, link: false },
    { icon: MapPin, label: "State", value: institution.state, link: false },
    { icon: Hash, label: "PIN code", value: institution.pin_code, link: false },
    {
      icon: Users,
      label: "Student strength",
      value:
        institution.approximate_student_strength != null
          ? institution.approximate_student_strength.toLocaleString("en-IN")
          : "",
      link: false,
    },
  ].filter((row) => row.value);

  const set = <K extends keyof InstitutionUpdatePayload>(
    key: K,
    value: InstitutionUpdatePayload[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  function leaveEditMode() {
    // Discard rather than keep: a half-typed edit left behind would be the
    // state the next "Edit" press starts from, which is never what anyone wants.
    setEditing(false);
    setDraft({
      name: institution.name,
      institution_type: institution.institution_type,
      placement_department_name: institution.placement_department_name,
      placement_office_email: institution.placement_office_email,
      address: institution.address,
      city: institution.city,
      state: institution.state,
      pin_code: institution.pin_code,
      approximate_student_strength: institution.approximate_student_strength ?? undefined,
      courses_offered: institution.courses_offered,
      departments: institution.departments,
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const updated = await updateInstitution(draft);
      // The page owns the record; hand back the server's version so every panel
      // on it re-reads the same values rather than a locally-guessed copy.
      onClose(updated);
      toast.success("Institute details updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the college record.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${institution.name} details`}
      onClick={() => onClose()}
    >
      {/* max-h keeps the panel inside the viewport: the college runs to a dozen
          rows plus two lists of tags, so on a short screen it would otherwise
          run off the bottom with no way to reach the footer buttons. */}
      <div
        className="panel flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{institution.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The college this dashboard belongs to.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canEdit && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Pencil className="size-3" /> Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => onClose()}
              aria-label="Close"
              className="rounded-md p-1 hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* The body scrolls on its own so the header and the footer buttons stay
            put, rather than the whole panel scrolling under the overlay. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {editing ? (
            <form id="institute-details-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mono-label" htmlFor="id-name">
                  College name
                </label>
                <input
                  id="id-name"
                  required
                  value={draft.name ?? ""}
                  onChange={(e) => set("name", e.target.value)}
                  className={`${inputCls} mt-1.5`}
                />
              </div>
              <div>
                <label className="mono-label" htmlFor="id-type">
                  Institution type
                </label>
                <select
                  id="id-type"
                  required
                  value={draft.institution_type ?? ""}
                  onChange={(e) => set("institution_type", e.target.value)}
                  className={`${inputCls} mt-1.5 cursor-pointer`}
                >
                  {/* A college whose stored type predates this catalogue still
                      shows its own value rather than silently reading as blank. */}
                  {draft.institution_type &&
                    !INSTITUTION_TYPES.includes(draft.institution_type) && (
                      <option value={draft.institution_type}>{draft.institution_type}</option>
                    )}
                  {INSTITUTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mono-label" htmlFor="id-department">
                  Placement department
                </label>
                <input
                  id="id-department"
                  required
                  value={draft.placement_department_name ?? ""}
                  onChange={(e) => set("placement_department_name", e.target.value)}
                  className={`${inputCls} mt-1.5`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mono-label" htmlFor="id-address">
                  Campus address
                </label>
                <textarea
                  id="id-address"
                  required
                  rows={2}
                  value={draft.address ?? ""}
                  onChange={(e) => set("address", e.target.value)}
                  className={`${inputCls} h-auto w-full resize-y py-2`}
                />
              </div>
              <div>
                <label className="mono-label" htmlFor="id-city">
                  City
                </label>
                <input
                  id="id-city"
                  required
                  value={draft.city ?? ""}
                  onChange={(e) => set("city", e.target.value)}
                  className={`${inputCls} mt-1.5`}
                />
              </div>
              <div>
                <label className="mono-label" htmlFor="id-state">
                  State
                </label>
                <input
                  id="id-state"
                  required
                  value={draft.state ?? ""}
                  onChange={(e) => set("state", e.target.value)}
                  className={`${inputCls} mt-1.5`}
                />
              </div>
              <div>
                <label className="mono-label" htmlFor="id-pin">
                  PIN code
                </label>
                <input
                  id="id-pin"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  value={draft.pin_code ?? ""}
                  onChange={(e) => set("pin_code", e.target.value)}
                  className={`${inputCls} mt-1.5`}
                />
              </div>
              <div>
                <label className="mono-label" htmlFor="id-strength">
                  Student strength
                </label>
                <input
                  id="id-strength"
                  inputMode="numeric"
                  value={draft.approximate_student_strength ?? ""}
                  onChange={(e) =>
                    set(
                      "approximate_student_strength",
                      e.target.value === "" ? undefined : Number(e.target.value),
                    )
                  }
                  className={`${inputCls} mt-1.5`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mono-label" htmlFor="id-office-email">
                  Placement office email
                </label>
                <input
                  id="id-office-email"
                  type="email"
                  required
                  value={draft.placement_office_email ?? ""}
                  onChange={(e) => set("placement_office_email", e.target.value)}
                  className={`${inputCls} mt-1.5`}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mono-label" htmlFor="id-courses">
                  Courses offered
                </label>
                <input
                  id="id-courses"
                  value={(draft.courses_offered ?? []).join(", ")}
                  onChange={(e) =>
                    set(
                      "courses_offered",
                      e.target.value
                        .split(",")
                        .map((c) => c.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="B.Tech, MBA, M.Tech"
                  className={`${inputCls} mt-1.5`}
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Comma separated, and each name must match the catalogue the server accepts.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="mono-label" htmlFor="id-departments">
                  Departments
                </label>
                <input
                  id="id-departments"
                  value={(draft.departments ?? []).join(", ")}
                  onChange={(e) =>
                    set(
                      "departments",
                      e.target.value
                        .split(",")
                        .map((d) => d.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="Computer Science, Electronics"
                  className={`${inputCls} mt-1.5`}
                />
              </div>
            </form>
          ) : (
            <>
              <ul className="space-y-3">
                {rows.map(({ icon: Icon, label, value, link }) => (
                  <li key={label} className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
                      <Icon className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="mono-label">{label}</p>
                      {link ? (
                        <a
                          href={value}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 block truncate font-mono text-xs hover:underline"
                        >
                          {value}
                        </a>
                      ) : (
                        <p className="mt-0.5 text-sm">{value}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {institution.courses_offered.length > 0 && (
                <div className="mt-5">
                  <p className="mono-label">Courses offered</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {institution.courses_offered.map((course) => (
                      <Pill key={course}>{course}</Pill>
                    ))}
                  </div>
                </div>
              )}

              {institution.departments.length > 0 && (
                <div className="mt-5">
                  <p className="mono-label">Departments</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {institution.departments.map((department) => (
                      <Pill key={department} tone="outline">
                        <GraduationCap className="size-3" /> {department}
                      </Pill>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          {editing ? (
            <>
              <button
                type="button"
                onClick={leaveEditMode}
                disabled={saving}
                className="rounded-md border border-border px-3.5 py-2 text-xs font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="institute-details-form"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onClose()}
              className="rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Mirrors Institution.institution_type on the server.
 *
 * This is a text input with suggestions rather than a fixed select so a college
 * whose type is missing from an older catalogue can still record what it is;
 * the server rejects anything it does not recognise.
 */
const INSTITUTION_TYPES = [
  "University",
  "Deemed University",
  "Autonomous College",
  "College",
  "Institute",
  "Polytechnic",
  "ITI",
  "Other",
];
