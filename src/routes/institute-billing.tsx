import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { IndianRupee, ReceiptIndianRupee, TrendingUp, UserRound, Users } from "lucide-react";
import { Shell } from "@/components/dash/Shell";
import { Kpi, Panel, Pill } from "@/components/dash/bits";
import { GateError, GateLoading } from "@/components/load-state";
import { getInstituteBilling } from "@/lib/api";

export const Route = createFileRoute("/institute-billing")({
  head: () => ({
    meta: [
      { title: "Institute Billing — TalentBro" },
      {
        name: "description",
        content: "Pay-as-you-go billing for your TalentBro institution account.",
      },
      { property: "og:title", content: "Institute Billing — TalentBro" },
      {
        property: "og:description",
        content: "Pay as you go — settle only what your college has used.",
      },
    ],
  }),
  component: InstituteBillingPage,
});

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

// Fractional paise from per-candidate Gemini spend would otherwise render as
// "₹0" for a small bill. Keep cents when the rupee figure rounds to nothing, so
// a college that has used very little still shows it burnt something.
const inrPrecise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(amount: number): string {
  return amount > 0 && amount < 100 ? inrPrecise.format(amount) : inr.format(amount);
}

function InstituteBillingPage() {
  // The bill is the live sum of every candidate's cost_incurred, so it is
  // refetched on a timer: a student's AI spend climbs while the placement cell
  // watches the page, and a stale figure would look like a wrong one.
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["institute-billing"],
    queryFn: getInstituteBilling,
    refetchInterval: 60_000,
  });

  if (isPending) {
    return <GateLoading />;
  }

  if (error || !data) {
    return (
      <GateError
        message={error instanceof Error ? error.message : "Could not load the billing summary."}
        onRetry={() => void refetch()}
      />
    );
  }

  const billed = data.total_cost_consumed;
  // The advance is the server's figure, not a local constant, so the amount
  // deducted here can never disagree with the amount the API reports.
  const advance = data.advance_paid;
  // Clamped at zero: once the advance exceeds what the college has used the
  // college owes nothing, and a negative "payable" is a credit, not a bill.
  const due = Math.max(0, billed - advance);
  const advanceUnused = Math.max(0, advance - billed);
  const roll = data.candidate_count;

  return (
    <Shell
      title="Institute Billing"
      subtitle="Pay as you go — settle only what your college has used"
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi
            label="Billed this cycle"
            value={money(billed)}
            icon={ReceiptIndianRupee}
            hint={`Candidate profile cost consumed across ${roll} ${
              roll === 1 ? "student" : "students"
            }`}
          />
          <Kpi
            label="Advance adjusted"
            value={`− ${money(advance)}`}
            icon={IndianRupee}
            hint="Credit already paid in advance"
          />
          <Kpi
            label="Payable now"
            value={money(due)}
            icon={IndianRupee}
            hint={due === 0 ? "Fully covered by the advance" : "Amount due for this cycle"}
          />
        </div>

        <Panel
          title="Pay as you go"
          description="No lock-in. Every cycle bills only the seats and drives your college used."
          action={<Pill tone="solid">Pay as you go</Pill>}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="dash-mono-label text-muted-foreground">Amount payable</p>
                <p className="dash-stat-num mt-1 text-4xl sm:text-5xl">{money(due)}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Payable after adjusting the advance of − {money(advance)}/-
                </p>
              </div>
              <button
                type="button"
                disabled={due === 0}
                className="cursor-pointer rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {due === 0 ? "Nothing due" : `Pay ${money(due)}`}
              </button>
            </div>

            <div className="rounded-md border border-border bg-muted/40">
              <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
                <span className="text-sm">Usage this cycle</span>
                <span className="dash-stat-num text-sm">{money(billed)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
                <span className="text-sm text-muted-foreground">Less advance adjusted</span>
                <span className="dash-stat-num text-sm text-muted-foreground">
                  − {money(advance)}/-
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
                <span className="text-sm font-medium">Payable now</span>
                <span className="dash-stat-num text-sm font-semibold">{money(due)}</span>
              </div>
              {advanceUnused > 0 && (
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="text-sm text-muted-foreground">Advance carried forward</span>
                  <span className="dash-stat-num text-sm text-muted-foreground">
                    {money(advanceUnused)}
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Billed from the profile cost consumed by each of your {roll}{" "}
              {roll === 1 ? "candidate" : "candidates"}, summed live and reduced by the{" "}
              {money(advance)}/- advance already paid.
            </p>
          </div>
        </Panel>

        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi
            label="Active candidates"
            value={data.candidates_with_cost}
            icon={Users}
            hint={`of ${roll} on the roll`}
          />
          <Kpi
            label="Average per candidate"
            value={money(data.average_candidate_cost)}
            icon={UserRound}
            hint="Mean profile cost across the roll"
          />
          <Kpi
            label="Highest single candidate"
            value={money(data.highest_candidate_cost)}
            icon={TrendingUp}
            hint="Largest profile cost consumed"
          />
        </div>
      </div>
    </Shell>
  );
}
