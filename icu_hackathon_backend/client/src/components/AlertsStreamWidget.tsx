"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalyticsAlertRecord, fetchAnalyticsAlerts } from "@/lib/api";

type AlertSeverity = "critical" | "warning" | "stable";

type AlertStreamItem = {
  id: string;
  severity: AlertSeverity;
  patientId: string;
  triggerRule: string;
  timestampMs: number;
  timestampLabel: string;
  duplicateSuppressed: boolean;
  cooldownRemainingSeconds: number;
};

const AUTO_REFRESH_MS = 3000;
const NEW_ANIMATION_MS = 850;
const CRITICAL_ALERT_SOUND_SRC = "/assets/alert.mp3";
const CRITICAL_ALERT_SOUND_MAX_PLAY_MS = 6000;

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

function toTimestampMs(value: unknown): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  return Math.round(seconds * 1000);
}

function toTriggerRule(record: AnalyticsAlertRecord): string {
  const rule = String(record.reason || record.alert_reason || "").trim();
  if (rule) {
    return rule;
  }

  const signal = String(record.signal || "").trim();
  if (!signal) {
    return "-";
  }

  return `${signal.toLowerCase()} threshold`;
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

function toCooldownRemainingSeconds(record: AnalyticsAlertRecord): number {
  const raw = record.cooldown_remaining_seconds ?? record.cooldownRemainingSeconds;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(parsed));
}

function toDuplicateSuppressed(record: AnalyticsAlertRecord, cooldownRemainingSeconds: number): boolean {
  const explicit = toBoolean(record.duplicate_suppressed ?? record.duplicateSuppressed);
  if (explicit !== null) {
    return explicit;
  }

  return cooldownRemainingSeconds > 0;
}

function toAlertItems(records: AnalyticsAlertRecord[]): AlertStreamItem[] {
  const mapped = records.map((record) => {
    const severity = normalizeSeverity(record.severity);
    const patientId = String(record.patient_id || "unknown").trim() || "unknown";
    const triggerRule = toTriggerRule(record);
    const timestampMs = toTimestampMs(record.timestamp);
    const timestampLabel = timestampMs > 0 ? new Date(timestampMs).toLocaleTimeString() : "-";
    const cooldownRemainingSeconds = toCooldownRemainingSeconds(record);
    const duplicateSuppressed = toDuplicateSuppressed(record, cooldownRemainingSeconds);
    const id = `${patientId}-${timestampMs}-${triggerRule}-${severity}`;

    return {
      id,
      severity,
      patientId,
      triggerRule,
      timestampMs,
      timestampLabel,
      duplicateSuppressed,
      cooldownRemainingSeconds,
    };
  });

  mapped.sort((a, b) => b.timestampMs - a.timestampMs);
  return mapped;
}

function buildDemoAlertItems(): AlertStreamItem[] {
  const now = Date.now();
  return [
    {
      id: "demo-stream-critical-1",
      severity: "critical",
      patientId: "demo-alert-911",
      triggerRule: "Demo test alert: severe oxygen desaturation",
      timestampMs: now - 25 * 1000,
      timestampLabel: new Date(now - 25 * 1000).toLocaleTimeString(),
      duplicateSuppressed: false,
      cooldownRemainingSeconds: 0,
    },
    {
      id: "demo-stream-warning-1",
      severity: "warning",
      patientId: "204",
      triggerRule: "HR and temperature drift warning",
      timestampMs: now - 70 * 1000,
      timestampLabel: new Date(now - 70 * 1000).toLocaleTimeString(),
      duplicateSuppressed: true,
      cooldownRemainingSeconds: 14,
    },
    {
      id: "demo-stream-stable-1",
      severity: "stable",
      patientId: "412",
      triggerRule: "Vitals normalized after intervention",
      timestampMs: now - 3 * 60 * 1000,
      timestampLabel: new Date(now - 3 * 60 * 1000).toLocaleTimeString(),
      duplicateSuppressed: false,
      cooldownRemainingSeconds: 0,
    },
  ];
}

function severityIcon(severity: AlertSeverity): string {
  if (severity === "critical") {
    return "!";
  }

  if (severity === "warning") {
    return "*";
  }

  return "-";
}

function severityClass(severity: AlertSeverity): string {
  if (severity === "critical") {
    return "border-rose-500/45 bg-rose-500/15 text-rose-300";
  }

  if (severity === "warning") {
    return "border-orange-500/45 bg-orange-500/15 text-orange-300";
  }

  return "border-emerald-500/45 bg-emerald-500/15 text-emerald-300";
}

