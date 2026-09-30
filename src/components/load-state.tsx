import { useEffect, useMemo, useRef, useState } from "react";
import { randomMotivationQuote, sampleMotivationQuotes } from "@/lib/quotes";
import { shouldShowLoadingQuotes } from "@/lib/user-role";

// Full-page "Loading…" gate. Shows an animated spinner immediately and, if the
// request lingers, a short hint so a slow server never looks like a frozen
// white screen.
//
// The motivation quote is for candidates. College staff see the spinner alone —
// they are not the audience for "your competition is practicing" — so the gate
// asks the remembered account role rather than re-reading the session, which
// would just be more waiting on top of the wait being covered.
export function GateLoading({ slowHintMs = 6000 }: { slowHintMs?: number }) {
  const [slow, setSlow] = useState(false);
  const [showQuotes] = useState(shouldShowLoadingQuotes);
  const [quote] = useState(randomMotivationQuote);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), slowHintMs);
    return () => clearTimeout(timer);
  }, [slowHintMs]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-muted-foreground">
      <div
        aria-hidden
        className="size-7 animate-spin rounded-full border-2 border-border border-t-foreground"
      />
      {showQuotes && <p className="max-w-md text-center text-sm leading-relaxed">{quote}</p>}
      {slow && (
        <p className="max-w-xs text-center text-xs leading-relaxed text-muted-foreground/80">
          Still working — this can take a moment when the server is busy. If it doesn&rsquo;t finish
          shortly, you&rsquo;ll be able to retry.
        </p>
      )}
    </div>
  );
}

// Pre-training quote splash: flashes a few motivation quotes, one at a time,
// over a fixed window, then hands off via onDone. Pass `quotes` to draw
// exclusively from a custom pool (e.g. the interview-motivation set).
export function QuoteSplash({
  count = 3,
  durationMs = 6000,
  quotes,
  onDone,
}: {
  count?: number;
  durationMs?: number;
  quotes?: readonly string[];
  onDone: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-muted-foreground">
      <QuoteSplashContent
        count={count}
        durationMs={durationMs}
        onDone={onDone}
        {...(quotes ? { quotes } : {})}
      />
    </div>
  );
}

// The rotating quote (word) + progress dots, without the full-page wrapper, so
// it can be embedded inside custom loading screens (e.g. the mock-interview
// launch) while keeping identical pacing and visuals.
export function QuoteSplashContent({
  count = 3,
  durationMs = 6000,
  quotes,
  onDone,
}: {
  count?: number;
  durationMs?: number;
  quotes?: readonly string[];
  onDone?: () => void;
}) {
  const [step, setStep] = useState(0);
  const picked = useMemo(() => {
    const pool = quotes && quotes.length > 0 ? quotes : undefined;
    return sampleMotivationQuotes(count, pool);
  }, [count, quotes]);

  // Keep `onDone` in a ref so a re-rendering parent (live mic levels, realtime
  // speaking-word highlights, …) can never reset the splash's timer by handing
  // us a brand-new callback each frame. The splash always advances on schedule.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timer = setTimeout(
      () => (step + 1 >= count ? onDoneRef.current?.() : setStep(step + 1)),
      durationMs / count,
    );
    return () => clearTimeout(timer);
  }, [step, count, durationMs]);

  const current = picked[step];

  return (
    <>
      <div
        aria-hidden
        className="size-7 animate-spin rounded-full border-2 border-border border-t-foreground"
      />
      <div className="flex h-20 items-center justify-center">
        {current && (
          <p
            key={step}
            className="animate-rise max-w-lg text-center text-base leading-relaxed sm:text-lg"
          >
            &ldquo;{current}&rdquo;
          </p>
        )}
      </div>
      <div aria-hidden className="flex gap-1.5">
        {Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            className={`h-1 w-8 rounded-full transition-colors ${
              i <= step ? "bg-primary" : "bg-border"
            }`}
          />
        ))}
      </div>
    </>
  );
}

// Drives a one-time quote splash for a page: returns { splash, splashDone }.
// Render `splash` before the page content until splashDone turns true.
export function useQuoteSplash() {
  const [splashDone, setSplashDone] = useState(false);
  // The splash is nothing but quotes, so for college staff it is skipped
  // outright rather than rendered as an empty screen for six seconds.
  const [eligible] = useState(shouldShowLoadingQuotes);
  const splash =
    eligible && !splashDone ? <QuoteSplash onDone={() => setSplashDone(true)} /> : null;
  return { splashDone: !eligible || splashDone, splash };
}

// Full-page error state. Shows the real reason (network refused vs timeout) so
// users aren't told the backend is down when it was just slow.
export function GateError({
  message,
  onRetry,
}: {
  message?: string | null | undefined;
  onRetry?: () => void;
}) {
  const detail =
    (message ?? "").trim() || "Something went wrong while loading this page. Please try again.";
  const retry = onRetry ?? (() => window.location.reload());

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn&rsquo;t load</h1>
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
