"use client";

import { useMemo, useState } from "react";

type Severity = "CRITICAL" | "MODERATE" | "WARNING" | "STABLE";

type PatientTriageEntry = {
  patientId: string;
  severity: Severity;
};

const DEMO_TRIAGE_DATA: PatientTriageEntry[] = [
  { patientId: "205", severity: "CRITICAL" },
  { patientId: "118", severity: "WARNING" },
  { patientId: "332", severity: "STABLE" },
  { patientId: "441", severity: "MODERATE" },
];

const SEVERITY_PRIORITY: Record<Severity, number> = {
  CRITICAL: 1,
  MODERATE: 2,
  WARNING: 3,
  STABLE: 4,
};

function severityBadgeClass(severity: Severity): string {
  if (severity === "CRITICAL") {
    return "border-rose-500/45 bg-rose-500/15 text-rose-300";
  }

  if (severity === "MODERATE") {
    return "border-orange-500/45 bg-orange-500/15 text-orange-300";
  }

  if (severity === "WARNING") {
    return "border-yellow-500/45 bg-yellow-500/15 text-yellow-300";
  }

  return "border-emerald-500/45 bg-emerald-500/15 text-emerald-300";
}

function priorityIndicator(severity: Severity): string {
  if (severity === "CRITICAL") {
    return "Immediate";
  }

  if (severity === "MODERATE") {
    return "High";
  }

  if (severity === "WARNING") {
    return "Watch";
  }

  return "Routine";
}

export default function TriageRankingPanel() {
  const [showRanking, setShowRanking] = useState(false);
  const [runId, setRunId] = useState(0);

  const rankedRows = useMemo(() => {
    return [...DEMO_TRIAGE_DATA].sort((left, right) => {
      const leftPriority = SEVERITY_PRIORITY[left.severity];
      const rightPriority = SEVERITY_PRIORITY[right.severity];

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.patientId.localeCompare(right.patientId);
    });
  }, []);

  return (
    <section className="surface p-5">
      <div className="rounded-2xl border border-cyan-500/20 bg-white/[0.02] p-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-100">Triage Ranking Panel</h2>
            <p className="mt-1 text-sm text-slate-400">
              Severity-based ICU patient priority ranking using static demo logic.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            className="btn-base btn-main px-4 py-2.5 text-sm"
            onClick={() => {
              setShowRanking(true);
              setRunId((previous) => previous + 1);
            }}
          >
            Run ICU Triage Ranking
          </button>
        </div>

        <div
          key={runId}
          className={`mt-4 rounded-xl border border-white/10 bg-black/25 p-4 transition-all duration-500 ${
            showRanking
              ? "translate-y-0 opacity-100"
              : "pointer-events-none -translate-y-1 opacity-0"
          }`}
        >
          <p className="mb-3 text-sm text-cyan-200">
            Patients requiring immediate attention appear first.
          </p>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-left text-sm text-slate-300">
              <thead className="bg-black/25 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-3">Rank</th>
                  <th className="px-3 py-3">Patient ID</th>
                  <th className="px-3 py-3">Severity</th>
                  <th className="px-3 py-3">Priority Indicator</th>
                </tr>
              </thead>
              <tbody>
                {rankedRows.map((row, index) => (
                  <tr key={`${row.patientId}-${row.severity}`} className="border-t border-white/10">
                    <td className="px-3 py-3 font-semibold text-slate-100">#{index + 1}</td>
                    <td className="px-3 py-3 font-semibold text-cyan-200">{row.patientId}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${severityBadgeClass(
                          row.severity
                        )}`}
                      >
                        {row.severity}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-300">{priorityIndicator(row.severity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
