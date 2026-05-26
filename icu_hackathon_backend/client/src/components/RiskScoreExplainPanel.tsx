"use client";

import { useMemo, useState } from "react";

type Contributor = {
  id: "spo2" | "bp" | "hr" | "temperature";
  label: string;
  points: number;
  colorClass: string;
  barClass: string;
};

const RISK_SCORE = 78;
const FINAL_SEVERITY = "CRITICAL";

export default function RiskScoreExplainPanel() {
  const [showExplanation, setShowExplanation] = useState(false);
  const [runId, setRunId] = useState(0);

  const contributors = useMemo<Contributor[]>(
    () => [
      {
        id: "spo2",
        label: "SpO2 drop",
        points: 35,
        colorClass: "text-rose-300",
        barClass: "bg-rose-500",
      },
      {
        id: "bp",
        label: "Low BP",
        points: 22,
        colorClass: "text-orange-300",
        barClass: "bg-orange-500",
      },
      {
        id: "hr",
        label: "High HR",
        points: 14,
        colorClass: "text-yellow-300",
        barClass: "bg-yellow-400",
      },
      {
        id: "temperature",
        label: "Temperature rise",
        points: 7,
        colorClass: "text-violet-300",
        barClass: "bg-violet-500",
      },
    ],
    []
  );

  return (
    <section className="surface p-5">
      <div className="rounded-2xl border border-cyan-500/20 bg-white/[0.02] p-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-100">Risk Score Explain Panel</h2>
            <p className="mt-1 text-sm text-slate-400">
              Interpretable multi-signal contribution breakdown using static ICU demo values.
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Risk Score</p>
            <p className="mt-1 text-lg font-semibold text-rose-300">{RISK_SCORE}/100</p>
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            className="btn-base btn-main px-4 py-2.5 text-sm"
            onClick={() => {
              setShowExplanation(true);
              setRunId((previous) => previous + 1);
            }}
          >
            Explain Risk Score
          </button>
        </div>

        <div
          key={runId}
          className={`mt-4 rounded-xl border border-white/10 bg-black/25 p-4 transition-all duration-500 ${
            showExplanation
              ? "translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-1 opacity-0"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">Signal Contributions</p>
            <span className="rounded-full border border-rose-500/45 bg-rose-500/15 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-rose-300">
              Final Severity Label: {FINAL_SEVERITY}
            </span>
          </div>

          <div className="mt-3 space-y-3">
            {contributors.map((contributor) => {
              const widthPercent = Math.max(
                0,
                Math.min(100, (contributor.points / RISK_SCORE) * 100)
              );

              return (
                <article key={contributor.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <p className={`font-semibold ${contributor.colorClass}`}>{contributor.label}</p>
                    <p className="font-semibold text-slate-100">+{contributor.points}</p>
                  </div>

                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-800/80">
                    <div
                      className={`h-full rounded-full ${contributor.barClass}`}
                      style={{ width: `${widthPercent.toFixed(2)}%` }}
                    />
                  </div>
                </article>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-slate-400">
            Risk score derived from multi-signal deterioration indicators.
          </p>
        </div>
      </div>
    </section>
  );
}
