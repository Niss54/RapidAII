"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnalyticsAlertRecord,
  AnalyticsPatientState,
  fetchAnalyticsAlerts,
  fetchAnalyticsPatients,
} from "@/lib/api";

type AlertSeverity = "critical" | "warning" | "stable";
type SeverityFilter = "all" | "critical" | "warning";

type AlertTimelineEntry = {
  id: string;
  severity: AlertSeverity;
  patientId: string;
  alertReason: string;
  timestampMs: number;
  timestampLabel: string;
  riskScoreLabel: string;
  duplicateSuppressed: boolean;
  cooldownRemainingSeconds: number;
};

const AUTO_REFRESH_INTERVAL_MS = 3000;
const NEW_ALERT_WINDOW_MS = 10000;
const CRITICAL_ALERT_SOUND_SRC = "/assets/alert.mp3";
const CRITICAL_ALERT_SOUND_MAX_PLAY_MS = 6000;

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSeverity(value: unknown): AlertSeverity {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "critical" || normalized === "urgent") {
    return "critical";
  }

  if (normalized === "warning" || normalized === "high" || normalized === "moderate") {
    return "warning";
  }

  return "stable";
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return null;
}

function resolveCooldownRemainingSeconds(alert: AnalyticsAlertRecord): number {
  const raw = alert.cooldown_remaining_seconds ?? alert.cooldownRemainingSeconds;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(parsed));
}

function resolveDuplicateSuppressed(
  alert: AnalyticsAlertRecord,
  cooldownRemainingSeconds: number
): boolean {
  const explicit = toBoolean(alert.duplicate_suppressed ?? alert.duplicateSuppressed);
  if (explicit !== null) {
    return explicit;
  }

  return cooldownRemainingSeconds > 0;
}

function formatTimestamp(epochSeconds: number): { ms: number; label: string } {
  const safeEpoch = toFiniteNumber(epochSeconds) ?? 0;
  if (safeEpoch <= 0) {
    return {
      ms: 0,
      label: "-",
    };
  }

  const milliseconds = safeEpoch * 1000;
  return {
    ms: milliseconds,
    label: new Date(milliseconds).toLocaleString(),
  };
}

function resolvePatientRiskMap(patients: AnalyticsPatientState[]): Record<string, string> {
  const map: Record<string, string> = {};

  for (const patient of patients) {
    const patientId = String(patient.patient_id || "").trim();
    if (!patientId) {
      continue;
    }

    const riskScore = toFiniteNumber(patient.risk_score);
    map[patientId] = riskScore === null ? "-" : `${Math.round(riskScore)}`;
  }

  return map;
}

function buildTimelineEntries(
  alerts: AnalyticsAlertRecord[],
  patientRiskMap: Record<string, string>
): AlertTimelineEntry[] {
  const rows = alerts.map((alert) => {
    const patientId = String(alert.patient_id || "unknown").trim() || "unknown";
    const reason = String(alert.reason || alert.alert_reason || "-").trim() || "-";
    const timestamp = formatTimestamp(toFiniteNumber(alert.timestamp) ?? 0);
    const severity = normalizeSeverity(alert.severity);
    const cooldownRemainingSeconds = resolveCooldownRemainingSeconds(alert);
    const duplicateSuppressed = resolveDuplicateSuppressed(alert, cooldownRemainingSeconds);

    return {
      id: `${patientId}-${timestamp.ms}-${severity}-${reason}`,
      severity,
      patientId,
      alertReason: reason,
      timestampMs: timestamp.ms,
      timestampLabel: timestamp.label,
      riskScoreLabel: patientRiskMap[patientId] ?? "-",
      duplicateSuppressed,
      cooldownRemainingSeconds,
    };
  });

  rows.sort((a, b) => b.timestampMs - a.timestampMs);
  return rows;
}

function severityBadgeClass(severity: AlertSeverity): string {
  if (severity === "critical") {
    return "border-rose-500/45 bg-rose-500/15 text-rose-300";
  }

  if (severity === "warning") {
    return "border-orange-500/45 bg-orange-500/15 text-orange-300";
  }

  return "border-emerald-500/45 bg-emerald-500/15 text-emerald-300";
}

function severityDotClass(severity: AlertSeverity): string {
  if (severity === "critical") {
    return "bg-rose-400 shadow-[0_0_0_4px_rgba(244,63,94,0.15)]";
  }

  if (severity === "warning") {
    return "bg-orange-400 shadow-[0_0_0_4px_rgba(251,146,60,0.16)]";
  }

  return "bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.16)]";
}

