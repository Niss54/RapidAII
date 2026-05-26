"use client";

import { useState } from "react";

const DEMO_FORECAST = {
  predictedRisk: "CRITICAL",
  confidence: 87,
  trend: "Increasing",
};

export default function ForecastDemoWidget() {
  const [showResult, setShowResult] = useState(false);
  const [runId, setRunId] = useState(0);

  return (
    <section className="surface p-5">
      <div className="rounded-2xl border border-cyan-500/20 bg-white/[0.02] p-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-100">Forecast Demo Widget</h2>
            <p className="mt-1 text-sm text-slate-400">Static 5-minute deterioration prediction output for demo walkthrough.</p>
          </div>

          <span className="rounded-full border border-rose-500/45 bg-rose-500/15 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-rose-300">
            {DEMO_FORECAST.predictedRisk}
          </span>
        </div>

        <div className="mt-4">
          <button
            type="button"
            className="btn-base btn-main px-4 py-2.5 text-sm"
            onClick={() => {
              setShowResult(true);
              setRunId((previous) => previous + 1);
            }}
          >
            Run Forecast Prediction
          </button>
        </div>

        <div
          key={runId}
          className={`mt-4 rounded-xl border border-white/10 bg-black/25 p-4 transition-all duration-500 ${
            showResult
              ? "translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-1 opacity-0"
          }`}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <article className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Predicted Risk</p>
              <p className="mt-1 font-semibold text-rose-300">{DEMO_FORECAST.predictedRisk}</p>
            </article>

            <article className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Confidence</p>
              <p className="mt-1 font-semibold text-cyan-200">{DEMO_FORECAST.confidence} percent</p>
            </article>

            <article className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Trend</p>
              <div className="mt-1 flex items-center gap-2 font-semibold text-rose-300">
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path
                    d="M12 5l6 6h-4v8h-4v-8H6l6-6z"
                    fill="currentColor"
                  />
                </svg>
                <span>{DEMO_FORECAST.trend}</span>
              </div>
            </article>
          </div>

          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Confidence Progress</p>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-800/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-emerald-400"
                style={{ width: `${DEMO_FORECAST.confidence}%` }}
              />
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-400">
            Short-horizon deterioration prediction using Rapid AI forecasting engine.
          </p>
        </div>
      </div>
    </section>
  );
}
