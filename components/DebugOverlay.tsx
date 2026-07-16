"use client";

import {
  Suspense,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  subscribeDebug,
  getDebugState,
  getServerDebugState,
  clearDebugState,
  type DebugEntry,
  type DecisionTimeline,
} from "@/lib/debug/debugBus";
import { getSegment } from "@/lib/tracking/trackEvent";
import { getInteractionCounts } from "@/lib/personalization/engagement";
import type { PersonalizationDecidedEvent } from "@/lib/tracking/types";

const DEBUG_KEY = "mtp_debug";

/**
 * Decision-debugger overlay.
 *
 * Toggle with `?debug=1` (off with `?debug=0`); the flag persists in
 * sessionStorage so it survives client-side navigation, where the query
 * param disappears. Read-only observer of the debug bus — it never fires
 * events or touches the personalization pipeline itself.
 */
export default function DebugOverlay() {
  return (
    // useSearchParams requires a Suspense boundary during static rendering.
    <Suspense fallback={null}>
      <DebugOverlayInner />
    </Suspense>
  );
}

function DebugOverlayInner() {
  const searchParams = useSearchParams();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const param = searchParams.get("debug");
    if (param === "1") window.sessionStorage.setItem(DEBUG_KEY, "1");
    else if (param === "0") window.sessionStorage.removeItem(DEBUG_KEY);
    setEnabled(window.sessionStorage.getItem(DEBUG_KEY) === "1");
  }, [searchParams]);

  if (!enabled) return null;

  return (
    <DebugPanel
      onClose={() => {
        window.sessionStorage.removeItem(DEBUG_KEY);
        setEnabled(false);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

function DebugPanel({ onClose }: { onClose: () => void }) {
  const state = useSyncExternalStore(
    subscribeDebug,
    getDebugState,
    getServerDebugState
  );
  const pathname = usePathname();

  const [segment, setSegment] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    setSegment(getSegment());
    setCounts(getInteractionCounts());
  }, [state, pathname]);

  const lastDecision = [...state.entries]
    .reverse()
    .find(
      (e) =>
        e.kind === "event" &&
        (e.payload as { event?: string } | undefined)?.event ===
          "personalization_decided"
    );
  const decision = lastDecision
    ? (lastDecision.payload as PersonalizationDecidedEvent).personalization
    : null;

  return (
    <aside
      data-testid="debug-overlay"
      aria-label="Decision debugger"
      className="fixed bottom-4 right-4 z-[60] flex max-h-[70vh] w-[22.5rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-stone-700 bg-stone-950/95 font-mono text-[11px] leading-relaxed text-stone-300 shadow-2xl backdrop-blur"
    >
      <header className="flex items-center justify-between border-b border-stone-800 px-3 py-2">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-stone-100">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          DECISION DEBUGGER
        </p>
        <span className="flex items-center gap-2">
          <button
            data-testid="debug-clear"
            onClick={clearDebugState}
            className="rounded px-1.5 py-0.5 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
          >
            clear
          </button>
          <button
            data-testid="debug-close"
            onClick={onClose}
            aria-label="Close debugger"
            className="rounded px-1.5 py-0.5 text-stone-500 hover:bg-stone-800 hover:text-stone-200"
          >
            ✕
          </button>
        </span>
      </header>

      <div className="overflow-y-auto">
        {/* -- segment ------------------------------------------------------- */}
        <Section title="Segment">
          <div className="flex items-center justify-between gap-2">
            <span
              data-testid="debug-segment"
              className={
                segment
                  ? "rounded-full bg-emerald-950 px-2 py-0.5 font-semibold text-emerald-300 ring-1 ring-emerald-700"
                  : "rounded-full bg-stone-800 px-2 py-0.5 text-stone-400"
              }
            >
              {segment ?? "none"}
            </span>
            <span className="truncate text-stone-500">{pathname}</span>
          </div>
        </Section>

        {/* -- last decision -------------------------------------------------- */}
        <Section title="Last decision">
          {decision ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className="text-stone-500">strategy</dt>
              <dd>
                <span
                  data-testid="debug-strategy"
                  className={strategyColor(decision.strategy)}
                >
                  {decision.strategy}
                </span>
              </dd>
              <dt className="text-stone-500">variant</dt>
              <dd className="truncate text-stone-200">{decision.variant}</dd>
              <dt className="text-stone-500">decided_before_paint</dt>
              <dd
                data-testid="debug-before-paint"
                className={
                  decision.decided_before_paint
                    ? "font-semibold text-emerald-400"
                    : "font-semibold text-red-400"
                }
              >
                {String(decision.decided_before_paint)}
              </dd>
              <dt className="text-stone-500">latency</dt>
              <dd className="text-stone-200">{decision.latency_ms} ms</dd>
            </dl>
          ) : (
            <p className="text-stone-500">
              No decision yet — open a page with a personalized slot.
            </p>
          )}
        </Section>

        {/* -- timeline -------------------------------------------------------- */}
        <Section title="Timeline">
          <TimelineView timeline={state.timeline} />
        </Section>

        {/* -- engagement ------------------------------------------------------ */}
        <Section title="Engagement">
          <EngagementView counts={counts} />
        </Section>

        {/* -- event log ------------------------------------------------------- */}
        <Section title={`Events (${state.entries.length})`}>
          {state.entries.length === 0 ? (
            <p className="text-stone-500">No events recorded yet.</p>
          ) : (
            <ul data-testid="debug-events" className="space-y-0.5">
              {[...state.entries]
                .reverse()
                .slice(0, 12)
                .map((entry) => (
                  <EventRow key={entry.id} entry={entry} />
                ))}
            </ul>
          )}
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-stone-800/70 px-3 py-2 last:border-b-0">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-stone-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function strategyColor(strategy: string): string {
  switch (strategy) {
    case "local-first":
      return "font-semibold text-emerald-400";
    case "bootstrapped":
      return "font-semibold text-sky-400";
    default:
      return "font-semibold text-amber-400";
  }
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function fmtDelta(ms: number): string {
  if (ms < 1) return "0ms";
  if (ms < 1000) return `+${Math.round(ms)}ms`;
  return `+${(ms / 1000).toFixed(2)}s`;
}

function TimelineView({ timeline }: { timeline: DecisionTimeline | null }) {
  if (!timeline) {
    return (
      <p data-testid="debug-timeline" className="text-stone-500">
        Waiting for a destination view to seed a segment…
      </p>
    );
  }

  const t0 = timeline.eventFiredAt;
  const steps = [
    {
      key: "fired",
      done: true,
      label: `${timeline.sourceEvent} fired`,
      delta: "0ms",
      note: null as string | null,
    },
    {
      key: "stamped",
      done: timeline.segmentStampedAt !== undefined,
      label: `segment stamped → ${timeline.segment}`,
      delta:
        timeline.segmentStampedAt !== undefined
          ? fmtDelta(timeline.segmentStampedAt - t0)
          : "…",
      note: null as string | null,
    },
    {
      key: "decided",
      done: timeline.decidedAt !== undefined,
      label:
        timeline.decidedAt !== undefined
          ? `personalized render on ${timeline.decidedPath}`
          : "personalized render — waiting for next page…",
      delta: timeline.decidedAt !== undefined ? fmtDelta(timeline.decidedAt - t0) : "…",
      note:
        timeline.decidedAt !== undefined
          ? `${timeline.strategy} · before paint: ${timeline.decidedBeforePaint} · decision ${timeline.latencyMs}ms`
          : null,
    },
  ];

  return (
    <ol data-testid="debug-timeline" className="space-y-0">
      {steps.map((step, i) => (
        <li key={step.key} className="relative pl-4">
          {i < steps.length - 1 && (
            <span className="absolute left-[3px] top-3 h-full w-px bg-stone-700" />
          )}
          <span
            className={`absolute left-0 top-1.5 h-[7px] w-[7px] rounded-full ${
              step.done ? "bg-emerald-400" : "border border-stone-600 bg-stone-900"
            }`}
          />
          <div className="flex items-baseline justify-between gap-2">
            <span className={step.done ? "text-stone-200" : "text-stone-500"}>
              {step.label}
            </span>
            <span className="shrink-0 text-stone-500">{step.delta}</span>
          </div>
          {step.note && <p className="pb-1 text-[10px] text-stone-500">{step.note}</p>}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Engagement
// ---------------------------------------------------------------------------

function EngagementView({ counts }: { counts: Record<string, number> }) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    return (
      <p data-testid="debug-engagement" className="text-stone-500">
        No interactions yet — view a destination or click a CTA.
      </p>
    );
  }
  return (
    <ul data-testid="debug-engagement" className="space-y-0.5">
      {sorted.slice(0, 5).map(([slug, count], i) => (
        <li key={slug} className="flex items-baseline justify-between gap-2">
          <span className={i === 0 ? "text-stone-100" : "text-stone-400"}>
            {slug}
            {i === 0 && (
              <span className="ml-2 rounded bg-stone-800 px-1 py-px text-[9px] uppercase tracking-wider text-emerald-300">
                top-left pick
              </span>
            )}
          </span>
          <span className="text-stone-500">×{count}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

function fmtClock(at: number): string {
  const d = new Date(at);
  return `${d.toLocaleTimeString(undefined, { hour12: false })}.${String(
    d.getMilliseconds()
  ).padStart(3, "0")}`;
}

function kindColor(kind: DebugEntry["kind"]): string {
  switch (kind) {
    case "event":
      return "text-sky-300";
    case "stamp":
      return "text-emerald-300";
    case "engagement":
      return "text-amber-300";
    case "delivery":
      return "text-fuchsia-300";
  }
}

function EventRow({ entry }: { entry: DebugEntry }) {
  return (
    <li>
      <details className="group rounded hover:bg-stone-900">
        <summary className="flex cursor-pointer list-none items-baseline gap-2 px-1 py-0.5 [&::-webkit-details-marker]:hidden">
          <span className="shrink-0 text-stone-600">{fmtClock(entry.at)}</span>
          <span className={`truncate ${kindColor(entry.kind)}`}>{entry.label}</span>
          <span className="ml-auto shrink-0 text-stone-600">{entry.path}</span>
        </summary>
        {entry.payload !== undefined && (
          <pre className="mx-1 mb-1 overflow-x-auto rounded bg-stone-900 p-2 text-[10px] text-stone-400">
            {JSON.stringify(entry.payload, null, 2)}
          </pre>
        )}
      </details>
    </li>
  );
}