function buildDemoTimelineEntries(): AlertTimelineEntry[] {
  const now = Date.now();
  return [
    {
      id: "demo-alert-critical-1",
      severity: "critical",
      patientId: "305",
      alertReason: "SpO2 dropped below 90 with hypotension trend.",
      timestampMs: now - 35 * 1000,
      timestampLabel: new Date(now - 35 * 1000).toLocaleString(),
      riskScoreLabel: "86",
      duplicateSuppressed: false,
      cooldownRemainingSeconds: 0,
    },
    {
      id: "demo-alert-warning-1",
      severity: "warning",
      patientId: "204",
      alertReason: "Sustained fever with rising HR trend.",
      timestampMs: now - 2 * 60 * 1000,
      timestampLabel: new Date(now - 2 * 60 * 1000).toLocaleString(),
      riskScoreLabel: "61",
      duplicateSuppressed: true,
      cooldownRemainingSeconds: 18,
    },
    {
      id: "demo-alert-critical-2",
      severity: "critical",
      patientId: "demo-alert-911",
      alertReason: "Demo test alert: tachycardia + low oxygen saturation.",
      timestampMs: now - 4 * 60 * 1000,
      timestampLabel: new Date(now - 4 * 60 * 1000).toLocaleString(),
      riskScoreLabel: "92",
      duplicateSuppressed: false,
      cooldownRemainingSeconds: 0,
    },
  ];
}

