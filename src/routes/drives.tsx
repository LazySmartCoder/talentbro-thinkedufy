import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart,
  Bar as ChartBar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BadgeCheck,
  Briefcase,
  CalendarClock,
  Filter,
  GraduationCap,
  IndianRupee,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Shell } from "@/components/dash/Shell";
import { CreateDriveDialog } from "@/components/dash/CreateDriveDialog";
import { CompanyMark } from "@/components/dash/CompanyMark";
import {
  Bar,
  Kpi,
  Panel,
  Pill,
  chartAxisProps,
  chartColors,
  chartCursor,
  chartTooltipProps,
} from "@/components/dash/bits";
import {
  getCompanies,
  getDrives,
  type DriveCompanyTier,
  type PlacementCompany,
  type PlacementDrive,
} from "@/lib/api";

export const Route = createFileRoute("/drives")({
  head: () => ({
    meta: [
      { title: "Placement Drives — TalentBro" },
      {
        name: "description",
        content:
          "Campus drives derived from the companies the placement cell recorded, with eligible-candidate pools per drive.",
      },
      { property: "og:title", content: "Placement Drives — TalentBro" },
      {
        property: "og:description",
        content: "Track every campus drive and the eligible student pool behind it.",
      },
    ],
  }),
  component: DrivesPage,
});

const FILTERS = ["All", "Live", "Upcoming", "Completed", "Cancelled"] as const;

const TIER_META: Record<DriveCompanyTier, { label: string; tone: "solid" | "outline" | "muted" }> =
  {
    super_dream: { label: "Super Dream", tone: "solid" },
    dream: { label: "Dream", tone: "outline" },
    core: { label: "Core", tone: "muted" },
    mass: { label: "Mass", tone: "muted" },
  };

