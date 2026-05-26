"use client";

import { useMemo, useState } from "react";

type DemoTelemetry = {
  patientId: string;
  spo2: number;
  bp: string;
  heartRate: number;
  temperature: number;
  riskScore: number;
  severity: "CRITICAL";
};

const DEMO_TELEMETRY: DemoTelemetry = {
  patientId: "205",
  spo2: 79,
  bp: "90/60",
  heartRate: 142,
  temperature: 39.4,
  riskScore: 78,
  severity: "CRITICAL",
};

export default function ClinicalSuggestionPanel() {
  const [analysisRuns, setAnalysisRuns] = useState(0);

  const hasOutput = analysisRuns > 0;

  const suggestions = useMemo(
    () => [
      "Possible hypoxemia detected. Suggest oxygen escalation protocol check.",
      "Possible hypotension detected. Evaluate shock protocol.",
      "Possible tachycardia detected. Recommend cardiac monitoring review.",
    ],
    []
  );

  return (
    <section className="surface p-5">
      <div className="rounded-2xl border border-cyan-500/20 bg-white/[0.02] p-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-100">AI Clinical Assistant Output</h2>
            <p className="mt-1 text-sm text-slate-400">
              Static demo analysis from prefilled telemetry risk conditions.
            </p>
          </div>

          <span className="rounded-full border border-rose-500/45 bg-rose-500/15 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-rose-300">
            {DEMO_TELEMETRY.severity}
          </span>
        </div>

        <div className="mt-4 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Patient ID</p>
            <p className="mt-1 font-semibold text-slate-100">{DEMO_TELEMETRY.patientId}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">SpO2</p>
            <p className="mt-1 font-semibold text-slate-100">{DEMO_TELEMETRY.spo2}%</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Blood Pressure</p>
            <p className="mt-1 font-semibold text-slate-100">{DEMO_TELEMETRY.bp}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Heart Rate</p>
            <p className="mt-1 font-semibold text-slate-100">{DEMO_TELEMETRY.heartRate} bpm</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Temperature</p>
            <p className="mt-1 font-semibold text-slate-100">{DEMO_TELEMETRY.temperature.toFixed(1)} C</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Risk Score</p>
            <p className="mt-1 font-semibold text-rose-300">{DEMO_TELEMETRY.riskScore}/100</p>
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            className="btn-base btn-main px-4 py-2.5 text-sm"
            onClick={() => {
              setAnalysisRuns((previous) => previous + 1);
            }}
          >
            Run Clinical Analysis
          </button>
        </div>

        <div
          key={analysisRuns}
          className={`mt-4 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 transition-all duration-500 ${
            hasOutput
              ? "translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-1 opacity-0"
          }`}
        >
          <p className="text-xs uppercase tracking-[0.14em] text-cyan-200">Clinical Suggestions</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-100">
            {suggestions.map((suggestion) => (
              <li key={suggestion} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
