import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Building, Clock, Mail, MapPin, Phone, Trash2, UserPlus, Users } from "lucide-react";
import { Shell } from "@/components/dash/Shell";
import { AddMemberDialog } from "@/components/dash/AddMemberDialog";
import { InstituteDetailsDialog } from "@/components/dash/InstituteDetailsDialog";
import { Panel, Pill } from "@/components/dash/bits";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GateError, GateLoading } from "@/components/load-state";
import {
  getInstitutionOverview,
  getPlacementCellMembers,
  removePlacementCellMember,
  type DashboardInstitution,
  type InstitutionOverview,
  type PlacementCellMember,
} from "@/lib/api";

// Everything on this page is read from /api/institution/overview/ for the signed
// in staff member's own college — the department stats, the office contact and
// the recruiter count. There is no local seed data to drift from the database.
// The pipeline funnel lives on /students instead, where it tracks the filters
// the placement cell is actually looking at.
const RESPONSIBILITIES = [
  "Drive scheduling & student shortlisting",
  "Company onboarding & campus visit management",
  "Mock interview & GD program coordination",
  "Offer letters, acceptance & joining tracking",
  "Readiness assessments & intervention plans",
  "Alumni & industry partnerships",
  "Placement reports & management reviews",
];

const ACCESS_LABEL: Record<string, string> = {
  beta: "Beta access",
  master: "Master access",
};

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((n) => n[0] ?? "")
      .join("")
      .toUpperCase() || "PC"
  );
}

export const Route = createFileRoute("/placement-cell")({
  head: () => ({
    meta: [
      { title: "Placement Cell — TalentBro Placement Dashboard" },
      {
        name: "description",
        content:
          "The Training & Placement Cell behind your college's drives — department analytics, the placement office and who staffs it.",
      },
      { property: "og:title", content: "Placement Cell — TalentBro" },
      {
        property: "og:description",
        content: "Department analytics and the placement office behind your college's drives.",
      },
    ],
  }),
  component: PlacementCellPage,
});

