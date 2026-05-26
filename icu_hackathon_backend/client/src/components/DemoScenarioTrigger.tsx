"use client";

import { useEffect, useRef, useState } from "react";
import ClinicalSuggestionPanel from "@/components/ClinicalSuggestionPanel";
import RiskScoreExplainPanel from "@/components/RiskScoreExplainPanel";
import TriageRankingPanel from "@/components/TriageRankingPanel";

type DemoTelemetry = {
  patientId: string;
  spo2: number;
  bloodPressure: string;
  heartRate: number;
  temperature: number;
};

const STATUS_STEPS = [
  "Telemetry decoded",
  "Risk score computed",
  "Forecast generated",
  "Clinical suggestions prepared",
  "Alert escalation ready",
] as const;

const DEMO_TELEMETRY: DemoTelemetry = {
  patientId: "205",
  spo2: 79,
  bloodPressure: "90/60",
  heartRate: 142,
  temperature: 39.4,
};

const STATUS_STEP_DELAY_MS = 320;

export default function DemoScenarioTrigger() {
  const [isRunning, setIsRunning] = useState(false);
  const [activeStatusIndex, setActiveStatusIndex] = useState(-1);
  const [runCount, setRunCount] = useState(0);
  const [telemetry, setTelemetry] = useState<DemoTelemetry | null>(null);
  const [showPanels, setShowPanels] = useState(false);

  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
      timersRef.current = [];
    };
  }, []);

  function clearTimers() {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
    }
    timersRef.current = [];
  }

  function runScenario() {
    clearTimers();
    setRunCount((previous) => previous + 1);
    setTelemetry(DEMO_TELEMETRY);
    setShowPanels(false);
    setActiveStatusIndex(-1);
    setIsRunning(true);

    STATUS_STEPS.forEach((_, index) => {
      const timer = window.setTimeout(() => {
        setActiveStatusIndex(index);
      }, STATUS_STEP_DELAY_MS * (index + 1));
      timersRef.current.push(timer);
    });

    const completionTimer = window.setTimeout(() => {
      setIsRunning(false);
      setShowPanels(true);
    }, STATUS_STEP_DELAY_MS * STATUS_STEPS.length + 180);
    timersRef.current.push(completionTimer);
  }

  return (
    <section className="surface p-5">
      <div className="rounded-2xl border border-cyan-500/20 bg-white/[0.02] p-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-100">Rapid AI Scenario Trigger</h2>
            <p className="mt-1 text-sm text-slate-400">
              One-click static ICU deterioration simulation for dashboard demo walkthrough.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            className="btn-base btn-main px-4 py-2.5 text-sm"
            onClick={runScenario}
            disabled={isRunning}
          >
            {isRunning
              ? "Running Demo..."
              : "Run Rapid AI Critical Scenario Demo"}
          </button>
        </div>

        {telemetry ? (
          <div className="mt-4 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Patient</p>
              <p className="mt-1 font-semibold text-slate-100">{telemetry.patientId}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">SpO2</p>
              <p className="mt-1 font-semibold text-rose-300">{telemetry.spo2}%</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">BP</p>
              <p className="mt-1 font-semibold text-orange-300">{telemetry.bloodPressure}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">HR</p>
              <p className="mt-1 font-semibold text-yellow-300">{telemetry.heartRate} bpm</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Temp</p>
              <p className="mt-1 font-semibold text-violet-300">{telemetry.temperature.toFixed(1)} C</p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {STATUS_STEPS.map((step, index) => {
            const isActive = activeStatusIndex >= index;
            return (
              <p
                key={`${runCount}-${step}`}
                className={`rounded-lg border px-3 py-2 text-sm transition-all duration-300 ${
                  isActive
                    ? "translate-y-0 border-cyan-500/35 bg-cyan-500/12 text-cyan-200 opacity-100"
                    : "translate-y-1 border-white/10 bg-black/20 text-slate-500 opacity-40"
                }`}
              >
                {step}
              </p>
            );
          })}
        </div>
      </div>

      <div
        key={runCount}
        className={`mt-4 space-y-4 transition-all duration-500 ${
          showPanels ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        <ClinicalSuggestionPanel />
        <RiskScoreExplainPanel />
        <TriageRankingPanel />
      </div>
    </section>
  );
}
