"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchIcuSummary, IcuSummaryResponse } from "@/lib/api";

type SummaryKey = "critical" | "warning" | "stable";

type SummarySlice = {
  key: SummaryKey;
  label: string;
  value: number;
  percentage: number;
  color: string;
};

const AUTO_REFRESH_MS = 5000;

function toSafeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed));
}

function buildSlices(summary: IcuSummaryResponse["summary"]): SummarySlice[] {
  const total = Math.max(0, toSafeNumber(summary.total));
  const critical = toSafeNumber(summary.critical);
  const warning = toSafeNumber(summary.warning);
  const stable = toSafeNumber(summary.stable);

  const toPercent = (value: number): number => {
    if (total <= 0) {
      return 0;
    }

    return Math.round((value / total) * 100);
  };

  return [
    {
      key: "critical",
      label: "Critical",
      value: critical,
      percentage: toPercent(critical),
      color: "#f43f5e",
    },
    {
      key: "warning",
      label: "Warning",
      value: warning,
      percentage: toPercent(warning),
      color: "#fb923c",
    },
    {
      key: "stable",
      label: "Stable",
      value: stable,
      percentage: toPercent(stable),
      color: "#34d399",
    },
  ];
}

function labelRenderer(entry: { percent?: number }): string {
  const percent = Number(entry.percent || 0);
  return `${Math.round(percent * 100)}%`;
}

export default function ICUSummaryPanel() {
  const [summary, setSummary] = useState<IcuSummaryResponse["summary"]>({
    critical: 0,
    moderate: 0,
    warning: 0,
    stable: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refreshSummary = useCallback(async (showLoadingState: boolean) => {
    if (showLoadingState) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const response = await fetchIcuSummary();
      setSummary(response.summary);
      setError("");
      setLastSyncedAt(new Date().toISOString());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load ICU summary");
    } finally {
      if (showLoadingState) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const run = async (showLoadingState: boolean) => {
      if (!active) {
        return;
      }

      await refreshSummary(showLoadingState);
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
  }, [refreshSummary]);

  const slices = useMemo(() => buildSlices(summary), [summary]);

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">ICU Summary Panel</h2>
          <p className="mt-1 text-sm text-slate-400">Live summary from /icu/summary with category distribution percentages.</p>
        </div>

        <button
          type="button"
          className="btn-base btn-ghost px-3 py-2 text-xs"
          disabled={loading || refreshing}
          onClick={() => {
            void refreshSummary(false);
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

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.42fr_0.58fr]">
        <article className="rounded-xl border border-white/10 bg-black/20 p-4">
          {loading ? (
            <p className="text-sm text-slate-400">Loading summary...</p>
          ) : (
            <div className="grid gap-2 text-sm text-slate-300">
              <p>
                Total Patients: <span className="font-semibold text-slate-100">{toSafeNumber(summary.total)}</span>
              </p>
              <p>
                Critical Count: <span className="font-semibold text-rose-300">{toSafeNumber(summary.critical)}</span>
              </p>
              <p>
                Warning Count: <span className="font-semibold text-orange-300">{toSafeNumber(summary.warning)}</span>
              </p>
              <p>
                Stable Count: <span className="font-semibold text-emerald-300">{toSafeNumber(summary.stable)}</span>
              </p>
            </div>
          )}
        </article>

        <article className="rounded-xl border border-white/10 bg-black/20 p-4">
          {loading ? (
            <p className="text-sm text-slate-400">Preparing chart...</p>
          ) : (
            <>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={2}
                      label={labelRenderer}
                      labelLine={false}
                    >
                      {slices.map((slice) => (
                        <Cell key={slice.key} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [`${value ?? ""}`, name]}
                      contentStyle={{
                        background: "rgba(3, 7, 18, 0.94)",
                        border: "1px solid rgba(148, 163, 184, 0.28)",
                        borderRadius: "0.75rem",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 grid gap-2 text-xs text-slate-300 md:grid-cols-3">
                {slices.map((slice) => (
                  <div key={slice.key} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color }} />
                      <span className="font-semibold text-slate-100">{slice.label}</span>
                    </div>
                    <p className="mt-1 text-slate-400">
                      {slice.value} ({slice.percentage}%)
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
