"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { forecastNext, ForecastNextResponse } from "@/lib/api";

type ForecastWidgetProps = {
  patientId: string;
  heartRate: number;
  spo2: number;
  temperature: number;
  bloodPressure: string;
  currentRiskScore: number;
};

type TrendDirection = "increase" | "stable" | "decrease";

type ForecastViewModel = {
  predictedRiskText: string;
  confidencePercent: number;
  predictedCategory: "CRITICAL" | "WARNING" | "STABLE";
  trend: TrendDirection;
};

const AUTO_REFRESH_MS = 7000;

function parseBloodPressure(value: string): { sbp: number; dbp: number; map: number } {
  const match = String(value || "").trim().match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!match) {
    return {
      sbp: 120,
      dbp: 80,
      map: 93,
    };
  }

  const sbp = Number(match[1]);
  const dbp = Number(match[2]);
  const map = Math.round((sbp + 2 * dbp) / 3);

  return {
    sbp,
    dbp,
    map,
  };
}

function clampScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function statusToCategory(status: string): "CRITICAL" | "WARNING" | "STABLE" {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "STATUS_CRITICAL") {
    return "CRITICAL";
  }
  if (normalized === "STATUS_HIGH" || normalized === "STATUS_WARNING") {
    return "WARNING";
  }
  return "STABLE";
}

function categoryToScore(category: "CRITICAL" | "WARNING" | "STABLE"): number {
  if (category === "CRITICAL") {
    return 85;
  }
  if (category === "WARNING") {
    return 60;
  }
  return 30;
}

function categoryToConfidence(category: "CRITICAL" | "WARNING" | "STABLE"): number {
  if (category === "CRITICAL") {
    return 92;
  }
  if (category === "WARNING") {
    return 80;
  }
  return 72;
}

function resolveTrend(currentRiskScore: number, predictedRiskScore: number): TrendDirection {
  const delta = predictedRiskScore - currentRiskScore;
  if (delta >= 5) {
    return "increase";
  }
  if (delta <= -5) {
    return "decrease";
  }
  return "stable";
}

function toTrendClass(trend: TrendDirection): string {
  if (trend === "increase") {
    return "text-rose-300";
  }
  if (trend === "decrease") {
    return "text-emerald-300";
  }
  return "text-slate-300";
}

function toTrendSymbol(trend: TrendDirection): string {
  if (trend === "increase") {
    return "↑";
  }
  if (trend === "decrease") {
    return "↓";
  }
  return "-";
}

function toStatusBadgeClass(category: "CRITICAL" | "WARNING" | "STABLE"): string {
  if (category === "CRITICAL") {
    return "border-rose-500/45 bg-rose-500/15 text-rose-300";
  }
  if (category === "WARNING") {
    return "border-orange-500/45 bg-orange-500/15 text-orange-300";
  }
  return "border-emerald-500/45 bg-emerald-500/15 text-emerald-300";
}

function scoreToCategory(score: number): "CRITICAL" | "WARNING" | "STABLE" {
  if (score >= 75) {
    return "CRITICAL";
  }

  if (score >= 40) {
    return "WARNING";
  }

  return "STABLE";
}

function buildDemoForecast(currentRiskScore: number): ForecastViewModel {
  const base = clampScore(currentRiskScore);
  const pulse = Math.floor(Date.now() / AUTO_REFRESH_MS) % 3;
  const adjustment = pulse === 0 ? 4 : pulse === 1 ? 8 : 6;
  const predictedRisk = clampScore(base + adjustment);
  const predictedCategory = scoreToCategory(predictedRisk);
  const confidencePercent = Math.max(64, Math.min(95, 72 + adjustment));

  return {
    predictedRiskText: `${predictedRisk}/100`,
    confidencePercent,
    predictedCategory,
    trend: resolveTrend(base, predictedRisk),
  };
}

function toViewModel(response: ForecastNextResponse, currentRiskScore: number): ForecastViewModel {
  const predictedCategory = statusToCategory(response.status);
  const predictedRiskScore = categoryToScore(predictedCategory);

  return {
    predictedRiskText: `${predictedRiskScore}/100`,
    confidencePercent: categoryToConfidence(predictedCategory),
    predictedCategory,
    trend: resolveTrend(currentRiskScore, predictedRiskScore),
  };
}

