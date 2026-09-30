import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import {
  ArrowLeft,
  Activity,
  BadgeCheck,
  CircleAlert,
  ExternalLink,
  GraduationCap,
  IndianRupee,
  Loader2,
  MessageCircle,
  Phone,
  Timer,
} from "lucide-react";
import { Shell } from "@/components/dash/Shell";
import { Kpi, Panel, Pill } from "@/components/dash/bits";
import {
  getStudentData,
  type ChoicePair,
  type StudentAccount,
  type StudentDetail,
} from "@/lib/api";

export const Route = createFileRoute("/student-data/$studentId")({
  head: () => ({
    meta: [
      { title: "Student record — TalentBro Placement Dashboard" },
      {
        name: "description",
        content:
          "The complete stored record of one candidate profile: identity, academics, placement standing, links, readiness scores and account usage.",
      },
    ],
  }),
  component: StudentDataPage,
});

// --- formatting helpers -----------------------------------------------------

/** Stored choice codes ("male", "btech") read as the labels a human expects. */
function choiceLabel(choices: ChoicePair[] | undefined, value: string | null | undefined) {
  if (!value) return "—";
  const found = (choices ?? []).find(([code]) => code === value);
  return found ? found[1] : value;
}

const DASH = "—";

function fmtDate(value: string | null | undefined) {
  if (!value) return DASH;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(value: string | null | undefined) {
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

function fmtNum(value: number | null | undefined, digits = 2) {
  if (value == null) return DASH;
  return value.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function fmtCtc(value: number | null | undefined) {
  if (value == null) return DASH;
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 1 })} LPA`;
}

function scalarText(value: unknown) {
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function EntryShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/20 px-3.5 py-3">{children}</div>
  );
}

/**
 * Projects, certifications and internships are free-form JSON, so an entry can be
 * anything: a bare string, a scalar, an array or a record of arbitrary fields.
 * Each one prints as its own card - the leading field becomes the card heading
 * and the rest become label/value rows beneath it.
 */
function EntryCard({ value }: { value: unknown }) {
  if (value == null) {
    return (
      <EntryShell>
        <p className="text-sm text-muted-foreground">{DASH}</p>
      </EntryShell>
    );
  }
  if (typeof value === "string") {
    return (
      <EntryShell>
        <p className="text-sm font-medium">{value}</p>
      </EntryShell>
    );
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return (
      <EntryShell>
        <p className="font-mono text-sm">{String(value)}</p>
      </EntryShell>
    );
  }
  if (Array.isArray(value)) {
    return (
      <EntryShell>
        <p className="text-sm text-muted-foreground">
          {value.length ? value.map(scalarText).join(", ") : DASH}
        </p>
      </EntryShell>
    );
  }
  const pairs = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v != null && v !== "",
  );
  if (pairs.length === 0) {
    return (
      <EntryShell>
        <p className="text-sm text-muted-foreground">{DASH}</p>
      </EntryShell>
    );
  }
  const head = pairs[0];
  const rest = pairs.slice(1);
  return (
    <EntryShell>
      <p className="text-sm font-medium leading-snug">{head ? scalarText(head[1]) : DASH}</p>
      {rest.length > 0 && (
        <dl className="mt-2 space-y-1 border-t border-border/60 pt-2">
          {rest.map(([key, v]) => (
            <div key={key} className="flex items-start justify-between gap-3">
              <dt className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                {humanize(key)}
              </dt>
              <dd className="min-w-0 break-words text-right text-sm">{scalarText(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </EntryShell>
  );
}

function EntryList({ title, values }: { title: string; values: unknown[] }) {
  return (
    <div className="border-t border-border px-0.5 pt-5 pb-5 first:border-t-0 first:pt-0 last:pb-0">
      <p className="dash-mono-label">{title}</p>
      {values.length === 0 ? (
        <p className="mt-2.5 text-sm text-muted-foreground">{DASH}</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {values.map((value, index) => (
            <li key={index}>
              <EntryCard value={value} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TagList({ values }: { values: string[] }) {
  if (values.length === 0) return <span className="text-sm text-muted-foreground">{DASH}</span>;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {values.map((value) => (
        <Pill key={value} tone="outline">
          {value}
        </Pill>
      ))}
    </div>
  );
}

function humanize(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-b-0">
      <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 break-words text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function ExternalLinkRow({ label, href }: { label: string; href: string | null }) {
  return (
    <Field
      label={label}
      value={
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            {href.length > 44 ? `${href.slice(0, 44)}…` : href}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          DASH
        )
      }
    />
  );
}

function AccountFields({ account }: { account: StudentAccount | null }) {
  if (!account) {
    return (
      <p className="text-sm text-muted-foreground">
        No account yet — this student was added as an email-only invite and signs up themselves.
      </p>
    );
  }
  return (
    <div>
      <Field label="Email" value={account.email || DASH} />
      <Field label="First name" value={account.first_name || DASH} />
      <Field label="Last name" value={account.last_name || DASH} />
      <Field label="Joined" value={fmtDateTime(account.date_joined)} />
      <Field label="Last login" value={fmtDateTime(account.last_login)} />
    </div>
  );
}

function StudentDataPage() {
  const navigate = useNavigate();
  const { studentId } = Route.useParams();

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["student-data", studentId],
    queryFn: () => getStudentData(studentId),
  });

  const student = data?.student;

  useEffect(() => {
    if (student) document.title = `${student.full_name || "Student"} | TalentBro`;
  }, [student]);

  const header = student
    ? {
        title: student.full_name || "Unnamed student",
        subtitle: [student.department, student.program, batchOf(student)]
          .filter(Boolean)
          .join(" · "),
      }
    : { title: "Student record", subtitle: studentId };

  return (
    <Shell
      title={header.title}
      subtitle={header.subtitle}
      actions={
        <>
          <Link
            to="/students"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <ArrowLeft className="size-4" /> All students
          </Link>
          {student && (
            <>
              <button
                type="button"
                onClick={() =>
                  void navigate({ to: "/student-message", search: { peer: student.id } })
                }
                className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                <MessageCircle className="size-4" /> Message
              </button>
              <Link
                to="/student-activity/$studentId"
                params={{ studentId }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Activity className="size-4" /> Activity
              </Link>
            </>
          )}
        </>
      }
    >
      {isPending && (
        <Panel>
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading the full record…
          </p>
        </Panel>
      )}

      {!isPending && error && (
        <Panel>
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium">Could not load this record</p>
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
        </Panel>
      )}

      {student && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Readiness score"
              value={fmtNum(student.readiness_score, 1)}
              hint={
                student.readiness_overall_rank != null
                  ? `Rank #${student.readiness_overall_rank} of ${student.readiness_overall_total}`
                  : "Not ranked yet"
              }
              icon={BadgeCheck}
            />
            <Kpi
              label="CGPA"
              value={fmtNum(student.cgpa)}
              hint={student.end_year ? `Class of ${student.end_year}` : undefined}
              icon={GraduationCap}
            />
            <Kpi
              label="Expected CTC"
              value={fmtCtc(student.expected_ctc)}
              hint={choiceLabel(student.choices.placement_status, student.placement_status)}
              icon={IndianRupee}
            />
            <Kpi
              label="Time on platform"
              value={student.time_spent}
              suffix="mins"
              hint={`Last activity — ${fmtDateTime(student.account?.last_login)}`}
              icon={Timer}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel
              title="Identity"
              description="Every name, contact and demographic column as stored."
            >
              <div className="flex flex-wrap items-center gap-2 pb-3">
                <Pill tone={student.placement_eligible ? "solid" : "muted"}>
                  {student.placement_eligible ? "Placement eligible" : "Not eligible"}
                </Pill>
                <Pill tone="outline">
                  {choiceLabel(student.choices.account_status, student.account_status)}
                </Pill>
              </div>
              <Field
                label="Mobile"
                value={
                  student.mobile_number ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5 text-muted-foreground" />
                      {student.mobile_number}
                    </span>
                  ) : (
                    DASH
                  )
                }
              />
              <Field label="Date of birth" value={fmtDate(student.date_of_birth)} />
              <Field label="Gender" value={choiceLabel(student.choices.gender, student.gender)} />
            </Panel>

            {/* Labelled "Institute" here to match the rest of the client-side product, but
                still read off the `college` fields - those are the API's names and
                changing them here would just be a second spelling of the same
                thing. */}
            <Panel title="Academics" description="Institute, department, programme and batch.">
              <Field label="Institute" value={student.college || DASH} />
              <Field label="Institute id" value={student.college_id || DASH} />
              <Field label="Department" value={student.department || DASH} />
              <Field
                label="Programme"
                value={choiceLabel(student.choices.program, student.program)}
              />
              <Field label="Start year" value={student.start_year ?? DASH} />
              <Field label="End year" value={student.end_year ?? DASH} />
              {/* Same two-column shape and `py-2` rhythm as Field, so the label and the bio
                line up with the rows above it. The `text-right` is on the value
                only: putting it on the wrapper would drag the label right too. */}
              <div className="flex items-start justify-between gap-4 border-t border-border pt-3 pb-2">
                <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                  Bio
                </span>
                <span className="min-w-0 max-w-[70%] break-words text-right text-sm font-medium">
                  {student.bio || DASH}
                </span>
              </div>
              <div className="border-t border-border pt-4">
                <p className="dash-mono-label">Links</p>
                <div className="mt-1">
                  <ExternalLinkRow label="LinkedIn" href={student.linkedin_url} />
                  <ExternalLinkRow
                    label="GitHub"
                    href={student.github_url ? withScheme(student.github_url) : null}
                  />
                  <ExternalLinkRow label="Portfolio" href={student.portfolio_url} />
                </div>
              </div>
            </Panel>

            <Panel title="Placement" description="Standing, expected CTC and the stored ranks.">
              <Field
                label="Placement status"
                value={choiceLabel(student.choices.placement_status, student.placement_status)}
              />
              <Field label="Expected CTC" value={fmtCtc(student.expected_ctc)} />
              <Field
                label="Readiness score"
                value={
                  student.readiness_score != null
                    ? `${fmtNum(student.readiness_score, 1)}/100`
                    : DASH
                }
              />
              <Field
                label="Overall rank"
                value={
                  student.readiness_overall_rank != null
                    ? `#${student.readiness_overall_rank} of ${student.readiness_overall_total}`
                    : DASH
                }
              />
              <Field
                label="Department rank"
                value={
                  student.readiness_department_rank != null
                    ? `#${student.readiness_department_rank} of ${student.readiness_department_total}`
                    : DASH
                }
              />
            </Panel>

            <Panel
              title="Account and usage"
              description="Sign-in state, platform time and AI spend."
            >
              <AccountFields account={student.account} />
              <Field
                label="AI cost incurred"
                value={
                  student.cost_incurred
                    ? `₹${student.cost_incurred.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                    : "₹0"
                }
              />
            </Panel>

            <Panel
              title="Skills and preferences"
              description="Tags the student set on their own profile."
              className="xl:col-span-2"
            >
              <div className="grid gap-5 md:grid-cols-3">
                <div>
                  <p className="dash-mono-label">Skills</p>
                  <TagList values={student.skills} />
                </div>
                <div>
                  <p className="dash-mono-label">Preferred roles</p>
                  <TagList values={student.preferred_roles} />
                </div>
                <div>
                  <p className="dash-mono-label">Preferred locations</p>
                  <TagList values={student.preferred_locations} />
                </div>
                <div className="md:col-span-3">
                  <p className="dash-mono-label">Preferred language</p>
                  <p className="mt-1.5 text-sm">{student.preferred_language || DASH}</p>
                </div>
              </div>
            </Panel>

            <Panel
              title="Certifications, projects and internships"
              description="One card per entry, using whichever fields the student saved."
              className="xl:col-span-2"
            >
              <div>
                <EntryList title="Certifications" values={student.certifications} />
                <EntryList title="Projects" values={student.projects} />
                <EntryList title="Internships" values={student.internships} />
              </div>
              <div className="mt-5">
                <p className="dash-mono-label">Extracurricular activities</p>
                <TagList values={student.extracurricular_activities} />
              </div>
            </Panel>
          </div>
        </div>
      )}
    </Shell>
  );
}

function batchOf(student: StudentDetail) {
  if (student.start_year == null && student.end_year == null) return "";
  return `${student.start_year ?? "?"}–${student.end_year ?? "?"}`;
}

function withScheme(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
