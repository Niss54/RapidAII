"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AnalyticsPatientDetail, fetchAnalyticsPatientById } from "@/lib/api";

type RiskExplanationPanelProps = {
  patientId: string;
  fallbackVitals?: {
    heartRate: number;
    spo2: number;
    temperature: number;
    bloodPressure: string;
  } | null;
};

type ContributionKey = "spo2" | "heartRate" | "temperature" | "bloodPressure";

type ContributionRow = {
  key: ContributionKey;
  label: string;
  value: number;
  color: string;
  currentValue: string;
  thresholdReference: string;
};

type TooltipPayloadEntry = {
  color?: string;
  dataKey?: string | number;
  name?: string;
  value?: number;
};

type TooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
};

const AUTO_REFRESH_MS = 5000;

const CONTRIBUTION_STYLE: Record<ContributionKey, { label: string; color: string }> = {
  spo2: {
    label: "SpO2 contribution",
    color: "#ef4444",
  },
  heartRate: {
    label: "Heart Rate contribution",
    color: "#f59e0b",
  },
  temperature: {
    label: "Temperature contribution",
    color: "#22c55e",
  },
  bloodPressure: {
    label: "Blood Pressure contribution",
    color: "#3b82f6",
  },
};

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function toDisplay(value: number | null, unit = ""): string {
  if (value === null) {
    return "n/a";
  }
  return `${value}${unit}`;
}

