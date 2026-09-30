import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, Copy, ExternalLink, Pencil, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/dash/Shell";
import { CompanyMark } from "@/components/dash/CompanyMark";
import { companyWebsiteHref as websiteHref } from "@/lib/company-website";
import { Kpi, Panel, Pill } from "@/components/dash/bits";
import {
  createCompany,
  getCompanies,
  updateCompany,
  type CompanyUpdatePayload,
  type DriveCompanyTier,
  type PlacementCompany,
} from "@/lib/api";

export const Route = createFileRoute("/companies")({
  head: () => ({
    meta: [
      { title: "Companies — TalentBro Recruiter Network" },
      {
        name: "description",
        content:
          "Track recruiter relationships, hiring tiers, CTC bands, SPOC contacts and offer counts across every campus partner.",
      },
      { property: "og:title", content: "Companies — TalentBro" },
      {
        property: "og:description",
        content: "Recruiter network with tiers, CTC bands, SPOC contacts and offer history.",
      },
    ],
  }),
  component: CompanyPage,
});

const TIERS = ["All", "Super Dream", "Dream", "Core", "Mass"];

const TIER_LABEL: Record<DriveCompanyTier, string> = {
  super_dream: "Super Dream",
  dream: "Dream",
  core: "Core",
  mass: "Mass",
};

// Registering a recruiter. Roles, skills, dates, rounds, status and offer
// state are deliberately absent: those describe a hiring event and are set on
// the drive when the company actually goes to hire.
const EMPTY_DRAFT = {
  company_name: "",
  industry: "",
  company_description: "",
  website: "",
  work_location: "",
  tier: "core",
  salary_min: "",
  salary_max: "",
  minimum_cgpa: "",
  maximum_backlogs: "",
  graduation_year: "",
  eligible_branches: "",
  eligible_courses: "",
};

type CompanyDraft = typeof EMPTY_DRAFT;

const csvList = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));

const INPUT_CLS =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20";

function lpa(value: number | null): string {
  return value == null ? "—" : `₹${value} LPA`;
}

// Pre-fill the form from a saved company. The API stores numbers as null and
// lists as arrays, the form wants editable strings, so this is the one place
// that conversion happens.
function draftFrom(company: PlacementCompany): CompanyDraft {
  return {
    company_name: company.company_name,
    industry: company.industry,
    company_description: company.company_description,
    website: company.website,
    work_location: company.work_location,
    tier: company.tier,
    salary_min: company.salary_min == null ? "" : String(company.salary_min),
    salary_max: company.salary_max == null ? "" : String(company.salary_max),
    minimum_cgpa: company.minimum_cgpa == null ? "" : String(company.minimum_cgpa),
    maximum_backlogs: company.maximum_backlogs == null ? "" : String(company.maximum_backlogs),
    graduation_year: company.graduation_year == null ? "" : String(company.graduation_year),
    eligible_branches: company.eligible_branches.join(", "),
    eligible_courses: company.eligible_courses.join(", "),
  };
}

function payloadFrom(draft: CompanyDraft): CompanyUpdatePayload {
  return {
    company_name: draft.company_name.trim(),
    industry: draft.industry.trim(),
    company_description: draft.company_description.trim(),
    // Sent raw, not scheme-prefixed: the backend reduces whatever is typed to an
    // origin and resolves the favicon from it, so there is nothing to normalise here.
    website: draft.website.trim(),
    work_location: draft.work_location.trim(),
    tier: draft.tier as DriveCompanyTier,
    salary_min: numberOrNull(draft.salary_min),
    salary_max: numberOrNull(draft.salary_max),
    minimum_cgpa: numberOrNull(draft.minimum_cgpa),
    maximum_backlogs: numberOrNull(draft.maximum_backlogs),
    graduation_year: numberOrNull(draft.graduation_year),
    eligible_branches: csvList(draft.eligible_branches),
    eligible_courses: csvList(draft.eligible_courses),
  };
}