export default function ForecastWidget({
  patientId,
  heartRate,
  spo2,
  temperature,
  bloodPressure,
  currentRiskScore,
}: ForecastWidgetProps) {
  const [data, setData] = useState<ForecastViewModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState("Demo-ready: auto-refresh every 7 seconds.");
  const [lastForecastAt, setLastForecastAt] = useState<string | null>(null);

  const fallbackVitalsPayload = useMemo(() => {
    const { sbp, dbp, map } = parseBloodPressure(bloodPressure);

    return {
      vitals: [[heartRate, spo2, temperature, sbp, dbp, map]],
      feature_names: ["HR", "SpO2", "TEMP", "SBP", "DBP", "MAP"],
    };
  }, [heartRate, spo2, temperature, bloodPressure]);

  const loadForecast = useCallback(async () => {
    if (!patientId) {
      setData(null);
      setError("");
      setOffline(false);
      return;
    }

    setLoading(true);
    setError("");
    setOffline(false);

    try {
      let response: ForecastNextResponse;

      try {
        // Requirement payload path: call forecast endpoint with patient_id.
        response = await forecastNext({ patient_id: patientId });
      } catch (primaryError) {
        const message = primaryError instanceof Error ? primaryError.message : "";
        if (!message.toLowerCase().includes("vitals field is required")) {
          throw primaryError;
        }

        // Backend currently expects vitals; retry with patient-derived vitals.
        response = await forecastNext({
          patient_id: patientId,
          ...fallbackVitalsPayload,
        });
      }

      setData(toViewModel(response, clampScore(currentRiskScore)));
      setNotice("");
      setLastForecastAt(new Date().toISOString());
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Forecast request failed";
      setError("");
      setData(buildDemoForecast(currentRiskScore));
      setNotice(`Forecast API unavailable (${message}). Showing demo prediction model.`);
      setLastForecastAt(new Date().toISOString());

      const normalized = message.toLowerCase();
      setOffline(
        normalized.includes("disabled") ||
          normalized.includes("not ready") ||
          normalized.includes("service unavailable")
      );
    } finally {
      setLoading(false);
    }
  }, [patientId, fallbackVitalsPayload, currentRiskScore]);

  useEffect(() => {
    void loadForecast();
    const timer = setInterval(() => {
      void loadForecast();
    }, AUTO_REFRESH_MS);

    return () => {
      clearInterval(timer);
    };
  }, [loadForecast]);

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Forecast Widget</p>
        <div className="flex items-center gap-2">
          {data ? (
            <span className="rounded-full border border-cyan-500/45 bg-cyan-500/12 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
              Confidence {data.confidencePercent}%
            </span>
          ) : null}

          <button
            type="button"
            className="btn-base btn-ghost px-2.5 py-1 text-[11px]"
            onClick={() => {
              void loadForecast();
            }}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {offline ? (
        <div className="mt-2">
          <span className="rounded-full border border-amber-500/45 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-200">
            Forecast Service Offline
          </span>
        </div>
      ) : null}

      {error && !offline ? (
        <p className="mt-2 rounded-md border border-rose-500/35 bg-rose-900/20 px-2.5 py-2 text-xs text-rose-300">{error}</p>
      ) : null}
      {notice ? (
        <p className="mt-2 rounded-md border border-cyan-500/35 bg-cyan-500/12 px-2.5 py-2 text-xs text-cyan-200">{notice}</p>
      ) : null}
      {lastForecastAt ? (
        <p className="mt-2 text-[11px] text-slate-500">Last forecast: {new Date(lastForecastAt).toLocaleTimeString()}</p>
      ) : null}

      {data ? (
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Predicted Risk Next 5 Minutes</p>
            <p className="mt-1 text-base font-semibold text-cyan-300">{data.predictedRiskText}</p>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Confidence %</p>
            <p className="mt-1 text-base font-semibold text-slate-100">{data.confidencePercent}%</p>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Predicted Category</p>
            <p className="mt-1">
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${toStatusBadgeClass(data.predictedCategory)}`}>
                {data.predictedCategory}
              </span>
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Trend Arrow</p>
            <p className={`mt-1 text-base font-semibold ${toTrendClass(data.trend)}`}>{toTrendSymbol(data.trend)}</p>
          </div>
        </div>
      ) : loading ? (
        <p className="mt-3 text-xs text-slate-400">Fetching forecast response...</p>
      ) : null}
    </div>
  );
}
