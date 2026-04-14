"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchIcuTimeline, TimelineEvent, updateTelemetry } from "@/lib/api";

type StabilityLevel = "STABLE" | "WARNING" | "CRITICAL";

type StabilityNode = {
  id: string;
  patientId: string;
  level: StabilityLevel;
  occurredAtMs: number;
  occurredAtLabel: string;
  transitionFrom: StabilityLevel | null;
  isTransition: boolean;
};

const TIMELINE_LIMIT = 180;
const AUTO_REFRESH_MS = 5000;
const DEMO_SEED_PATIENT_ID = "stability-seed-demo";
const DEMO_SEED_DELAY_MS = 260;

function normalizeStabilityLevel(value: unknown): StabilityLevel {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "CRITICAL") {
    return "CRITICAL";
  }

  if (normalized === "WARNING" || normalized === "MODERATE" || normalized === "HIGH") {
    return "WARNING";
  }

  return "STABLE";
}

function toTimestampMs(value: unknown): number {
  const parsed = new Date(String(value || "")).getTime();
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function parseSystolic(value: unknown): number | null {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!match) {
    return null;
  }

  return toFiniteNumber(match[1]);
}

function deriveLevelFromTelemetry(telemetry: TimelineEvent["telemetry"] | undefined): StabilityLevel | null {
  if (!telemetry) {
    return null;
  }

  const hr = toFiniteNumber(telemetry.heartRate);
  const spo2 = toFiniteNumber(telemetry.spo2);
  const tempRaw = toFiniteNumber(telemetry.temperature);
  const systolic = parseSystolic(telemetry.bloodPressure);

  const tempF =
    tempRaw === null
      ? null
      : tempRaw <= 45
        ? (tempRaw * 9) / 5 + 32
        : tempRaw;

  if (
    (spo2 !== null && spo2 < 88) ||
    (hr !== null && (hr < 45 || hr > 140)) ||
    (tempF !== null && (tempF < 95 || tempF >= 102.2)) ||
    (systolic !== null && (systolic < 85 || systolic > 180))
  ) {
    return "CRITICAL";
  }

  if (
    (spo2 !== null && spo2 < 94) ||
    (hr !== null && (hr < 55 || hr > 100)) ||
    (tempF !== null && (tempF < 96.8 || tempF >= 100.4)) ||
    (systolic !== null && (systolic < 95 || systolic > 160))
  ) {
    return "WARNING";
  }

  return "STABLE";
}

function buildNodes(events: TimelineEvent[]): StabilityNode[] {
  const telemetryEvents = [...events]
    .filter((event) => event.eventType === "telemetry")
    .sort((left, right) => toTimestampMs(left.occurredAt) - toTimestampMs(right.occurredAt));

  const nodes: StabilityNode[] = [];
  let previousLevel: StabilityLevel | null = null;

  for (const event of telemetryEvents) {
    const derivedLevel = deriveLevelFromTelemetry(event.telemetry);
    const level = derivedLevel ?? normalizeStabilityLevel(event.riskLevel);
    const occurredAtMs = toTimestampMs(event.occurredAt);

    const node: StabilityNode = {
      id: String(event.id || `${event.patientId}-${event.occurredAt}-${nodes.length}`),
      patientId: String(event.patientId || "unknown").trim() || "unknown",
      level,
      occurredAtMs,
      occurredAtLabel: occurredAtMs > 0 ? new Date(occurredAtMs).toLocaleString() : "-",
      transitionFrom: previousLevel,
      isTransition: previousLevel !== null && previousLevel !== level,
    };

    nodes.push(node);
    previousLevel = level;
  }

  return nodes;
}

function levelBadgeClass(level: StabilityLevel): string {
  if (level === "CRITICAL") {
    return "border-rose-500/45 bg-rose-500/15 text-rose-300";
  }

  if (level === "WARNING") {
    return "border-amber-500/45 bg-amber-500/15 text-amber-300";
  }

  return "border-emerald-500/45 bg-emerald-500/15 text-emerald-300";
}

function nodeCardClass(level: StabilityLevel, isTransition: boolean): string {
  if (isTransition) {
    if (level === "CRITICAL") {
      return "border-rose-500/45 bg-rose-500/[0.10]";
    }

    if (level === "WARNING") {
      return "border-amber-500/45 bg-amber-500/[0.10]";
    }

    return "border-emerald-500/45 bg-emerald-500/[0.10]";
  }

  return "border-white/10 bg-black/25";
}