// Shared by the add modal and the edit form inside the view modal. Declared at
// module scope on purpose: a component defined inside CompanyPage would be a new
// type on every render and remount the inputs, dropping focus on each keystroke.
function CompanyFields({
  draft,
  onChange,
  idPrefix,
}: {
  draft: CompanyDraft;
  onChange: (next: CompanyDraft) => void;
  idPrefix: string;
}) {
  const set = (key: keyof CompanyDraft) => (value: string) => onChange({ ...draft, [key]: value });
  const field = (key: keyof CompanyDraft) => `${idPrefix}-${key}`;

  return (
    <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="mono-label" htmlFor={field("company_name")}>
          Company name *
        </label>
        <input
          id={field("company_name")}
          value={draft.company_name}
          onChange={(e) => set("company_name")(e.target.value)}
          placeholder="e.g. TCS"
          className={`${INPUT_CLS} mt-1.5`}
          required
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mono-label" htmlFor={field("industry")}>
          Industry
        </label>
        <input
          id={field("industry")}
          value={draft.industry}
          onChange={(e) => set("industry")(e.target.value)}
          placeholder="e.g. IT Services"
          className={`${INPUT_CLS} mt-1.5`}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mono-label" htmlFor={field("website")}>
          Website
        </label>
        <input
          id={field("website")}
          type="text"
          inputMode="url"
          value={draft.website}
          onChange={(e) => set("website")(e.target.value)}
          placeholder="e.g. tcs.com — used to fetch the company logo"
          className={`${INPUT_CLS} mt-1.5`}
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Optional. The scheme is added for you if you leave it off.
        </p>
      </div>
      <div className="sm:col-span-2">
        <label className="mono-label" htmlFor={field("company_description")}>
          About the company
        </label>
        <textarea
          id={field("company_description")}
          rows={2}
          value={draft.company_description}
          onChange={(e) => set("company_description")(e.target.value)}
          placeholder="Shown to students when they open this drive"
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20"
        />
      </div>
      <div>
        <label className="mono-label" htmlFor={field("tier")}>
          Hiring tier
        </label>
        <select
          id={field("tier")}
          value={draft.tier}
          onChange={(e) => set("tier")(e.target.value)}
          className={`${INPUT_CLS} mt-1.5`}
        >
          {(["core", "mass", "dream", "super_dream"] as const).map((t) => (
            <option key={t} value={t}>
              {TIER_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mono-label" htmlFor={field("work_location")}>
          Work location
        </label>
        <input
          id={field("work_location")}
          value={draft.work_location}
          onChange={(e) => set("work_location")(e.target.value)}
          placeholder="e.g. Bangalore"
          className={`${INPUT_CLS} mt-1.5`}
        />
      </div>
      <div>
        <label className="mono-label" htmlFor={field("salary_min")}>
          Min CTC (LPA)
        </label>
        <input
          id={field("salary_min")}
          type="number"
          min="0"
          step="0.5"
          value={draft.salary_min}
          onChange={(e) => set("salary_min")(e.target.value)}
          placeholder="e.g. 4"
          className={`${INPUT_CLS} mt-1.5`}
        />
      </div>
      <div>
        <label className="mono-label" htmlFor={field("salary_max")}>
          Max CTC (LPA)
        </label>
        <input
          id={field("salary_max")}
          type="number"
          min="0"
          step="0.5"
          value={draft.salary_max}
          onChange={(e) => set("salary_max")(e.target.value)}
          placeholder="e.g. 8"
          className={`${INPUT_CLS} mt-1.5`}
        />
      </div>
      <div>
        <label className="mono-label" htmlFor={field("graduation_year")}>
          Graduating batch year
        </label>
        <input
          id={field("graduation_year")}
          type="number"
          min="2000"
          max="2100"
          value={draft.graduation_year}
          onChange={(e) => set("graduation_year")(e.target.value)}
          placeholder="e.g. 2027"
          className={`${INPUT_CLS} mt-1.5`}
        />
      </div>
      <div>
        <label className="mono-label" htmlFor={field("minimum_cgpa")}>
          Min CGPA
        </label>
        <input
          id={field("minimum_cgpa")}
          type="number"
          min="0"
          max="10"
          step="0.1"
          value={draft.minimum_cgpa}
          onChange={(e) => set("minimum_cgpa")(e.target.value)}
          placeholder="e.g. 6.5"
          className={`${INPUT_CLS} mt-1.5`}
        />
      </div>
      <div>
        <label className="mono-label" htmlFor={field("maximum_backlogs")}>
          Max backlogs
        </label>
        <input
          id={field("maximum_backlogs")}
          type="number"
          min="0"
          value={draft.maximum_backlogs}
          onChange={(e) => set("maximum_backlogs")(e.target.value)}
          placeholder="e.g. 2"
          className={`${INPUT_CLS} mt-1.5`}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mono-label" htmlFor={field("eligible_branches")}>
          Eligible branches
        </label>
        <input
          id={field("eligible_branches")}
          value={draft.eligible_branches}
          onChange={(e) => set("eligible_branches")(e.target.value)}
          placeholder="CSE, IT, ECE (comma separated — leave blank for all)"
          className={`${INPUT_CLS} mt-1.5`}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mono-label" htmlFor={field("eligible_courses")}>
          Eligible courses
        </label>
        <input
          id={field("eligible_courses")}
          value={draft.eligible_courses}
          onChange={(e) => set("eligible_courses")(e.target.value)}
          placeholder="B.Tech, MCA (comma separated — leave blank for all)"
          className={`${INPUT_CLS} mt-1.5`}
        />
      </div>
    </div>
  );
}

function CompanyPage() {
  const [list, setList] = useState<PlacementCompany[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("All");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [selected, setSelected] = useState<PlacementCompany | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<CompanyDraft>(EMPTY_DRAFT);
  // The view modal doubles as the edit screen: `editing` only ever flips while
  // `selected` is open, so there is no separate route or dialog for it.
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<CompanyDraft>(EMPTY_DRAFT);
  const [savingEdit, setSavingEdit] = useState(false);

  // Resolved once for the open company so the link is rendered only when the
  // stored value is actually a usable http(s) address.
  const selectedWebsite = selected ? websiteHref(selected.website) : null;

  function openCompany(company: PlacementCompany) {
    setSelected(company);
    setEditing(false);
  }

  function startEdit() {
    if (!selected) return;
    setEditDraft(draftFrom(selected));
    setEditing(true);
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!selected || !editDraft.company_name.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      const updated = await updateCompany(selected.id, payloadFrom(editDraft));
      setList((prev) => (prev ?? []).map((c) => (c.id === updated.id ? updated : c)));
      setSelected(updated);
      setEditing(false);
      toast.success(`Updated ${updated.company_name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function submitCompany(e: FormEvent) {
    e.preventDefault();
    if (!draft.company_name.trim() || saving) return;
    setSaving(true);
    try {
      const created = await createCompany(payloadFrom(draft));
      setList((prev) => [created, ...(prev ?? [])]);
      toast.success(`Added ${created.company_name}`);
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      // The AI profile is written by the backend after it responds, so the row
      // we just pushed in has no company_ai_info yet. Refetch once a few seconds
      // later to pull it in; the list looks identical either way until it lands.
      setTimeout(() => setReloadKey((k) => k + 1), 4000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the company.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    getCompanies()
      .then((data) => {
        if (cancelled) return;
        setList(data.companies);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // No local seed data: an empty table that says why is better than a
        // convincing list of companies this college never hired.
        setList([]);
        setLoadError(err instanceof Error ? err.message : "Could not load companies.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const shown = useMemo(
    () =>
      (list ?? []).filter(
        (c) =>
          `${c.company_name} ${c.industry} ${c.work_location}`
            .toLowerCase()
            .includes(q.toLowerCase()) &&
          (tier === "All" || TIER_LABEL[c.tier] === tier),
      ),
    [list, q, tier],
  );

  const openings = shown.reduce((a, b) => a + (b.openings ?? 0), 0);
  const topCtc = shown.reduce((a, b) => Math.max(a, b.salary_max ?? 0), 0);

  return (
    <Shell
      title="Companies"
      subtitle="Recruiter network and campus hiring partners"
      actions={
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-3.5" /> Add Company
        </button>
      }
    >
      {list === null ? (
        <div className="grid min-h-[50vh] place-items-center">
          <span className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
            Loading companies…
          </span>
        </div>
      ) : loadError ? (
        <Panel className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">Could not load your companies</h2>
              <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
            </div>
            <button
              onClick={() => {
                setList(null);
                setReloadKey((n) => n + 1);
              }}
              className="rounded-md border border-border px-3.5 py-2 text-xs font-medium hover:bg-accent"
            >
              Try again
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Partners" value={shown.length} hint="in selection" icon={Building2} />
            <Kpi label="Openings" value={openings} hint="across drives" />
            <Kpi label="Highest CTC" value={topCtc ? lpa(topCtc) : "—"} hint="ceiling offered" />
            <Kpi
              label="Super Dream"
              value={shown.filter((c) => c.tier === "super_dream").length}
              hint="top hiring bracket"
            />
          </div>

          <Panel className="mt-4" bodyClassName="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search companies, industries, roles…"
                  className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="h-9 rounded-md border border-input bg-card px-3 text-sm"
              >
                {TIERS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <div className="flex rounded-md border border-border p-0.5">
                {(["grid", "table"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded px-3 py-1.5 text-xs font-medium capitalize ${
                      view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          {view === "grid" ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openCompany(c)}
                  className="panel cursor-pointer p-5 text-left transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <CompanyMark company={c} />
                      <div>
                        <p className="text-sm font-semibold leading-tight">{c.company_name}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {c.industry} · {c.work_location}
                        </p>
                      </div>
                    </div>
                    <Pill tone={c.tier === "super_dream" ? "solid" : "outline"}>
                      {TIER_LABEL[c.tier]}
                    </Pill>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-muted py-2">
                      <p className="stat-num text-sm">{lpa(c.salary_max)}</p>
                      <p className="mono-label">Max CTC</p>
                    </div>
                    <div className="rounded-md bg-muted py-2">
                      <p className="stat-num text-sm">{c.openings ?? "—"}</p>
                      <p className="mono-label">Openings</p>
                    </div>
                    <div className="rounded-md bg-muted py-2">
                      <p className="stat-num text-sm">{c.minimum_cgpa ?? "—"}</p>
                      <p className="mono-label">Min CGPA</p>
                    </div>
                  </div>
                  <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
                    {c.drive_count ?? 0} drive{(c.drive_count ?? 0) === 1 ? "" : "s"} on record
                    {(c.drive_count ?? 0) === 0 && " · no drives yet"}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <Panel className="mt-4" bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {["Company", "Tier", "Industry", "CTC Band", "Openings", "Drives", ""].map(
                        (h) => (
                          <th key={h} className="mono-label px-5 py-3 font-normal">
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {shown.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/60">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <CompanyMark company={c} className="size-7 rounded-md" />
                            <span className="font-medium">{c.company_name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <Pill tone={c.tier === "super_dream" ? "solid" : "outline"}>
                            {TIER_LABEL[c.tier]}
                          </Pill>
                        </td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">{c.industry}</td>
                        <td className="px-5 py-3 font-mono text-xs">
                          {lpa(c.salary_min)} – {lpa(c.salary_max)}
                        </td>
                        <td className="px-5 py-3 font-mono">{c.openings ?? "—"}</td>
                        <td className="px-5 py-3">
                          <Pill tone={(c.drive_count ?? 0) > 0 ? "solid" : "muted"}>
                            {c.drive_count ?? 0}
                          </Pill>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => openCompany(c)}
                            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                    {shown.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-5 py-12 text-center text-sm text-muted-foreground"
                        >
                          No companies match these filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          {shown.length === 0 && view === "grid" && (
            <Panel className="mt-4">
              <div className="py-8 text-center">
                <p className="text-sm font-medium">
                  {list.length === 0
                    ? "No companies recorded yet."
                    : "No companies match these filters."}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  {list.length === 0
                    ? "Register your first campus partner here, then create a drive when they go to hire."
                    : "Try a different search term or tier."}
                </p>
                {list.length === 0 && (
                  <button
                    onClick={() => setAdding(true)}
                    className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="size-3.5" /> Add Company
                  </button>
                )}
              </div>
            </Panel>
          )}
        </>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center">
          <form
            onSubmit={submitCompany}
            className="panel max-h-[90vh] w-full max-w-lg overflow-y-auto"
          >
            <div className="flex items-start justify-between border-b border-border px-6 py-5">
              <div>
                <h2 className="text-lg font-bold">Add company</h2>
                <p className="font-mono text-xs text-muted-foreground">
                  Record a new campus partner for your institution
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdding(false)}
                aria-label="Close"
                className="rounded-md p-1 hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            </div>
            <CompanyFields draft={draft} onChange={setDraft} idPrefix="cc" />
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-md border border-border px-3.5 py-2 text-xs font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !draft.company_name.trim()}
                className="rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add company"}
              </button>
            </div>
          </form>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center">
          <div className="panel max-h-[90vh] w-full max-w-xl overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
              <div className="flex min-w-0 items-center gap-3">
                <CompanyMark company={selected} className="size-11 rounded-md" />
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold">{selected.company_name}</h2>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {selected.industry} · {selected.work_location} · {selected.company_id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="rounded-md p-1 hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            </div>
            {editing ? (
              <form onSubmit={submitEdit}>
                <p className="border-b border-border px-6 py-4 text-sm text-muted-foreground">
                  Update the details your placement cell records for this partner. The AI profile
                  below is generated and stays as it is.
                </p>
                <CompanyFields draft={editDraft} onChange={setEditDraft} idPrefix="ec" />
                <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-md border border-border px-3.5 py-2 text-xs font-medium hover:bg-accent"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit || !editDraft.company_name.trim()}
                    className="rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingEdit ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                {(selectedWebsite || selected.company_description) && (
                  <div className="border-b border-border px-6 py-4">
                    {selectedWebsite && (
                      <a
                        href={selectedWebsite}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 font-mono text-xs text-primary underline-offset-2 hover:underline"
                      >
                        {selected.website}
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    )}
                    {selected.company_description && (
                      <p className="text-sm text-muted-foreground">
                        {selected.company_description}
                      </p>
                    )}
                  </div>
                )}
                {selected.company_ai_info.map((block, i) => (
                  <section
                    key={`${block.name}-${i}`}
                    className="border-b border-border px-6 py-4 last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-sm font-bold">{block.name}</h3>
                      <Pill tone="muted">AI profile</Pill>
                    </div>
                    {block.short_desc && (
                      <p className="mt-1.5 text-sm text-muted-foreground">{block.short_desc}</p>
                    )}
                    {block.known_for && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="mono-label">Known for</span> {block.known_for}
                      </p>
                    )}
                    {block.big_desc && (
                      <p className="mt-2 text-sm leading-relaxed text-foreground/85">
                        {block.big_desc}
                      </p>
                    )}
                  </section>
                ))}
                <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
                  {[
                    ["Hiring tier", TIER_LABEL[selected.tier]],
                    ["CTC band", `${lpa(selected.salary_min)} – ${lpa(selected.salary_max)}`],
                    [
                      "Drives",
                      `${selected.drive_count ?? 0} on record${
                        (selected.drive_count ?? 0) === 0 ? " — nothing scheduled yet" : ""
                      }`,
                    ],
                    [
                      "Openings",
                      selected.drive_count
                        ? `${selected.openings ?? "—"} across ${selected.drive_count} drive${
                            selected.drive_count === 1 ? "" : "s"
                          }`
                        : String(selected.openings ?? "—"),
                    ],
                    ["Work location", selected.work_location || "—"],
                    ["Min CGPA", String(selected.minimum_cgpa ?? "—")],
                    ["Max backlogs", String(selected.maximum_backlogs ?? "—")],
                    ["Batch year", String(selected.graduation_year ?? "—")],
                    ["Eligible courses", selected.eligible_courses.join(", ") || "—"],
                    ["Eligible branches", selected.eligible_branches.join(", ") || "—"],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-md border border-border px-3.5 py-2.5">
                      <p className="mono-label">{l}</p>
                      <p className="mt-1 truncate text-sm font-medium">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        `${selected.company_name} — ${selected.company_id}`,
                      );
                      toast.success(`Copied ${selected.company_name} details`);
                    }}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3.5 py-2 text-xs font-medium hover:bg-accent"
                  >
                    <Copy className="size-3.5" /> Copy details
                  </button>
                  <button
                    onClick={startEdit}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <Pencil className="size-3.5" /> Edit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
