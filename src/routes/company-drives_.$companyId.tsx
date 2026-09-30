import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarClock,
  ExternalLink,
  GraduationCap,
  IndianRupee,
  MapPin,
  Sparkles,
} from "lucide-react";
import { AppNavHeader } from "@/components/tb/app-nav";
import { CompanyMark } from "@/components/dash/CompanyMark";
import { companyWebsiteHref } from "@/lib/company-website";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GateLoading } from "@/components/load-state";
import { getCandidateCompany, type CandidateCompanyDetail, type DriveCompanyTier } from "@/lib/api";

const TIER_LABEL: Record<DriveCompanyTier, string> = {
  super_dream: "Super Dream",
  dream: "Dream",
  core: "Core",
  mass: "Mass",
};

export const Route = createFileRoute("/company-drives_/$companyId")({
  head: () => ({
    meta: [
      { title: "TalentBro | Company" },
      { name: "description", content: "Recruiter profile and hiring drives for your college." },
    ],
  }),
  component: CompanyDetailPage,
});

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

function CompanyDetailPage() {
  const { companyId } = Route.useParams();
  const [data, setData] = useState<CandidateCompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const id = Number(companyId);
    if (!Number.isInteger(id)) {
      setData(null);
      setError("That company link is not valid.");
      return;
    }
    getCandidateCompany(id)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(err instanceof Error ? err.message : "Could not load this company.");
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reloadKey]);

  if (error) {
    return (
      <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
        <AppNavHeader current="chat" />
        <main className="grid flex-1 place-items-center px-5">
          <div className="max-w-sm text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full border border-border bg-card text-muted-foreground">
              <Building2 className="size-6" />
            </span>
            <h1 className="mt-4 font-display text-lg font-bold">Company not available</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{error}</p>
            <Link
              to="/company-drives"
              className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <ArrowLeft className="size-4" /> Back to Companies &amp; Drives
            </Link>
          </div>
        </main>
      </div>
    );
  }
  if (!data) return <GateLoading />;

  const { company, drives } = data;
  const aiBlocks = company.company_ai_info;
  // Null when the stored value is not a usable http(s) address; the link is then
  // simply not rendered rather than pointing somewhere unsafe.
  const websiteHref = companyWebsiteHref(company.website);

  const facts: [string, string][] = [
    ["Work location", company.work_location || "—"],
    ["CTC band", ctcBand(company.salary_min, company.salary_max)],
    ["Openings", String(company.openings ?? "—")],
    ["Drives on record", String(company.drive_count ?? 0)],
    ["Minimum CGPA", String(company.minimum_cgpa ?? "—")],
    ["Max backlogs", String(company.maximum_backlogs ?? "—")],
    ["Batch year", String(company.graduation_year ?? "—")],
    ["Eligible courses", company.eligible_courses.join(", ") || "—"],
    ["Eligible branches", company.eligible_branches.join(", ") || "—"],
  ];

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <AppNavHeader current="chat" />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
          <Link
            to="/company-drives"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Companies &amp; Drives
          </Link>

          <header className="mt-4 flex items-start gap-3">
            <CompanyMark
              company={company}
              className="size-12 shrink-0 rounded-xl border border-border"
            />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight">
                {company.company_name}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{TIER_LABEL[company.tier]}</Badge>
                {company.industry && (
                  <span className="text-sm text-muted-foreground">{company.industry}</span>
                )}
                {company.company_id && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {company.company_id}
                  </span>
                )}
                {websiteHref && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {company.website}
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>
          </header>

          {/* About the company: whatever Gemini wrote into Company.company_ai_info.
              Nothing is generated on read, so a company with no block simply has
              no about section. */}
          {aiBlocks.length > 0 && (
            <section className="mt-6">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  About the company
                </h2>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Sparkles className="size-3" /> AI profile
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {aiBlocks.map((block, i) => (
                  <Card key={`${block.name}-${i}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold">{block.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {block.short_desc && (
                        <p className="font-medium text-foreground/90">{block.short_desc}</p>
                      )}
                      {block.known_for && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono text-[10px] uppercase tracking-wider">
                            Known for
                          </span>{" "}
                          {block.known_for}
                        </p>
                      )}
                      {block.big_desc && (
                        <p className="leading-relaxed text-foreground/85">{block.big_desc}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section className="mt-6">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              At a glance
            </h2>
            <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label} className="border-b border-border pb-2">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-sm">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-6">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Drives
            </h2>
            {drives.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Briefcase className="size-4" /> No hiring drives scheduled with this company yet.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {drives.map((d) => {
                  const visit = fmtDate(d.campus_visit_date);
                  const deadline = fmtDate(d.application_deadline);
                  return (
                    <Card key={d.drive_id}>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="font-display text-base font-bold">
                              {d.title || d.role || "Hiring drive"}
                            </h3>
                            {d.role && d.title && (
                              <p className="mt-0.5 text-sm text-muted-foreground">{d.role}</p>
                            )}
                          </div>
                          <Badge>{d.status}</Badge>
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
                          {d.minimum_cgpa != null && (
                            <p className="flex items-center gap-1.5">
                              <GraduationCap className="size-3.5" /> Min CGPA: {d.minimum_cgpa}
                            </p>
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
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