export default function AlertsStreamWidget() {
  const [items, setItems] = useState<AlertStreamItem[]>(() => buildDemoAlertItems());
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Demo alert stream preloaded.");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());

  const knownIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedAlertIdsRef = useRef(false);
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

  const refreshStream = useCallback(async (showLoadingState: boolean) => {
    if (showLoadingState) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const response = await fetchAnalyticsAlerts({ limit: 80 });
      const records = Array.isArray(response.alerts) ? response.alerts : [];
      const nextItems = toAlertItems(records);
      if (nextItems.length === 0) {
        const demoItems = buildDemoAlertItems();
        knownIdsRef.current = new Set(demoItems.map((item) => item.id));
        setItems(demoItems);
        setNotice("Live alert stream is empty. Showing demo stream items.");
        setError("");
        setLastSyncedAt(new Date().toISOString());
        return;
      }

      const incomingNewIds = nextItems
        .map((item) => item.id)
        .filter((id) => !knownIdsRef.current.has(id));

      if (hasInitializedAlertIdsRef.current) {
        const criticalIncomingIds = nextItems
          .filter(
            (item) => item.severity === "critical" && incomingNewIds.includes(item.id)
          )
          .map((item) => item.id);

        for (const criticalAlertId of criticalIncomingIds) {
          triggerCriticalAlertSound(criticalAlertId);
        }
      }

      if (incomingNewIds.length > 0) {
        setNewItemIds(new Set(incomingNewIds));

        setTimeout(() => {
          setNewItemIds((previous) => {
            if (previous.size === 0) {
              return previous;
            }
            return new Set();
          });
        }, NEW_ANIMATION_MS);
      }

      knownIdsRef.current = new Set(nextItems.map((item) => item.id));
      hasInitializedAlertIdsRef.current = true;
      setItems(nextItems);
      setError("");
      setNotice("");
      setLastSyncedAt(new Date().toISOString());
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not load alert stream";
      const demoItems = buildDemoAlertItems();
      knownIdsRef.current = new Set(demoItems.map((item) => item.id));
      setItems(demoItems);
      setNotice(`Alerts API unavailable (${message}). Showing demo stream items.`);
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

      await refreshStream(showLoadingState);
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

      stopCriticalAlertSound();
    };
  }, [refreshStream, stopCriticalAlertSound]);

  const hasAlerts = useMemo(() => items.length > 0, [items]);

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Alerts Stream Widget</h2>
          <p className="mt-1 text-sm text-slate-400">Live scrollable stream from /api/v1/alerts (newest first).</p>
        </div>

        <button
          type="button"
          className="btn-base btn-ghost px-3 py-2 text-xs"
          disabled={loading || refreshing}
          onClick={() => {
            void refreshStream(false);
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Auto refresh: {AUTO_REFRESH_MS} ms
        {lastSyncedAt ? ` | Last sync: ${new Date(lastSyncedAt).toLocaleTimeString()}` : ""}
      </p>

      {error ? <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p> : null}
      {notice ? <p className="mt-3 rounded-lg border border-cyan-500/35 bg-cyan-500/12 p-3 text-xs text-cyan-200">{notice}</p> : null}

      <div className="mt-4 max-h-[300px] overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3">
        {loading ? (
          <p className="text-sm text-slate-400">Loading alerts stream...</p>
        ) : !hasAlerts ? (
          <p className="text-sm text-slate-400">No alerts available.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const animateIn = newItemIds.has(item.id);

              return (
                <article
                  key={item.id}
                  className={`rounded-lg border bg-black/25 px-3 py-2 ${severityClass(item.severity)} ${
                    animateIn ? "alert-stream-item-enter" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold uppercase">
                      <span aria-hidden="true">{severityIcon(item.severity)}</span>
                      {item.severity}
                    </span>
                    <span className="text-slate-300">{item.timestampLabel}</span>
                  </div>

                  <p className="mt-1 text-sm text-slate-100">
                    patient_id: <span className="font-semibold">{item.patientId}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-300">trigger rule: {item.triggerRule}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className={`rounded-full border px-2 py-1 font-semibold ${
                        item.duplicateSuppressed
                          ? "border-amber-500/45 bg-amber-500/15 text-amber-200"
                          : "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                      }`}
                    >
                      duplicate suppressed: {item.duplicateSuppressed ? "true" : "false"}
                    </span>

                    <span
                      className={`rounded-full border px-2 py-1 font-semibold ${
                        item.cooldownRemainingSeconds > 0
                          ? "border-orange-500/40 bg-orange-500/15 text-orange-200"
                          : "border-slate-500/35 bg-slate-500/10 text-slate-300"
                      }`}
                    >
                      cooldown: {item.cooldownRemainingSeconds}s
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

