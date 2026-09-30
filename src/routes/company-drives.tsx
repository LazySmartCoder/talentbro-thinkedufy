import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Briefcase,
  Building2,
  CalendarClock,
  ChevronRight,
  Globe,
  IndianRupee,
  MapPin,
} from "lucide-react";
import { AppNavHeader } from "@/components/tb/app-nav";
import { CompanyMark } from "@/components/dash/CompanyMark";
import { companyWebsiteHref } from "@/lib/company-website";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { GateError, GateLoading } from "@/components/load-state";
import {
  getCandidateCompanyDrives,
  type DriveCompanyTier,
  type PlacementCompany,
  type StudentDrive,
  type StudentCompanyDrives,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const title = "TalentBro | Companies & Drives";
const description = "The recruiters your college is registered with and the drives they run.";

export const Route = createFileRoute("/company-drives")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
    ],
  }),
  component: CompanyDrivesPage,
});

const TIER_LABEL: Record<DriveCompanyTier, string> = {
  super_dream: "Super Dream",
  dream: "Dream",
  core: "Core",
  mass: "Mass",
};

// CTC band, tolerating a missing end: a company may quote only a floor or only a
// ceiling, and a drive may fall back to the company's standing value.
function ctcBand(min: number | null, max: number | null): string {
  if (min == null && max == null) return "Not disclosed";
  if (min != null && max != null) return `₹${min} – ₹${max} LPA`;
  return min != null ? `From ₹${min} LPA` : `Up to ₹${max} LPA`;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type Tab = "companies" | "drives";

function CompanyDrivesPage() {
  const [data, setData] = useState<StudentCompanyDrives | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<Tab>("companies");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getCandidateCompanyDrives()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // No local seed: an empty screen that says why beats a persuasive list of
        // companies this student's college never actually worked with.
        setData({ companies: [], drives: [], count: 0, drive_count: 0 });
        setError(err instanceof Error ? err.message : "Could not load companies and drives.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (error) return <GateError message={error} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!data) return <GateLoading />;

  const { companies, drives } = data;

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <AppNavHeader current="chat" />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
          <header className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-card">
              <Building2 className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Companies &amp; Drives
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Every recruiter your college is registered with, and the hiring drives they run.
              </p>
            </div>
          </header>

          <div className="mt-6 inline-flex rounded-lg border border-border bg-card p-1">
            <TabButton active={tab === "companies"} onClick={() => setTab("companies")}>
              <Building2 className="size-4" />
              Companies
              <span className="ml-1 text-xs text-muted-foreground">{companies.length}</span>
            </TabButton>
            <TabButton active={tab === "drives"} onClick={() => setTab("drives")}>
              <Briefcase className="size-4" />
              Drives
              <span className="ml-1 text-xs text-muted-foreground">{drives.length}</span>
            </TabButton>
          </div>

          <div className="mt-5">
            {tab === "companies" ? (
              <CompaniesTab companies={companies} />
            ) : (
              <DrivesTab drives={drives} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon, heading, body }: { icon: ReactNode; heading: string; body: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full border border-border bg-card text-muted-foreground">
        {icon}
      </span>
      <h2 className="mt-4 font-display text-lg font-bold">{heading}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function CompaniesTab({ companies }: { companies: PlacementCompany[] }) {
  if (companies.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="size-5" />}
        heading="No companies yet"
        body="Your placement cell hasn't registered any recruiters for your college yet. Check back later."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {companies.map((c) => {
        // Null when the stored value is not a usable http(s) address, in which
        // case the row simply is not rendered.
        const website = companyWebsiteHref(c.website);
        return (
          <div key={c.id} className="group relative">
            <Card className="h-full transition-colors group-hover:border-foreground/30">
              <CardContent className="flex h-full gap-3 p-4">
                {/* The recruiter's own logo, not a generic building glyph: a student
                    scanning this list is deciding where to apply, and recognising
                    the brand is the whole point. Falls back to initials when the
                    company has no website on file. */}
                <CompanyMark
                  company={c}
                  className="size-10 shrink-0 rounded-lg border border-border"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-display text-base font-bold">{c.company_name}</h3>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{TIER_LABEL[c.tier]}</Badge>
                    {c.industry && (
                      <span className="text-xs text-muted-foreground">{c.industry}</span>
                    )}
                  </div>
                  <div className="mt-2.5 space-y-1 text-xs text-muted-foreground">
                    {c.work_location && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="size-3.5" /> {c.work_location}
                      </p>
                    )}
                    <p className="flex items-center gap-1.5">
                      <IndianRupee className="size-3.5" />
                      {ctcBand(c.salary_min, c.salary_max)}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Briefcase className="size-3.5" />
                      {c.drive_count
                        ? `${c.drive_count} drive${c.drive_count === 1 ? "" : "s"} record${c.drive_count === 1 ? "" : "ed"}`
                        : "No drives scheduled yet"}
                    </p>
                    {website && (
                      /* Sits above the card-wide link below, so this opens the
                         company's own site rather than the profile page. */
                      <a
                        href={website}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={(e) => e.stopPropagation()}
                        className="relative z-10 flex w-fit items-center gap-1.5 font-mono underline-offset-2 hover:text-foreground hover:underline"
                      >
                        <Globe className="size-3.5" /> {c.website}
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Card-wide target for opening the profile. A separate overlay rather
                than wrapping the card in a Link, because the website above is a
                real anchor and anchors cannot nest. */}
            <Link
              to="/company-drives/$companyId"
              params={{ companyId: String(c.id) }}
              aria-label={`View ${c.company_name} profile`}
              className="absolute inset-0"
            />
          </div>
        );
      })}
    </div>
  );
}

function DrivesTab({ drives }: { drives: StudentDrive[] }) {
  if (drives.length === 0) {
    return (
      <EmptyState
        icon={<Briefcase className="size-5" />}
        heading="No drives yet"
        body="Your placement cell hasn't scheduled any hiring drives yet. When a recruiter visits, the drive will show up here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {drives.map((d) => {
        const deadline = fmtDate(d.application_deadline);
        const visit = fmtDate(d.campus_visit_date);
        const website = companyWebsiteHref(d.website);
        return (
          <Card key={d.drive_id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <CompanyMark
                    company={d}
                    className="size-10 shrink-0 rounded-lg border border-border"
                  />
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-bold">
                      {d.title || d.company_name}
                    </h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {d.company_name}
                      {d.role ? ` · ${d.role}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{TIER_LABEL[d.tier]}</Badge>
                  <Badge>{d.status}</Badge>
                </div>
              </div>

              <div className="mt-3 grid gap-x-6 gap-y-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                <p className="flex items-center gap-1.5">
                  <IndianRupee className="size-3.5" /> {ctcBand(d.ctc_min, d.ctc_max)}
                </p>
                {d.location && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="size-3.5" /> {d.location}
                  </p>
                )}
                {visit && (
                  <p className="flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" /> Campus visit: {visit}
                  </p>
                )}
                {deadline && (
                  <p className="flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" /> Apply by: {deadline}
                  </p>
                )}
                {website && (
                  /* The site a student reads before deciding to apply, so it goes
                     where the rest of the drive facts are rather than in a corner. */
                  <a
                    href={website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1.5 font-mono underline-offset-2 hover:text-foreground hover:underline"
                  >
                    <Globe className="size-3.5" /> {d.website}
                  </a>
                )}
              </div>

              {d.required_skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.required_skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
