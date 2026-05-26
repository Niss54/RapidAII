"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchIcuTimeline, TimelineEvent } from "@/lib/api";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type RiskLevel = "CRITICAL" | "MODERATE" | "WARNING" | "STABLE";

type ChartPoint = {
  timestampMs: number;
  timestampLabel: string;
  patientId: string;
  riskScore: number | null;
  hr: number | null;
  spo2: number | null;
  temp: number | null;
  bp: number | null;
  riskLevel: RiskLevel;
};

type MarkerPoint = {
  timestampMs: number;
  value: number;
  label: string;
};

const TIMELINE_LIMIT = 200;
const AUTO_REFRESH_MS = 10000;

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

function normalizeRiskLevel(value: unknown): RiskLevel {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "CRITICAL") {
    return "CRITICAL";
  }
  if (normalized === "MODERATE") {
    return "MODERATE";
  }
  if (normalized === "WARNING") {
    return "WARNING";
  }
  return "STABLE";
}

function riskLevelToScore(level: RiskLevel): number {
  if (level === "CRITICAL") {
    return 90;
  }
  if (level === "MODERATE") {
    return 70;
  }
  if (level === "WARNING") {
    return 50;
  }
  return 25;
}

function sortByTimestampAscending(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
}

function buildChartDataset(events: TimelineEvent[]): {
  points: ChartPoint[];
  alertMarkers: MarkerPoint[];
  transitionMarkers: MarkerPoint[];
} {
  const points: ChartPoint[] = [];
  const alertMarkers: MarkerPoint[] = [];
  const transitionMarkers: MarkerPoint[] = [];

  let lastRiskLevel: RiskLevel | null = null;
  let lastRiskScore = 50;

  for (const event of sortByTimestampAscending(events)) {
    const timestampMs = new Date(event.occurredAt).getTime();
    if (!Number.isFinite(timestampMs)) {
      continue;
    }

    if (event.eventType === "telemetry") {
      const riskLevel = normalizeRiskLevel(event.riskLevel);
      const riskScore = riskLevelToScore(riskLevel);

      const point: ChartPoint = {
        timestampMs,
        timestampLabel: new Date(timestampMs).toLocaleTimeString(),
        patientId: String(event.patientId || ""),
        riskScore,
        hr: toFiniteNumber(event.telemetry?.heartRate),
        spo2: toFiniteNumber(event.telemetry?.spo2),
        temp: toFiniteNumber(event.telemetry?.temperature),
        bp: parseSystolic(event.telemetry?.bloodPressure),
        riskLevel,
      };

      points.push(point);
      lastRiskScore = riskScore;

      if (lastRiskLevel && lastRiskLevel !== riskLevel) {
        transitionMarkers.push({
          timestampMs,
          value: riskScore,
          label: `${lastRiskLevel} -> ${riskLevel}`,
        });
      }

      lastRiskLevel = riskLevel;
      continue;
    }

    alertMarkers.push({
      timestampMs,
      value: lastRiskScore,
      label: String(event.message || event.alertType || "Alert event"),
    });
  }

  return {
    points,
    alertMarkers,
    transitionMarkers,
  };
}

function buildDemoTimelineEvents(filterPatientId: string): TimelineEvent[] {
  const now = Date.now();
  const demoEvents: TimelineEvent[] = [
    {
      id: "demo-timeline-telemetry-1",
      eventType: "telemetry",
      patientId: "204",
      occurredAt: new Date(now - 9 * 60 * 1000).toISOString(),
      riskLevel: "STABLE",
      telemetry: {
        heartRate: 94,
        spo2: 97,
        temperature: 98.7,
        bloodPressure: "120/78",
      },
    },
    {
      id: "demo-timeline-telemetry-2",
      eventType: "telemetry",
      patientId: "204",
      occurredAt: new Date(now - 6 * 60 * 1000).toISOString(),
      riskLevel: "WARNING",
      telemetry: {
        heartRate: 108,
        spo2: 93,
        temperature: 99.8,
        bloodPressure: "132/84",
      },
    },
    {
      id: "demo-timeline-alert-1",
      eventType: "alert",
      patientId: "204",
      occurredAt: new Date(now - 5 * 60 * 1000).toISOString(),
      riskLevel: "WARNING",
      message: "Demo warning alert triggered for rising HR trend.",
      delivered: true,
    },
    {
      id: "demo-timeline-telemetry-3",
      eventType: "telemetry",
      patientId: "demo-alert-911",
      occurredAt: new Date(now - 3 * 60 * 1000).toISOString(),
      riskLevel: "CRITICAL",
      telemetry: {
        heartRate: 146,
        spo2: 84,
        temperature: 103.1,
        bloodPressure: "82/50",
      },
    },
    {
      id: "demo-timeline-alert-2",
      eventType: "alert",
      patientId: "demo-alert-911",
      occurredAt: new Date(now - 2 * 60 * 1000).toISOString(),
      riskLevel: "CRITICAL",
      message: "Demo critical alert dispatched to escalation channels.",
      delivered: true,
    },
  ];

  if (filterPatientId === "all") {
    return demoEvents;
  }

  const filtered = demoEvents.filter((event) => event.patientId === filterPatientId);
  return filtered.length > 0 ? filtered : demoEvents.filter((event) => event.patientId === "204");
}