function arrowClass(level: StabilityLevel, highlight: boolean): string {
  if (!highlight) {
    return "text-slate-500";
  }

  if (level === "CRITICAL") {
    return "text-rose-300";
  }

  if (level === "WARNING") {
    return "text-amber-300";
  }

  return "text-emerald-300";
}

export default function StabilityTimeline() {
  const [selectedPatientId, setSelectedPatientId] = useState<string>("all");
  const [patientOptions, setPatientOptions] = useState<string[]>([]);
  const [nodes, setNodes] = useState<StabilityNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refreshTimeline = useCallback(
    async (showLoadingState: boolean) => {
      if (showLoadingState) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const allTimelinePromise = fetchIcuTimeline({ limit: TIMELINE_LIMIT });
        const selectedTimelinePromise =
          selectedPatientId === "all"
            ? allTimelinePromise
            : fetchIcuTimeline({ limit: TIMELINE_LIMIT, patientId: selectedPatientId });

        const [allTimeline, selectedTimeline] = await Promise.all([
          allTimelinePromise,
          selectedTimelinePromise,
        ]);

        const patientSet = new Set<string>();
        for (const event of allTimeline.events || []) {
          if (event.eventType !== "telemetry") {
            continue;
          }

          const patientId = String(event.patientId || "").trim();
          if (patientId) {
            patientSet.add(patientId);
          }
        }

        setPatientOptions(Array.from(patientSet).sort((left, right) => left.localeCompare(right)));
        setNodes(buildNodes(selectedTimeline.events || []));
        setError("");
        setLastSyncedAt(new Date().toISOString());
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Could not load stability timeline");
      } finally {
        if (showLoadingState) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [selectedPatientId]
  );

  const runDeterministicDemoSeed = useCallback(async () => {
    setSeedingDemo(true);
    setError("");

    try {
      const demoPayloads = [
        {
          patientId: DEMO_SEED_PATIENT_ID,
          monitorId: `${DEMO_SEED_PATIENT_ID}-monitor`,
          heartRate: 80,
          spo2: 98,
          temperature: 98.4,
          bloodPressure: "118/78",
        },
        {
          patientId: DEMO_SEED_PATIENT_ID,
          monitorId: `${DEMO_SEED_PATIENT_ID}-monitor`,
          heartRate: 108,
          spo2: 92,
          temperature: 100.9,
          bloodPressure: "136/88",
        },
        {
          patientId: DEMO_SEED_PATIENT_ID,
          monitorId: `${DEMO_SEED_PATIENT_ID}-monitor`,
          heartRate: 148,
          spo2: 84,
          temperature: 103.1,
          bloodPressure: "82/50",
        },
      ];

      for (const payload of demoPayloads) {
        await updateTelemetry(payload);
        await new Promise((resolve) => {
          window.setTimeout(resolve, DEMO_SEED_DELAY_MS);
        });
      }

      const [allTimeline, selectedTimeline] = await Promise.all([
        fetchIcuTimeline({ limit: TIMELINE_LIMIT }),
        fetchIcuTimeline({ limit: TIMELINE_LIMIT, patientId: DEMO_SEED_PATIENT_ID }),
      ]);

      const demoTelemetryEvents = (selectedTimeline.events || [])
        .filter((event) => event.eventType === "telemetry")
        .sort((left, right) => {
          const leftTs = Date.parse(left.occurredAt);
          const rightTs = Date.parse(right.occurredAt);
          return Number.isNaN(leftTs) || Number.isNaN(rightTs) ? 0 : leftTs - rightTs;
        });

      const latestSeedWindow = demoTelemetryEvents.slice(-demoPayloads.length);
      const nodesFromSeed =
        latestSeedWindow.length === demoPayloads.length
          ? latestSeedWindow
          : demoTelemetryEvents;

      const patientSet = new Set<string>();
      for (const event of allTimeline.events || []) {
        if (event.eventType !== "telemetry") {
          continue;
        }

        const patientId = String(event.patientId || "").trim();
        if (patientId) {
          patientSet.add(patientId);
        }
      }

      patientSet.add(DEMO_SEED_PATIENT_ID);
      setPatientOptions(Array.from(patientSet).sort((left, right) => left.localeCompare(right)));
        setNodes(buildNodes(nodesFromSeed));
      setSelectedPatientId(DEMO_SEED_PATIENT_ID);
      setLastSyncedAt(new Date().toISOString());
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not run deterministic demo seed");
    } finally {
      setSeedingDemo(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const run = async (showLoadingState: boolean) => {
      if (!active) {
        return;
      }

      await refreshTimeline(showLoadingState);
    };

    void run(true);
    intervalId = setInterval(() => {
      void run(false);
    }, AUTO_REFRESH_MS);

    return () => {
      active = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [refreshTimeline]);

  useEffect(() => {
    if (selectedPatientId === "all") {
      return;
    }

    if (patientOptions.includes(selectedPatientId)) {
      return;
    }

    setSelectedPatientId("all");
  }, [patientOptions, selectedPatientId]);

  const transitionCount = useMemo(() => {
    return nodes.reduce((count, node) => (node.isTransition ? count + 1 : count), 0);
  }, [nodes]);

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Stability Timeline</h2>
          <p className="mt-1 text-sm text-slate-400">
            Stable -&gt; Warning -&gt; Critical node flow from /icu/timeline with transition highlights.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-base btn-ghost px-3 py-2 text-xs"
            disabled={seedingDemo || loading || refreshing}
            onClick={() => {
              void runDeterministicDemoSeed();
            }}
          >
            {seedingDemo ? "Seeding demo..." : "Run Demo Seed"}
          </button>

          <button
            type="button"
            className="btn-base btn-ghost px-3 py-2 text-xs"
            disabled={seedingDemo || loading || refreshing}
            onClick={() => {
              void refreshTimeline(false);
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor="stability-patient-filter" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          patient_id
        </label>
        <select
          id="stability-patient-filter"
          className="input-dark rounded-lg px-3 py-2 text-xs"
          value={selectedPatientId}
          onChange={(event) => setSelectedPatientId(event.target.value)}
        >
          <option value="all">All Patients</option>
          {patientOptions.map((patientId) => (
            <option key={patientId} value={patientId}>
              {patientId}
            </option>
          ))}
        </select>

        <p className="ml-auto text-xs text-slate-500">
          Auto refresh: {AUTO_REFRESH_MS} ms
          {lastSyncedAt ? ` | Last sync: ${new Date(lastSyncedAt).toLocaleTimeString()}` : ""}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-emerald-300">Stable node</span>
        <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-amber-300">Warning node</span>
        <span className="rounded-full border border-rose-500/35 bg-rose-500/10 px-2 py-1 text-rose-300">Critical node</span>
        <span className="rounded-full border border-fuchsia-500/35 bg-fuchsia-500/10 px-2 py-1 text-fuchsia-200">
          {transitionCount} transition{transitionCount === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 text-cyan-200">
          demo patient: {DEMO_SEED_PATIENT_ID}
        </span>
      </div>

      {error ? <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p> : null}

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        {loading ? (
          <p className="text-sm text-slate-400">Loading stability nodes...</p>
        ) : nodes.length === 0 ? (
          <p className="text-sm text-slate-400">No telemetry timeline nodes available for the selected patient.</p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <ol className="flex min-w-max items-stretch gap-1">
              {nodes.map((node, index) => {
                const nextNode = nodes[index + 1];
                return (
                  <li key={node.id} className="flex items-center gap-2">
                    <article className={`w-56 rounded-xl border p-3 ${nodeCardClass(node.level, node.isTransition)}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${levelBadgeClass(node.level)}`}>
                          {node.level}
                        </span>
                        {node.isTransition ? (
                          <span className="rounded-full border border-fuchsia-500/45 bg-fuchsia-500/15 px-2 py-1 text-[10px] font-semibold text-fuchsia-200">
                            Transition
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-2 text-xs text-slate-300">
                        patient_id: <span className="font-semibold text-slate-100">{node.patientId}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-400">timestamp: {node.occurredAtLabel}</p>

                      {node.transitionFrom ? (
                        <p className="mt-2 text-[11px] font-semibold text-cyan-200">
                          {node.transitionFrom} -&gt; {node.level}
                        </p>
                      ) : (
                        <p className="mt-2 text-[11px] text-slate-500">Initial node</p>
                      )}
                    </article>

                    {nextNode ? (
                      <div className={`flex items-center gap-1 px-1 text-lg ${arrowClass(nextNode.level, nextNode.isTransition)}`}>
                        <span className="text-slate-600">-</span>
                        <span aria-hidden="true">&gt;</span>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