export default function AlertsTimelinePanel() {
  const [entries, setEntries] = useState<AlertTimelineEntry[]>(() => buildDemoTimelineEntries());
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Demo alerts preloaded for presentation.");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const knownEntryIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedEntryIdsRef = useRef(false);
  const playedCriticalIdsRef = useRef<Set<string>>(new Set());
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopAudioTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopCriticalAlertSound = useCallback(() => {
    if (stopAudioTimerRef.current) {
      clearTimeout(stopAudioTimerRef.current);
      stopAudioTimerRef.current = null;
    }

    const audio = alertAudioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
  }, []);

  const triggerCriticalAlertSound = useCallback(
    (alertId: string) => {
      const normalizedAlertId = String(alertId || "").trim();
      if (!normalizedAlertId || playedCriticalIdsRef.current.has(normalizedAlertId)) {
        return;
      }

      playedCriticalIdsRef.current.add(normalizedAlertId);

      if (!alertAudioRef.current) {
        const nextAudio = new Audio(CRITICAL_ALERT_SOUND_SRC);
        nextAudio.loop = false;
        alertAudioRef.current = nextAudio;
      }

      const audio = alertAudioRef.current;
      audio.loop = false;

      stopCriticalAlertSound();
      console.log("Critical alert sound triggered");
      void audio.play().catch(() => undefined);

      stopAudioTimerRef.current = setTimeout(() => {
        stopCriticalAlertSound();
      }, CRITICAL_ALERT_SOUND_MAX_PLAY_MS);
    },
    [stopCriticalAlertSound]
  );

  const refreshTimeline = useCallback(async (showLoadingState: boolean) => {
    if (showLoadingState) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [alertsResponse, patientsResponse] = await Promise.all([
        fetchAnalyticsAlerts({ limit: 200 }),
        fetchAnalyticsPatients(),
      ]);

      const alerts = Array.isArray(alertsResponse.alerts) ? alertsResponse.alerts : [];
      const patients = Array.isArray(patientsResponse.patients) ? patientsResponse.patients : [];
      const patientRiskMap = resolvePatientRiskMap(patients);
      const nextEntries = buildTimelineEntries(alerts, patientRiskMap);
      const incomingIds = nextEntries
        .map((entry) => entry.id)
        .filter((id) => !knownEntryIdsRef.current.has(id));

      if (hasInitializedEntryIdsRef.current) {
        const criticalIncomingIds = nextEntries
          .filter(
            (entry) => entry.severity === "critical" && incomingIds.includes(entry.id)
          )
          .map((entry) => entry.id);

        for (const criticalAlertId of criticalIncomingIds) {
          triggerCriticalAlertSound(criticalAlertId);
        }
      }

      knownEntryIdsRef.current = new Set(nextEntries.map((entry) => entry.id));
      hasInitializedEntryIdsRef.current = true;

      if (nextEntries.length === 0) {
        setEntries(buildDemoTimelineEntries());
        setNotice("Live alerts are empty. Showing demo alert timeline.");
      } else {
        setEntries(nextEntries);
        setNotice("");
      }
      setError("");
      setLastSyncedAt(new Date().toISOString());
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not load alerts timeline";
      setEntries(buildDemoTimelineEntries());
      setNotice(`Alerts API unavailable (${message}). Showing demo alert timeline.`);
      setError("");
    } finally {
      if (showLoadingState) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [triggerCriticalAlertSound]);

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
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      if (intervalId) {
        clearInterval(intervalId);
      }

      stopCriticalAlertSound();
    };
  }, [refreshTimeline, stopCriticalAlertSound]);

  const filteredEntries = useMemo(() => {
    if (severityFilter === "all") {
      return entries;
    }

    return entries.filter((entry) => entry.severity === severityFilter);
  }, [entries, severityFilter]);

  const nowMs = Date.now();

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Alerts Timeline Panel</h2>
          <p className="mt-1 text-sm text-slate-400">Vertical timeline from /api/v1/alerts sorted by latest timestamp.</p>
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[
          { id: "all", label: "All" },
          { id: "critical", label: "Critical" },
          { id: "warning", label: "Warning" },
        ].map((option) => {
          const selected = severityFilter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                selected
                  ? "border-cyan-500/45 bg-cyan-500/15 text-cyan-100"
                  : "border-white/15 bg-white/[0.03] text-slate-300 hover:border-cyan-500/35 hover:text-cyan-200"
              }`}
              onClick={() => setSeverityFilter(option.id as SeverityFilter)}
            >
              {option.label}
            </button>
          );
        })}

        <p className="ml-auto text-xs text-slate-500">
          Auto refresh: {AUTO_REFRESH_INTERVAL_MS} ms
          {lastSyncedAt ? ` | Last sync: ${new Date(lastSyncedAt).toLocaleTimeString()}` : ""}
        </p>
      </div>

      {error ? <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p> : null}
      {notice ? <p className="mt-3 rounded-lg border border-cyan-500/35 bg-cyan-500/12 p-3 text-xs text-cyan-200">{notice}</p> : null}

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
        {loading ? (
          <p className="text-sm text-slate-400">Loading alerts timeline...</p>
        ) : filteredEntries.length === 0 ? (
          <p className="text-sm text-slate-400">No alerts found for selected severity filter.</p>
        ) : (
          <ol className="relative ml-2 border-l border-white/15 pl-6">
            {filteredEntries.map((entry) => {
              const isNew = entry.timestampMs > 0 && nowMs - entry.timestampMs < NEW_ALERT_WINDOW_MS;

              return (
                <li key={entry.id} className="mb-5 last:mb-0">
                  <span className={`absolute -left-[7px] mt-1 h-3.5 w-3.5 rounded-full ${severityDotClass(entry.severity)}`} />

                  <article className="feature-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase ${severityBadgeClass(entry.severity)}`}>
                        {entry.severity}
                      </span>

                      {isNew ? (
                        <span className="rounded-full border border-fuchsia-500/45 bg-fuchsia-500/15 px-2.5 py-1 text-xs font-semibold text-fuchsia-200">
                          NEW ALERT
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 grid gap-1 text-sm text-slate-300 md:grid-cols-2">
                      <p>
                        patient_id: <span className="font-semibold text-slate-100">{entry.patientId}</span>
                      </p>
                      <p>
                        risk_score: <span className="font-semibold text-slate-100">{entry.riskScoreLabel}</span>
                      </p>
                      <p className="md:col-span-2">
                        alert_reason: <span className="font-semibold text-slate-100">{entry.alertReason}</span>
                      </p>

                      <p className="md:col-span-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                          className={`rounded-full border px-2 py-1 font-semibold ${
                            entry.duplicateSuppressed
                              ? "border-amber-500/45 bg-amber-500/15 text-amber-200"
                              : "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                          }`}
                        >
                          duplicate suppressed: {entry.duplicateSuppressed ? "true" : "false"}
                        </span>

                        <span
                          className={`rounded-full border px-2 py-1 font-semibold ${
                            entry.cooldownRemainingSeconds > 0
                              ? "border-orange-500/40 bg-orange-500/15 text-orange-200"
                              : "border-slate-500/35 bg-slate-500/10 text-slate-300"
                          }`}
                        >
                          cooldown: {entry.cooldownRemainingSeconds}s
                        </span>
                      </p>

                      <p className="md:col-span-2 text-xs text-slate-500">timestamp: {entry.timestampLabel}</p>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