export default function TelemetryTimelineChart() {
  const [events, setEvents] = useState<TimelineEvent[]>(() => buildDemoTimelineEvents("all"));
  const [patientOptions, setPatientOptions] = useState<string[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Demo timeline points preloaded.");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refreshTimeline = useCallback(async (showLoadingState: boolean) => {
    if (showLoadingState) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const allTimelinePromise = fetchIcuTimeline({ limit: TIMELINE_LIMIT });
      const filteredTimelinePromise =
        selectedPatientId === "all"
          ? allTimelinePromise
          : fetchIcuTimeline({ patientId: selectedPatientId, limit: TIMELINE_LIMIT });

      const [allTimeline, filteredTimeline] = await Promise.all([allTimelinePromise, filteredTimelinePromise]);

      const optionSet = new Set<string>();
      for (const event of allTimeline.events || []) {
        const patientId = String(event.patientId || "").trim();
        if (patientId) {
          optionSet.add(patientId);
        }
      }

      const liveEvents = filteredTimeline.events || [];
      const nextOptions = Array.from(optionSet).sort((a, b) => a.localeCompare(b));
      if (liveEvents.length === 0) {
        const demoEvents = buildDemoTimelineEvents(selectedPatientId);
        const demoOptions = Array.from(
          new Set(demoEvents.map((event) => String(event.patientId || "").trim()).filter((value) => value.length > 0))
        ).sort((a, b) => a.localeCompare(b));
        setPatientOptions(nextOptions.length > 0 ? nextOptions : demoOptions);
        setEvents(demoEvents);
        setNotice("Live timeline is empty. Showing demo telemetry trend.");
      } else {
        setPatientOptions(nextOptions);
        setEvents(liveEvents);
        setNotice("");
      }
      setLastSyncedAt(new Date().toISOString());
      setError("");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not load telemetry timeline";
      const demoEvents = buildDemoTimelineEvents(selectedPatientId);
      const demoOptions = Array.from(
        new Set(demoEvents.map((event) => String(event.patientId || "").trim()).filter((value) => value.length > 0))
      ).sort((a, b) => a.localeCompare(b));
      setPatientOptions(demoOptions);
      setEvents(demoEvents);
      setNotice(`Timeline API unavailable (${message}). Showing demo telemetry trend.`);
      setError("");
    } finally {
      if (showLoadingState) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [selectedPatientId]);

  useEffect(() => {
    let active = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const run = async (showLoadingState: boolean) => {
      if (!active) {
        return;
      }

      await refreshTimeline(showLoadingState);
    };

    void run(false);
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

  const dataset = useMemo(() => buildChartDataset(events), [events]);

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Telemetry Timeline Chart</h2>
          <p className="mt-1 text-sm text-slate-400">Line chart from /icu/timeline with alert and state transition markers.</p>
        </div>

        <button
          type="button"
          className="btn-base btn-ghost px-3 py-2 text-xs"
          disabled={loading || refreshing}
          onClick={() => {
            void refreshTimeline(false);
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500" htmlFor="timeline-patient-filter">
          patient_id
        </label>
        <select
          id="timeline-patient-filter"
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

      {error ? <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p> : null}
      {notice ? <p className="mt-3 rounded-lg border border-cyan-500/35 bg-cyan-500/12 p-3 text-xs text-cyan-200">{notice}</p> : null}

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        {loading ? (
          <p className="text-sm text-slate-400">Loading telemetry timeline...</p>
        ) : dataset.points.length === 0 ? (
          <p className="text-sm text-slate-400">No telemetry timeline points available for selected patient.</p>
        ) : (
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dataset.points} margin={{ top: 12, right: 20, bottom: 12, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                <XAxis
                  dataKey="timestampMs"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(value) => new Date(Number(value)).toLocaleTimeString()}
                />
                <YAxis
                  yAxisId="risk"
                  domain={[0, 100]}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  label={{ value: "risk_score", angle: -90, fill: "#94a3b8", position: "insideLeft" }}
                />
                <YAxis
                  yAxisId="vitals"
                  orientation="right"
                  domain={[0, 220]}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(3, 7, 18, 0.94)",
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    borderRadius: "0.75rem",
                  }}
                  labelFormatter={(value) => `timestamp: ${new Date(Number(value)).toLocaleString()}`}
                />
                <Legend verticalAlign="top" height={28} wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />

                <Line yAxisId="vitals" type="monotone" dataKey="hr" stroke="#22d3ee" strokeWidth={2} dot={false} name="HR" />
                <Line yAxisId="vitals" type="monotone" dataKey="spo2" stroke="#f97316" strokeWidth={2} dot={false} name="SpO2" />
                <Line yAxisId="vitals" type="monotone" dataKey="temp" stroke="#facc15" strokeWidth={2} dot={false} name="Temp" />
                <Line yAxisId="vitals" type="monotone" dataKey="bp" stroke="#34d399" strokeWidth={2} dot={false} name="BP" />
                <Line
                  yAxisId="risk"
                  type="monotone"
                  dataKey="riskScore"
                  stroke="#a78bfa"
                  strokeWidth={2.5}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                  name="Risk Score"
                />

                <Scatter
                  yAxisId="risk"
                  data={dataset.alertMarkers}
                  dataKey="value"
                  fill="#ef4444"
                  shape="triangle"
                  legendType="none"
                />
                <Scatter
                  yAxisId="risk"
                  data={dataset.transitionMarkers}
                  dataKey="value"
                  fill="#38bdf8"
                  shape="diamond"
                  legendType="none"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-rose-500/35 bg-rose-500/10 px-2 py-1 text-rose-300">alert events marker</span>
        <span className="rounded-full border border-sky-500/35 bg-sky-500/10 px-2 py-1 text-sky-200">state transition marker</span>
      </div>
    </section>
  );
}