function pickVital(latestVitals: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(latestVitals[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function parseBloodPressureParts(value: string): { sbp: number | null; dbp: number | null } {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!match) {
    return { sbp: null, dbp: null };
  }

  const sbp = toNumber(match[1]);
  const dbp = toNumber(match[2]);
  return {
    sbp,
    dbp,
  };
}

function resolveSpO2Contribution(spo2: number | null): Omit<ContributionRow, "key" | "label" | "color"> {
  if (spo2 === null) {
    return {
      value: 0,
      currentValue: "n/a",
      thresholdReference: "SpO2 < 90 increases risk by 30%.",
    };
  }

  if (spo2 < 90) {
    return {
      value: 30,
      currentValue: toDisplay(spo2, "%"),
      thresholdReference: "SpO2 < 90 increases risk by 30%.",
    };
  }

  if (spo2 < 94) {
    return {
      value: 15,
      currentValue: toDisplay(spo2, "%"),
      thresholdReference: "SpO2 90-93 adds 15%; < 90 adds 30%.",
    };
  }

  return {
    value: 5,
    currentValue: toDisplay(spo2, "%"),
    thresholdReference: "SpO2 >= 94 keeps low baseline contribution (5%).",
  };
}

function resolveHeartRateContribution(hr: number | null): Omit<ContributionRow, "key" | "label" | "color"> {
  if (hr === null) {
    return {
      value: 0,
      currentValue: "n/a",
      thresholdReference: "HR < 60 or > 100 increases contribution.",
    };
  }

  if (hr < 40 || hr > 140) {
    return {
      value: 25,
      currentValue: toDisplay(Math.round(hr), " bpm"),
      thresholdReference: "HR < 40 or > 140 adds 25%.",
    };
  }

  if (hr < 60 || hr > 100) {
    return {
      value: 16,
      currentValue: toDisplay(Math.round(hr), " bpm"),
      thresholdReference: "HR 40-59 or 101-140 adds 16%.",
    };
  }

  return {
    value: 6,
    currentValue: toDisplay(Math.round(hr), " bpm"),
    thresholdReference: "HR 60-100 keeps baseline contribution (6%).",
  };
}

function resolveTemperatureContribution(temp: number | null): Omit<ContributionRow, "key" | "label" | "color"> {
  if (temp === null) {
    return {
      value: 0,
      currentValue: "n/a",
      thresholdReference: "Temp < 36.0 C or > 38.0 C increases contribution.",
    };
  }

  if (temp < 35 || temp > 39) {
    return {
      value: 20,
      currentValue: toDisplay(Number(temp.toFixed(1)), " C"),
      thresholdReference: "Temp < 35.0 C or > 39.0 C adds 20%.",
    };
  }

  if (temp < 36 || temp > 38) {
    return {
      value: 12,
      currentValue: toDisplay(Number(temp.toFixed(1)), " C"),
      thresholdReference: "Temp 35.0-35.9 C or 38.1-39.0 C adds 12%.",
    };
  }

  return {
    value: 4,
    currentValue: toDisplay(Number(temp.toFixed(1)), " C"),
    thresholdReference: "Temp 36.0-38.0 C keeps baseline contribution (4%).",
  };
}

function resolveBloodPressureContribution(
  map: number | null,
  sbp: number | null,
  dbp: number | null
): Omit<ContributionRow, "key" | "label" | "color"> {
  if (map !== null) {
    if (map < 55 || map > 120) {
      return {
        value: 25,
        currentValue: `MAP ${Math.round(map)}`,
        thresholdReference: "MAP < 55 or > 120 adds 25%.",
      };
    }

    if (map < 65 || map > 105) {
      return {
        value: 16,
        currentValue: `MAP ${Math.round(map)}`,
        thresholdReference: "MAP 55-64 or 106-120 adds 16%.",
      };
    }

    return {
      value: 6,
      currentValue: `MAP ${Math.round(map)}`,
      thresholdReference: "MAP 65-105 keeps baseline contribution (6%).",
    };
  }

  if (sbp === null || dbp === null) {
    return {
      value: 0,
      currentValue: "n/a",
      thresholdReference: "BP thresholds use MAP, else SBP/DBP bands.",
    };
  }

  if (sbp < 70 || sbp > 160 || dbp < 40 || dbp > 100) {
    return {
      value: 25,
      currentValue: `${Math.round(sbp)}/${Math.round(dbp)}`,
      thresholdReference: "SBP < 70 or > 160, or DBP < 40 or > 100 adds 25%.",
    };
  }

  if (sbp < 90 || sbp > 140 || dbp < 60 || dbp > 90) {
    return {
      value: 16,
      currentValue: `${Math.round(sbp)}/${Math.round(dbp)}`,
      thresholdReference: "SBP 70-89 or 141-160, or DBP 40-59 or 91-100 adds 16%.",
    };
  }

  return {
    value: 6,
    currentValue: `${Math.round(sbp)}/${Math.round(dbp)}`,
    thresholdReference: "SBP 90-140 and DBP 60-90 keep baseline contribution (6%).",
  };
}

function buildContributions(patient: AnalyticsPatientDetail): ContributionRow[] {
  const latestVitals = patient.latest_vitals || {};

  const spo2 = pickVital(latestVitals, ["SpO2", "SPO2", "spo2"]);
  const hr = pickVital(latestVitals, ["HR", "heartRate", "heart_rate"]);
  const temp = pickVital(latestVitals, ["TEMP", "temperature", "temp"]);
  const map = pickVital(latestVitals, ["MAP", "map"]);
  const sbp = pickVital(latestVitals, ["SBP", "sbp"]);
  const dbp = pickVital(latestVitals, ["DBP", "dbp"]);

  return [
    {
      key: "spo2",
      ...CONTRIBUTION_STYLE.spo2,
      ...resolveSpO2Contribution(spo2),
    },
    {
      key: "heartRate",
      ...CONTRIBUTION_STYLE.heartRate,
      ...resolveHeartRateContribution(hr),
    },
    {
      key: "temperature",
      ...CONTRIBUTION_STYLE.temperature,
      ...resolveTemperatureContribution(temp),
    },
    {
      key: "bloodPressure",
      ...CONTRIBUTION_STYLE.bloodPressure,
      ...resolveBloodPressureContribution(map, sbp, dbp),
    },
  ];
}

function buildContributionsFromFallbackVitals(vitals: {
  heartRate: number;
  spo2: number;
  temperature: number;
  bloodPressure: string;
}): ContributionRow[] {
  const spo2 = toNumber(vitals.spo2);
  const hr = toNumber(vitals.heartRate);
  const temp = toNumber(vitals.temperature);
  const { sbp, dbp } = parseBloodPressureParts(vitals.bloodPressure);

  return [
    {
      key: "spo2",
      ...CONTRIBUTION_STYLE.spo2,
      ...resolveSpO2Contribution(spo2),
    },
    {
      key: "heartRate",
      ...CONTRIBUTION_STYLE.heartRate,
      ...resolveHeartRateContribution(hr),
    },
    {
      key: "temperature",
      ...CONTRIBUTION_STYLE.temperature,
      ...resolveTemperatureContribution(temp),
    },
    {
      key: "bloodPressure",
      ...CONTRIBUTION_STYLE.bloodPressure,
      ...resolveBloodPressureContribution(null, sbp, dbp),
    },
  ];
}

function ContributionTooltip({
  active,
  payload,
  contributionByKey,
}: TooltipProps & { contributionByKey: Record<string, ContributionRow> }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const orderedRows: ContributionRow[] = [];

  for (const row of payload) {
    const key = String(row.dataKey || "");
    const resolved = contributionByKey[key];
    if (resolved) {
      orderedRows.push(resolved);
    }
  }

  if (orderedRows.length === 0) {
    return null;
  }

  return (
    <div className="max-w-xs rounded-xl border border-slate-600/40 bg-slate-950/95 p-3 text-xs text-slate-200 shadow-xl">
      <p className="font-semibold text-slate-100">Clinical Threshold Reference</p>
      <div className="mt-2 space-y-2">
        {orderedRows.map((row) => (
          <div key={row.key}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
              <p className="font-semibold text-slate-100">{row.label}</p>
            </div>
            <p className="mt-1 text-slate-300">Current: {row.currentValue}</p>
            <p className="text-slate-400">{row.thresholdReference}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RiskExplanationPanel({ patientId, fallbackVitals = null }: RiskExplanationPanelProps) {
  const [patient, setPatient] = useState<AnalyticsPatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refreshPatient = useCallback(
    async (showLoadingState: boolean) => {
      const normalizedPatientId = String(patientId || "").trim();

      if (!normalizedPatientId) {
        setPatient(null);
        setError("Select a patient to view risk explanation.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (showLoadingState) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const response = await fetchAnalyticsPatientById(normalizedPatientId);
        setPatient(response);
        setError("");
        setLastSyncedAt(new Date().toISOString());
      } catch (requestError) {
        setPatient(null);
        setError(requestError instanceof Error ? requestError.message : "Could not load patient explanation");
      } finally {
        if (showLoadingState) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [patientId]
  );

  useEffect(() => {
    let active = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const run = async (showLoadingState: boolean) => {
      if (!active) {
        return;
      }

      await refreshPatient(showLoadingState);
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
  }, [refreshPatient]);

  const fallbackContributions = useMemo(() => {
    if (!fallbackVitals) {
      return [];
    }

    return buildContributionsFromFallbackVitals(fallbackVitals);
  }, [fallbackVitals]);

  const contributions = useMemo(() => {
    if (patient) {
      return buildContributions(patient);
    }

    return fallbackContributions;
  }, [patient, fallbackContributions]);

  const totalContribution = useMemo(() => {
    return contributions.reduce((sum, row) => sum + row.value, 0);
  }, [contributions]);

  const contributionByKey = useMemo(() => {
    const next: Record<string, ContributionRow> = {};
    for (const row of contributions) {
      next[row.key] = row;
    }
    return next;
  }, [contributions]);

  const chartData = useMemo(() => {
    if (contributions.length === 0) {
      return [];
    }

    return [
      {
        label: "risk",
        spo2: contributions.find((row) => row.key === "spo2")?.value ?? 0,
        heartRate: contributions.find((row) => row.key === "heartRate")?.value ?? 0,
        temperature: contributions.find((row) => row.key === "temperature")?.value ?? 0,
        bloodPressure: contributions.find((row) => row.key === "bloodPressure")?.value ?? 0,
      },
    ];
  }, [contributions]);

  return (
    <section className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Risk Explanation Panel</h3>
          <p className="mt-1 text-xs text-slate-400">Input patient_id: {patientId || "n/a"} | Source: GET /api/v1/patients/{'{patient_id}'}</p>
        </div>

        <button
          type="button"
          className="btn-base btn-ghost px-3 py-1.5 text-xs"
          disabled={loading || refreshing}
          onClick={() => {
            void refreshPatient(false);
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        Auto refresh: {AUTO_REFRESH_MS} ms
        {lastSyncedAt ? ` | Last sync: ${new Date(lastSyncedAt).toLocaleTimeString()}` : ""}
      </p>

      {error && fallbackContributions.length === 0 ? (
        <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-xs text-rose-300">{error}</p>
      ) : null}

      {/* Temporarily hidden: fallback fetch warning banner */}

      {loading ? <p className="mt-3 text-sm text-slate-400">Loading patient contribution weights...</p> : null}

      {!loading && chartData.length > 0 && (!error || fallbackContributions.length > 0) ? (
        <>
          <div className="mt-3 h-[230px] w-full rounded-lg border border-white/10 bg-black/25 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 12, right: 20, left: 10, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis type="category" dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} width={42} />
                <Tooltip content={<ContributionTooltip contributionByKey={contributionByKey} />} />
                <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                <Bar dataKey="spo2" name="SpO2" stackId="risk" fill={CONTRIBUTION_STYLE.spo2.color} radius={[3, 0, 0, 3]} />
                <Bar dataKey="heartRate" name="Heart Rate" stackId="risk" fill={CONTRIBUTION_STYLE.heartRate.color} />
                <Bar dataKey="temperature" name="Temperature" stackId="risk" fill={CONTRIBUTION_STYLE.temperature.color} />
                <Bar
                  dataKey="bloodPressure"
                  name="Blood Pressure"
                  stackId="risk"
                  fill={CONTRIBUTION_STYLE.bloodPressure.color}
                  radius={[0, 3, 3, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 grid gap-2 text-xs text-slate-300 md:grid-cols-2">
            {contributions.map((row) => (
              <div key={row.key} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                    <span className="font-semibold text-slate-100">{row.label}</span>
                  </div>
                  <span className="font-semibold text-cyan-300">{row.value}%</span>
                </div>
                <p className="mt-1 text-slate-400">Current: {row.currentValue}</p>
                <p className="text-slate-500">{row.thresholdReference}</p>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Composite contribution score: <span className="font-semibold text-slate-200">{totalContribution}/100</span>
          </p>
        </>
      ) : null}
    </section>
  );
}
