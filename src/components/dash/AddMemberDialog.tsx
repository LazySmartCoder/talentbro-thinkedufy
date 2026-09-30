import { useState, type FormEvent } from "react";
import { Copy, Loader2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  addPlacementCellMember,
  type PlacementCellMember,
  type PlacementCellMemberPayload,
} from "@/lib/api";

const EMPTY = {
  full_name: "",
  official_email: "",
  designation: "",
  mobile_number: "",
  employee_staff_id: "",
  access: "beta",
};

type Draft = typeof EMPTY;

const inputCls =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20";

// The part of a college address a person actually types: no '@', no dots-only
// punctuation, no spaces. Dots are common in Indian college ids (arun.sharma@).
const LOCAL_PART = /^[A-Za-z0-9._%+-]+$/;

/**
 * Add a colleague to the placement department.
 *
 * The member is created as a ClientProfile on this same institution, so they
 * land in the same dashboards the owner is looking at. They start with Beta
 * (read-only) access unless the owner deliberately grants Master.
 *
 * The email is locked to the inviter's own domain: the office is staffed by the
 * college, so `emailDomain` renders as a read-only suffix on the email field
 * and only the username is typed. Passing an empty domain falls back to a plain
 * email input rather than locking the owner out of their own roster.
 */
export function AddMemberDialog({
  onClose,
  onAdded,
  emailDomain = "",
}: {
  onClose: () => void;
  onAdded: (member: PlacementCellMember) => void;
  /** Domain of the signed-in officer, e.g. "christuniversity.edu.in". */
  emailDomain?: string;
}) {
  const domain = emailDomain.trim().replace(/^@/, "").toLowerCase();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [invited, setInvited] = useState<PlacementCellMember | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  // draft.official_email holds only the username; the domain is appended on the
  // way out. An '@' in the field means a full address was pasted in: keep the
  // username when the pasted domain is ours, and leave a foreign domain in place
  // so the error below explains what is wrong with it.
  function onEmailChange(value: string) {
    const at = value.lastIndexOf("@");
    if (at === -1) return set("official_email", value);
    const typed = value.slice(at + 1);
    // Mid-typing at the boundary: the domain is not there yet, so drop the '@'.
    if (typed === "") return set("official_email", value.slice(0, at));
    set("official_email", typed.toLowerCase() === domain ? value.slice(0, at) : value);
  }

  const local = draft.official_email.trim();
  const email = domain ? `${local}@${domain}` : local;
  const emailError =
    !domain || local === ""
      ? null
      : local.includes("@")
        ? `That address is not on ${domain}. Use @${domain}.`
        : !LOCAL_PART.test(local)
          ? "Usernames can only have letters, numbers, dots, dashes and underscores."
          : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (emailError) {
      toast.error(emailError);
      return;
    }
    setSaving(true);
    try {
      const payload: PlacementCellMemberPayload = {
        full_name: draft.full_name.trim(),
        official_email: email,
        designation: draft.designation.trim(),
        mobile_number: draft.mobile_number.trim(),
        employee_staff_id: draft.employee_staff_id.trim(),
        access: draft.access as NonNullable<PlacementCellMemberPayload["access"]>,
      };
      const res = await addPlacementCellMember(payload);
      setInvited(res.member);
      onAdded(res.member);
      toast.success(`Added ${res.member.full_name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the member.");
    } finally {
      setSaving(false);
    }
  }

  // No account is made here, so there is no password to hand over: all the owner
  // has to do is tell the person which address to register with.
  if (invited) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center">
        <div className="panel w-full max-w-md">
          <div className="flex items-start justify-between border-b border-border px-6 py-5">
            <div>
              <h2 className="text-lg font-bold">{invited.full_name} added</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                They can sign in at the institution portal as soon as they register.
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1 hover:bg-accent">
              <X className="size-4" />
            </button>
          </div>
          <div className="px-6 py-5">
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
              <code className="select-all truncate font-mono text-sm">
                {invited.official_email}
              </code>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(invited.official_email);
                  toast.success("Email copied");
                }}
                aria-label="Copy email address"
                className="rounded-md p-1.5 hover:bg-accent"
              >
                <Copy className="size-3.5" />
              </button>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              No account was created. Ask {invited.full_name.split(" ")[0]} to sign up with this
              exact address and set their own password — the place on your roster is already
              reserved.
            </p>
          </div>
          <div className="flex justify-end border-t border-border px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center">
      <div className="panel w-full max-w-lg overflow-y-auto">
        <form onSubmit={submit}>
          <div className="flex items-start justify-between border-b border-border px-6 py-5">
            <div>
              <h2 className="text-lg font-bold">Add a placement cell member</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                They join this college's placement department and can sign in straight away.
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
              <label className="mono-label" htmlFor="am-name">
                Full name
              </label>
              <input
                id="am-name"
                required
                value={draft.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="e.g. Priya Menon"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mono-label" htmlFor="am-email">
                Official email
              </label>
              <div
                className={`mt-1.5 flex items-stretch overflow-hidden rounded-md border bg-card focus-within:ring-2 ${
                  emailError
                    ? "border-destructive focus-within:ring-destructive/20"
                    : "border-input focus-within:ring-ring/20"
                }`}
              >
                <input
                  id="am-email"
                  type={domain ? "text" : "email"}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  value={draft.official_email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  placeholder={domain ? "name" : "name@college.edu"}
                  aria-invalid={emailError ? true : undefined}
                  className="h-9 w-full min-w-0 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground/60"
                />
                {domain && (
                  <span className="flex items-center border-l border-input px-3 font-mono text-sm text-muted-foreground">
                    @{domain}
                  </span>
                )}
              </div>
              {emailError ? (
                <p className="mt-1.5 text-[11px] text-destructive">{emailError}</p>
              ) : (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {domain
                    ? "Same domain as your own address. This is also their sign-in username."
                    : "This is also their sign-in username."}
                </p>
              )}
            </div>
            <div>
              <label className="mono-label" htmlFor="am-designation">
                Designation
              </label>
              <input
                id="am-designation"
                required
                value={draft.designation}
                onChange={(e) => set("designation", e.target.value)}
                placeholder="e.g. Placement Coordinator"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="mono-label" htmlFor="am-mobile">
                Mobile number
              </label>
              <input
                id="am-mobile"
                required
                inputMode="numeric"
                value={draft.mobile_number}
                onChange={(e) => set("mobile_number", e.target.value)}
                placeholder="10-digit number"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="mono-label" htmlFor="am-empid">
                Employee ID
              </label>
              <input
                id="am-empid"
                value={draft.employee_staff_id}
                onChange={(e) => set("employee_staff_id", e.target.value)}
                placeholder="Optional"
                className={`${inputCls} mt-1.5`}
              />
            </div>
            <div>
              <label className="mono-label" htmlFor="am-access">
                Access level
              </label>
              <select
                id="am-access"
                value={draft.access}
                onChange={(e) => set("access", e.target.value)}
                className={`${inputCls} mt-1.5`}
              >
                <option value="beta">Beta — view only</option>
                <option value="master">Master — full access</option>
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
              disabled={saving || emailError !== null}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <UserPlus className="size-3.5" />
              )}
              {saving ? "Adding…" : "Add member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