function PlacementCellPage() {
  const [overview, setOverview] = useState<InstitutionOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // The roster drives the member list on this page, whether this account may add
  // colleagues, and which one is a pending invite.
  const [members, setMembers] = useState<PlacementCellMember[] | null>(null);
  const [canAddMembers, setCanAddMembers] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  // The college's own record, behind a button rather than a chip in the header.
  const [showingInstitute, setShowingInstitute] = useState(false);
  // Removal is confirmed in a dialog and only ever one member at a time.
  const [removingMember, setRemovingMember] = useState<PlacementCellMember | null>(null);
  const [removingMemberBusy, setRemovingMemberBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getInstitutionOverview()
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the placement cell.");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    getPlacementCellMembers()
      .then((data) => {
        if (cancelled) return;
        setMembers(data.members);
        setCanAddMembers(data.can_add_members);
      })
      .catch(() => {
        // Not fatal: the page is about the college, and the server independently
        // refuses the add if this account is not a Master. Hiding the button is
        // the right failure mode.
        if (cancelled) return;
        setMembers(null);
        setCanAddMembers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // The server is the authority on who may be removed, so nothing is taken off
  // the list optimistically: a refusal comes back as a message and the dialog
  // stays open with the member still on the roster.
  const confirmRemoveMember = useCallback(async () => {
    if (removingMember === null || removingMemberBusy) return;
    setRemovingMemberBusy(true);
    setRemoveError("");
    try {
      await removePlacementCellMember(removingMember.id);
      setMembers((prev) => prev?.filter((member) => member.id !== removingMember.id) ?? prev);
      setRemovingMember(null);
    } catch (err) {
      setRemoveError(
        err instanceof Error ? err.message : "Could not remove this member from the roster.",
      );
    } finally {
      setRemovingMemberBusy(false);
    }
  }, [removingMember, removingMemberBusy]);

  if (overview === null && error === null) return <GateLoading />;
  if (overview === null) {
    return (
      <Shell title="Placement Cell" subtitle="The office behind your college's placement season">
        <GateError
          message={error}
          onRetry={() => {
            setReloadKey((n) => n + 1);
          }}
        />
      </Shell>
    );
  }

  const institution = overview.institution;
  const client = overview.client;
  const kpis = overview.kpis;
  // Members are invited on the same email domain as the officer doing the
  // inviting, so the roster can only ever be filled by this college's own staff.
  const memberDomain = client?.official_email?.split("@")[1] ?? "";

  const office = [
    institution.placement_department_name,
    institution.address,
    [institution.city, institution.state, institution.pin_code].filter(Boolean).join(" "),
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  return (
    <Shell
      title="Placement Cell"
      subtitle={`${institution.placement_department_name}, ${institution.name}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowingInstitute(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent"
          >
            <Building className="size-3.5 text-muted-foreground" />
            Institute details
          </button>
          {canAddMembers && (
            <button
              onClick={() => setAddingMember(true)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <UserPlus className="size-3.5" /> Add Member
            </button>
          )}
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Your placement desk"
          description="The officer signed in to this college's account."
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-border">
            {client ? (
              <li className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                <div className="grid size-10 shrink-0 place-items-center rounded-md bg-primary font-display text-xs font-bold text-primary-foreground">
                  {initials(client.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{client.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {client.designation || "Placement Officer"}
                  </p>
                </div>
                <div className="hidden flex-col items-end gap-0.5 md:flex">
                  <a
                    href={`mailto:${client.official_email}`}
                    className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Mail className="size-3" />
                    {client.official_email}
                  </a>
                  {client.mobile_number && (
                    <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                      <Phone className="size-3" /> {client.mobile_number}
                    </span>
                  )}
                </div>
                <Pill tone="outline">{ACCESS_LABEL[client.access] ?? client.access}</Pill>
              </li>
            ) : (
              <li className="px-5 py-6 text-sm text-muted-foreground">
                No placement-cell profile is linked to this account yet.
              </li>
            )}
            {institution.placement_office_email && (
              <li className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted font-display text-xs font-bold text-muted-foreground">
                  <Mail className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">Placement office inbox</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Where {institution.name} publishes drive announcements
                  </p>
                </div>
                <a
                  href={`mailto:${institution.placement_office_email}`}
                  className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {institution.placement_office_email}
                </a>
              </li>
            )}
          </ul>
        </Panel>

        <Panel
          title="Office hours & contact"
          description="Walk-in support for students during the placement season."
        >
          <ul className="space-y-3">
            <li className="flex items-center justify-between gap-3 rounded-md border border-border px-3.5 py-2.5">
              <span className="flex items-center gap-2 text-sm">
                <Clock className="size-4 text-muted-foreground" /> Weekdays
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {institution.website ? "See college website" : "During the drive season"}
              </span>
            </li>
            <li className="flex items-center justify-between gap-3 rounded-md border border-border px-3.5 py-2.5">
              <span className="flex items-center gap-2 text-sm">
                <Users className="size-4 text-muted-foreground" /> Students supported
              </span>
              <span className="stat-num text-sm">{kpis.total_students}</span>
            </li>
          </ul>
          <div className="mt-4 space-y-1.5 rounded-md border border-border bg-muted/30 px-3.5 py-3 text-xs text-muted-foreground">
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0" /> {office || "Address not recorded"}
            </p>
            {institution.website && (
              <p className="flex items-center gap-2">
                <Building className="size-3.5" /> {institution.website}
              </p>
            )}
            {institution.placement_office_email && (
              <p className="flex items-center gap-2">
                <Mail className="size-3.5" /> {institution.placement_office_email}
              </p>
            )}
          </div>
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Placement cell roster"
        description="Everyone on this office's account, with the email address each of them signs in with. A member is an invite until they create their own account."
        action={
          <Pill tone={members?.length ? "solid" : "muted"}>
            {members?.length ?? 0} member{(members?.length ?? 0) === 1 ? "" : "s"}
          </Pill>
        }
      >
        {members === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            The roster could not be loaded for this college.
          </p>
        ) : members.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nobody is on the roster yet.
            {canAddMembers ? " Add the first member to get started." : null}
          </p>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {members.map((member) => {
              // The overview carries the signed-in officer without an id, so the
              // one row that is "you" is matched on the email they sign in with.
              const isSelf = Boolean(
                client?.official_email && client.official_email === member.official_email,
              );
              return (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background/40 px-3.5 py-3"
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted font-display text-xs font-bold text-muted-foreground">
                    {initials(member.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {member.full_name || "Unnamed member"}
                      </span>
                      {isSelf && <Pill tone="muted">You</Pill>}
                    </p>
                    {member.official_email ? (
                      <a
                        href={`mailto:${member.official_email}`}
                        className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <Mail className="size-3 shrink-0" />
                        <span className="truncate">{member.official_email}</span>
                      </a>
                    ) : (
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        No email recorded
                      </p>
                    )}
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {[member.designation, member.employee_staff_id, member.mobile_number]
                        .filter(Boolean)
                        .join(" · ") || "Placement Officer"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Pill tone={member.is_master ? "solid" : "outline"}>
                      {ACCESS_LABEL[member.access] ?? member.access}
                    </Pill>
                    {!member.has_account && <Pill tone="muted">Invite pending</Pill>}
                    {/* Removal is a Master-owner action, and never on your own
                        row: the roster is what grants this account its access. */}
                    {canAddMembers && !isSelf && (
                      <button
                        type="button"
                        onClick={() => {
                          setRemoveError("");
                          setRemovingMember(member);
                        }}
                        title={`Remove ${member.full_name || member.official_email} from the roster`}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                      >
                        <Trash2 className="size-3" /> Remove
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        className="mt-4"
        title="What the cell manages"
        description="Every activity that runs between training and a signed offer."
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {RESPONSIBILITIES.map((r) => (
            <li key={r} className="rounded-md border border-border px-3.5 py-2.5 text-[13px]">
              <span className="mr-2 text-foreground">✓</span>
              {r}
            </li>
          ))}
        </ul>
      </Panel>

      {showingInstitute && (
        <InstituteDetailsDialog
          institution={institution}
          canEdit={Boolean(client?.is_master)}
          onClose={(updated) => {
            setShowingInstitute(false);
            // A save returns the server's copy of the record. Patch it into the
            // page's own state rather than refetching, so the panels behind the
            // dialog pick up the new values the moment it closes.
            if (updated) {
              setOverview((prev) => (prev ? { ...prev, institution: updated } : prev));
            }
          }}
        />
      )}

      {addingMember && (
        <AddMemberDialog
          emailDomain={memberDomain}
          onClose={() => setAddingMember(false)}
          onAdded={(member) =>
            setMembers((prev) =>
              prev
                ? [...prev.filter((m) => m.id !== member.id), member].sort((a, b) =>
                    a.full_name.localeCompare(b.full_name),
                  )
                : [member],
            )
          }
        />
      )}

      {/* Removal cannot be undone and it takes away a colleague's access to this
          college, so it is confirmed here rather than done on the first click. */}
      <AlertDialog
        open={removingMember !== null}
        onOpenChange={(open) => {
          if (!open && !removingMemberBusy) {
            setRemovingMember(null);
            setRemoveError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this member from the roster?</AlertDialogTitle>
            <AlertDialogDescription>
              {removingMember
                ? `${removingMember.full_name || removingMember.official_email} (${removingMember.official_email}) loses access to ${institution.name}'s dashboard immediately.`
                : ""}{" "}
              {removingMember?.has_account
                ? "Their own TalentBro account is not deleted, and their student records are left untouched."
                : "This is an invite nobody has accepted yet, so nothing else is lost."}{" "}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {removeError && (
            <p className="text-xs text-destructive" role="alert">
              {removeError}
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingMemberBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmRemoveMember();
              }}
              disabled={removingMemberBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removingMemberBusy ? "Removing…" : "Remove member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}