function fmtDate(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DriveDetailModal({
  drive,
  onClose,
  onEdit,
}: {
  drive: PlacementDrive;
  onClose: () => void;
  onEdit: () => void;
}) {
  // Every field the card and the old snapshot between them used to show, so
  // opening the sheet is a complete replacement for both.
  const facts: [string, string][] = [
    ["Company", drive.company_name],
    ["Industry", drive.industry || "—"],
    ["Recruiter tier", TIER_META[drive.tier]?.label ?? drive.tier],
    ["Drive title", drive.title || "—"],
    ["Job role", drive.role || "—"],
    ["Recruitment status", drive.status],
    ["Drive type", drive.drive_mode.replace(/_/g, " ")],
    ["Placement mode", drive.placement_mode.replace(/_/g, " ")],
    ["Work mode", drive.mode],
    ["Location", drive.location || "—"],
    ["Total vacancies", drive.total_vacancies != null ? String(drive.total_vacancies) : "—"],
    ["Openings", String(drive.openings ?? 0)],
    ["Eligible candidates", `${drive.eligible_count} students`],
    ["CTC range", `${drive.ctc_min ?? "—"}–${drive.ctc_max ?? "—"} LPA`],
    ["Minimum CGPA", drive.minimum_cgpa != null ? String(drive.minimum_cgpa) : "—"],
    ["Backlogs allowed", drive.maximum_backlogs != null ? String(drive.maximum_backlogs) : "—"],
    ["Graduation year", drive.graduation_year != null ? String(drive.graduation_year) : "—"],
    ["Campus visit", fmtDate(drive.campus_visit_date)],
    ["Application deadline", fmtDate(drive.application_deadline)],
    ["Offer status", drive.offer_status ? drive.offer_status.replace(/_/g, " ") : "—"],
  ];

  const groups: { label: string; items: string[] }[] = [
    { label: "Eligible branches", items: drive.eligible_branches },
    { label: "Eligible courses", items: drive.eligible_courses },
    { label: "Required skills", items: drive.required_skills },
    { label: "Preferred skills", items: drive.preferred_skills },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${drive.title} details`}
      onClick={onClose}
    >
      <div
        className="panel max-h-[88vh] w-full max-w-3xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <CompanyMark company={drive} className="size-11 rounded-md" />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{drive.title || drive.company_name}</h2>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {drive.company_name}
                {drive.role ? ` · ${drive.role}` : ""}
              </p>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Pill tone={drive.status === "Live" ? "solid" : "outline"}>{drive.status}</Pill>
              <Pill tone={TIER_META[drive.tier]?.tone ?? "muted"}>
                {TIER_META[drive.tier]?.label ?? drive.tier}
              </Pill>
              {drive.offer_status && (
                <Pill tone="outline">
                  <span className="capitalize">{drive.offer_status.replace(/_/g, " ")}</span>
                </Pill>
              )}
            </div>
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

        <div className="grid gap-3 px-6 py-5 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-md border border-border px-3.5 py-2.5">
              <p className="mono-label">{label}</p>
              <p className="mt-1 text-sm font-medium capitalize">{value}</p>
            </div>
          ))}
        </div>

        {groups.some((g) => g.items.length > 0) && (
          <div className="grid gap-4 border-t border-border px-6 py-5 sm:grid-cols-2">
            {groups
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.label}>
                  <p className="mono-label">{g.label}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.items.map((item) => (
                      <Pill key={item} tone="outline">
                        {item}
                      </Pill>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}

        <div className="border-t border-border px-6 py-5">
          <p className="mono-label">Selection rounds</p>
          {drive.selection_rounds.length > 0 ? (
            <ol className="mt-2 space-y-2">
              {drive.selection_rounds.map((r, i) => (
                <li key={`${r}-${i}`} className="flex items-center gap-3 text-sm">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted font-mono text-[11px] font-bold">
                    {i + 1}
                  </span>
                  <span className="font-medium">{r}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">No rounds recorded.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3.5 py-2 text-xs font-medium transition-colors hover:bg-accent"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Pencil className="size-3.5" /> Edit drive
          </button>
        </div>
      </div>
    </div>
  );
}

function DrivesPage() {
  const [list, setList] = useState<PlacementDrive[] | null>(null);
  const [driveCount, setDriveCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [activeId, setActiveId] = useState<number | null>(null);
  // The drive whose full detail sheet is open, and the one being edited. Kept
  // apart from `activeId` (which only drives the right-hand rail) so closing a
  // sheet does not move the selection out from under the rail.
  const [openId, setOpenId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [companies, setCompanies] = useState<PlacementCompany[]>([]);

  // Loaded once for the company picker in the create-drive dialog. A failure
  // here is not worth surfacing: the dialog falls back to fetching its own.
  useEffect(() => {
    let cancelled = false;
    getCompanies()
      .then((res) => {
        if (!cancelled) setCompanies(res.companies);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getDrives()
      .then((res) => {
        if (cancelled) return;
        setList(res.drives);
        setDriveCount(res.drive_count);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load drives.");
        setList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const all = list ?? [];
  const shown = all.filter(
    (d) =>
      (filter === "All" || d.status === filter) &&
      (q.trim() === "" ||
        `${d.company_name} ${d.industry} ${d.role} ${d.location ?? ""}`
          .toLowerCase()
          .includes(q.trim().toLowerCase())),
  );
  // Keyed on the drive, not the company: one company can now run several drives
  // and each is its own card with its own dates, rounds and status.
  const active = all.find((d) => d.drive_id === activeId) ?? shown[0] ?? null;
  // The sheet and the editor both resolve against the live list, so an amended
  // card is what the open dialog is showing.
  const openDrive = all.find((d) => d.drive_id === openId) ?? null;
  const editingDrive = all.find((d) => d.drive_id === editingId) ?? null;
  const bestPool = Math.max(1, ...all.map((d) => d.eligible_count));
  // Largest opening count on record, so the openings bar is measured against
  // the best drive rather than against itself (which would always read 100%).
  const bestOpenings = Math.max(1, ...all.map((d) => d.openings ?? 0));

  if (list === null) {
    return (
      <Shell title="Placement Drives" subtitle="Plan, run and audit every campus hiring drive">
        <div className="grid min-h-[50vh] place-items-center">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
            <Loader2 className="size-3.5 animate-spin" /> Loading drives…
          </span>
        </div>
      </Shell>
    );
  }

  if (error !== null) {
    return (
      <Shell title="Placement Drives" subtitle="Plan, run and audit every campus hiring drive">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{error}</p>
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
      </Shell>
    );
  }

  const totalOpenings = all.reduce((a, d) => a + (d.openings ?? 0), 0);
  const eligiblePool = all.reduce((a, d) => a + d.eligible_count, 0);

  const tierMix = (Object.keys(TIER_META) as DriveCompanyTier[])
    .map((tier) => ({
      tier,
      label: TIER_META[tier].label,
      drives: all.filter((d) => d.tier === tier).length,
      openings: all.filter((d) => d.tier === tier).reduce((a, d) => a + (d.openings ?? 0), 0),
    }))
    .filter((row) => row.drives > 0);

  return (
    <Shell
      title="Placement Drives"
      subtitle="Every hiring event a registered company has run, with the eligible pool behind each one"
      actions={
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-3.5" /> Schedule Drive
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total Drives" value={driveCount} hint="drive records for this college" />
        <Kpi
          label="Live Now"
          value={all.filter((d) => d.status === "Live").length}
          hint="in progress"
        />
        <Kpi label="Openings" value={totalOpenings} hint="open roles across drives" />
        <Kpi label="Eligible Pool" value={eligiblePool} hint="readiness 40+ and unplaced" />
      </div>

      {tierMix.length > 1 && (
        <Panel
          className="mt-4"
          title="Hiring mix by tier"
          description="Drives and openings announced per recruiter tier"
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={tierMix} margin={{ left: -22, right: 6, top: 6 }}>
              <CartesianGrid stroke={chartColors.grid} vertical={false} />
              <XAxis dataKey="label" {...chartAxisProps} />
              <YAxis {...chartAxisProps} allowDecimals={false} />
              <Tooltip {...chartTooltipProps} cursor={chartCursor} />
              <ChartBar
                dataKey="drives"
                name="Drives"
                fill={chartColors.ink}
                radius={[4, 4, 0, 0]}
                barSize={40}
              />
              <ChartBar
                dataKey="openings"
                name="Openings"
                fill={chartColors.light}
                radius={[4, 4, 0, 0]}
                barSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <Panel className="mt-4" bodyClassName="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search drives by company, role or location…"
              aria-label="Search drives"
              className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="size-3.5 text-muted-foreground" />
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  filter === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-accent"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((d) => {
          const isActive = active?.drive_id === d.drive_id;
          return (
            <button
              key={d.drive_id}
              onClick={() => {
                setActiveId(d.drive_id);
                setOpenId(d.drive_id);
              }}
              aria-haspopup="dialog"
              className={cn(
                "dash-panel flex h-full cursor-pointer flex-col p-4 text-left transition-all hover:shadow-md",
                isActive && "ring-2 ring-ring",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <CompanyMark company={d} className="size-9 rounded-md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {d.company_name}
                      {d.role ? (
                        <span className="font-normal text-muted-foreground"> — {d.role}</span>
                      ) : (
                        <span className="font-normal text-muted-foreground"> — {d.industry}</span>
                      )}
                    </p>
                    <p className="mono-label mt-1.5">
                      {fmtDate(d.campus_visit_date)} · {d.mode}
                      {d.location ? ` · ${d.location}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Pill tone={d.status === "Live" ? "solid" : "outline"}>{d.status}</Pill>
                  <Pill tone={TIER_META[d.tier]?.tone ?? "muted"}>
                    {TIER_META[d.tier]?.label ?? d.tier}
                  </Pill>
                </div>
              </div>

              {/* Only the two figures that are genuinely comparative get a bar:
                    opening count and eligible pool are both measured across the
                    drives on record, so their bars say something. Rounds and
                    backlogs are absolute counts with no meaningful ceiling, so
                    they stay as plain numbers. */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  {
                    icon: Briefcase,
                    label: "Openings",
                    value: d.openings ?? 0,
                    max: bestOpenings,
                  },
                  {
                    icon: Users,
                    label: "Eligible pool",
                    value: d.eligible_count,
                    max: bestPool,
                  },
                  {
                    icon: CalendarClock,
                    label: "Selection rounds",
                    value: d.selection_rounds.length,
                  },
                  {
                    icon: GraduationCap,
                    label: "Backlogs allowed",
                    value: d.maximum_backlogs ?? 0,
                  },
                ].map(({ icon: Icon, label, value, max }) => (
                  <div key={label} className="rounded-md border border-border/60 px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Icon className="size-3.5 text-muted-foreground" />
                      <p className="mono-label">{label}</p>
                    </div>
                    <p className="stat-num mt-1.5 text-lg">{value}</p>
                    {max != null && (
                      <div className="mt-1.5">
                        <Bar value={value} max={max || 1} />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {d.ctc_min != null || d.ctc_max != null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <IndianRupee className="size-3.5" />
                    {d.ctc_min ?? "—"}–{d.ctc_max ?? "—"} LPA
                  </span>
                ) : null}
                {d.minimum_cgpa !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    <GraduationCap className="size-3.5" /> CGPA ≥ {d.minimum_cgpa}
                  </span>
                )}
                {d.application_deadline && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" /> Apply by{" "}
                    {fmtDate(d.application_deadline)}
                  </span>
                )}
                {d.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" /> {d.location}
                  </span>
                )}
                {d.offer_status && (
                  <span className="inline-flex items-center gap-1.5">
                    <BadgeCheck className="size-3.5" />
                    <span className="capitalize">{d.offer_status.replace(/_/g, " ")}</span>
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                {d.eligible_branches.length > 0 ? (
                  d.eligible_branches.map((b) => <Pill key={b}>{b}</Pill>)
                ) : (
                  <Pill>All branches</Pill>
                )}
                {d.eligible_courses.map((c) => (
                  <Pill key={c} tone="outline">
                    All {c}
                  </Pill>
                ))}
              </div>
            </button>
          );
        })}
        {shown.length === 0 && (
          <Panel className="sm:col-span-2 xl:col-span-2">
            <p className="py-8 text-center text-sm text-muted-foreground">
              {all.length === 0
                ? "No drives yet — register a company, then create a drive when it goes to hire."
                : "No drives match this filter or search."}
            </p>
            {all.length === 0 && (
              <div className="flex flex-wrap justify-center gap-2 pb-6">
                <button
                  onClick={() => setCreating(true)}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  <Plus className="size-3.5" /> Schedule Drive
                </button>
              </div>
            )}
          </Panel>
        )}
      </div>

      {openDrive && !editingDrive && (
        <DriveDetailModal
          drive={openDrive}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditingId(openDrive.drive_id)}
        />
      )}

      {editingDrive && (
        <CreateDriveDialog
          companies={companies}
          editing={editingDrive}
          onClose={() => setEditingId(null)}
          onCreated={() => setEditingId(null)}
          onUpdated={(updated) => {
            // Swap the amended card in place rather than refetching, so the
            // right-hand rail and the open sheet stay on the same drive.
            setList((prev) =>
              (prev ?? []).map((d) => (d.drive_id === updated.drive_id ? updated : d)),
            );
            setEditingId(null);
            setOpenId(updated.drive_id);
            setActiveId(updated.drive_id);
          }}
        />
      )}

      {creating && (
        <CreateDriveDialog
          companies={companies}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            // Splice the new drive in rather than refetching: the create call
            // already returns the full card, and it is the one the user wants to
            // look at next.
            setList((prev) => [created, ...(prev ?? [])]);
            setDriveCount((n) => n + 1);
            setActiveId(created.drive_id);
            setFilter("All");
            setQ("");
          }}
        />
      )}
    </Shell>
  );
}
