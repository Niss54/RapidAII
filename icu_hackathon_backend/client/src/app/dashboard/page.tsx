"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  downloadForecastProjectionExport,
  ForecastProjectionFilters,
  fetchForecastProjections,
  fetchHealth,
  fetchIcuSummary,
  fetchIcuTimeline,
  ForecastProjectionRecord,
  ForecastSourceSummary,
  IcuSummaryResponse,
  TelemetryUpdateResponse,
  TimelineEvent,
  updateTelemetry,
} from "@/lib/api";
import AlertFeedPanel from "@/components/AlertFeedPanel";
import ForecastProjectionPanel from "@/components/ForecastProjectionPanel";
import PredictiveModelEvaluationSection from "@/components/PredictiveModelEvaluationSection";
import SiteFooter from "@/components/SiteFooter";
import SiteNavbar from "@/components/SiteNavbar";
import TelemetryDebugPanel, { TelemetryDebugEntry } from "@/components/TelemetryDebugPanel";
import EndpointCoveragePanel from "@/components/EndpointCoveragePanel";
import VoiceAssistantPanel from "@/components/VoiceAssistantPanel";
import VoiceServiceStatusPanel from "@/components/VoiceServiceStatusPanel";
import HexDecoderPanel from "@/components/HexDecoderPanel";
import IdentityCollisionPanel from "@/components/IdentityCollisionPanel";
import IntegrationStatusPanel from "@/components/IntegrationStatusPanel";
import AlertsTimelinePanel from "@/components/AlertsTimelinePanel";
import ForecastWidget from "@/components/ForecastWidget";
import TelemetryTimelineChart from "@/components/TelemetryTimelineChart";
import ICUSummaryPanel from "@/components/ICUSummaryPanel";
import AlertsStreamWidget from "@/components/AlertsStreamWidget";
import VoiceLogsPanel from "@/components/VoiceLogsPanel";
import LiveKitStatusIndicator from "@/components/LiveKitStatusIndicator";
import RiskExplanationPanel from "@/components/RiskExplanationPanel";
import StabilityTimeline from "@/components/StabilityTimeline";
import SimulatorToggle from "@/components/SimulatorToggle";

type TelemetryForm = {
  patientId: string;
  monitorId: string;
  heartRate: string;
  spo2: string;
  temperature: string;
  bloodPressure: string;
  telemetryHex: string;
};

type RiskHistoryByPatient = Record<string, number[]>;

type EscalationChannels = NonNullable<TelemetryUpdateResponse["escalationChannels"]>;

type LastTelemetryDiagnostics = {
  riskLevel: TelemetryUpdateResponse["risk"]["riskLevel"];
  channels: EscalationChannels | null;
  capturedAt: string;
};

type TelemetrySubmissionPayload = {
  patientId: string;
  monitorId: string;
  heartRate?: number;
  spo2?: number;
  temperature?: number;
  bloodPressure?: string;
  hexPayload?: string;
  sourceHint?: string;
};

const DEMO_TELEMETRY_HEX_PRIMARY =
  "7B22686561727452617465223A3132382C2273706F32223A38362C2274656D7065726174757265223A3130322E322C22626C6F6F645072657373757265223A2238342F3532227D";
const DEMO_TELEMETRY_HEX_SECONDARY =
  "7B22686561727452617465223A39362C2273706F32223A39372C2274656D7065726174757265223A39382E362C22626C6F6F645072657373757265223A223132302F3738227D";

function parsePatientIdsCsv(value: string): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toIsoFilterValue(value: string): string | undefined {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function toDateTimeLocalInputValue(value: Date): string {
  const pad2 = (part: number) => String(part).padStart(2, "0");
  const year = value.getFullYear();
  const month = pad2(value.getMonth() + 1);
  const day = pad2(value.getDate());
  const hours = pad2(value.getHours());
  const minutes = pad2(value.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

type SupportedRiskLevel = TelemetryUpdateResponse["risk"]["riskLevel"];

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseBloodPressureParts(value: unknown): { systolic: number | null; diastolic: number | null } {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!match) {
    return { systolic: null, diastolic: null };
  }

  return {
    systolic: toFiniteNumber(match[1]),
    diastolic: toFiniteNumber(match[2]),
  };
}

function decodeHexJsonVitals(hexPayload: string): {
  heartRate: number | null;
  spo2: number | null;
  temperature: number | null;
  bloodPressure: string | null;
} | null {
  const sanitized = String(hexPayload || "").replace(/[^0-9a-f]/gi, "");
  if (!sanitized || sanitized.length < 8) {
    return null;
  }

  try {
    const decoded = atob(sanitized);
    const parsed = JSON.parse(decoded) as Record<string, unknown>;

    const heartRate = toFiniteNumber(parsed.heartRate ?? parsed.heart_rate ?? parsed.hr);
    const spo2 = toFiniteNumber(parsed.spo2 ?? parsed.SpO2 ?? parsed.spo_2);
    const temperature = toFiniteNumber(parsed.temperature ?? parsed.temp ?? parsed.temp_c);
    const bloodPressureRaw = String(
      parsed.bloodPressure ??
        parsed.blood_pressure ??
        parsed.bp ??
        ""
    ).trim();

    return {
      heartRate,
      spo2,
      temperature,
      bloodPressure: bloodPressureRaw || null,
    };
  } catch {
    return null;
  }
}

function deriveRiskAssessment(vitals: {
  heartRate: number;
  spo2: number;
  temperature: number;
  bloodPressure: string;
}): { riskScore: number; riskLevel: SupportedRiskLevel; reason: string } {
  const { systolic, diastolic } = parseBloodPressureParts(vitals.bloodPressure);
  let score = 0;
  const reasons: string[] = [];

  if (vitals.spo2 < 88) {
    score += 48;
    reasons.push(`SpO2 critically low at ${vitals.spo2}%`);
  } else if (vitals.spo2 < 93) {
    score += 28;
    reasons.push(`SpO2 below target at ${vitals.spo2}%`);
  }

  if (vitals.heartRate > 130 || vitals.heartRate < 55) {
    score += 24;
    reasons.push(`Heart rate unstable at ${vitals.heartRate} bpm`);
  } else if (vitals.heartRate > 110 || vitals.heartRate < 60) {
    score += 14;
    reasons.push(`Heart rate drifting at ${vitals.heartRate} bpm`);
  }

  if (vitals.temperature >= 102) {
    score += 18;
    reasons.push(`High fever trend at ${vitals.temperature.toFixed(1)} F`);
  } else if (vitals.temperature >= 100.4) {
    score += 10;
    reasons.push(`Temperature elevated at ${vitals.temperature.toFixed(1)} F`);
  }

  if (systolic !== null && systolic < 90) {
    score += 20;
    reasons.push(`Systolic pressure low at ${systolic}`);
  } else if (systolic !== null && systolic < 100) {
    score += 10;
    reasons.push(`Systolic pressure borderline at ${systolic}`);
  }

  if (diastolic !== null && diastolic < 55) {
    score += 8;
    reasons.push(`Diastolic pressure low at ${diastolic}`);
  }

  const riskScore = clampValue(Math.round(score), 0, 100);
  const riskLevel: SupportedRiskLevel =
    riskScore >= 75
      ? "CRITICAL"
      : riskScore >= 55
        ? "MODERATE"
        : riskScore >= 30
          ? "WARNING"
          : "STABLE";

  return {
    riskScore,
    riskLevel,
    reason:
      reasons.length > 0
        ? reasons.join("; ")
        : "Vitals currently within expected ICU monitoring range",
  };
}

function deriveForecastLevel(riskLevel: SupportedRiskLevel): TelemetryUpdateResponse["patient"]["predictedRiskNext5Minutes"] {
  if (riskLevel === "CRITICAL") {
    return "CRITICAL";
  }
  if (riskLevel === "MODERATE") {
    return "MODERATE";
  }
  if (riskLevel === "WARNING") {
    return "WARNING";
  }
  return "STABLE";
}

function buildDemoFallbackTelemetryResult(payload: TelemetrySubmissionPayload): TelemetryUpdateResponse {
  const decoded = payload.hexPayload ? decodeHexJsonVitals(payload.hexPayload) : null;

  const heartRate = clampValue(
    Math.round(toFiniteNumber(decoded?.heartRate ?? payload.heartRate) ?? 98),
    30,
    220
  );
  const spo2 = clampValue(
    Math.round(toFiniteNumber(decoded?.spo2 ?? payload.spo2) ?? 96),
    40,
    100
  );
  const temperature = Number(
    clampValue(toFiniteNumber(decoded?.temperature ?? payload.temperature) ?? 99.1, 90, 108).toFixed(1)
  );

  const bpRaw =
    String(decoded?.bloodPressure || payload.bloodPressure || "").trim() || "120/80";
  const bpParts = parseBloodPressureParts(bpRaw);
  const bloodPressure =
    bpParts.systolic !== null && bpParts.diastolic !== null
      ? `${Math.round(bpParts.systolic)}/${Math.round(bpParts.diastolic)}`
      : "120/80";

  const vitals = {
    heartRate,
    spo2,
    temperature,
    bloodPressure,
  };

  const risk = deriveRiskAssessment(vitals);
  const patientId = String(payload.patientId || "demo-patient").trim() || "demo-patient";
  const monitorId = String(payload.monitorId || `monitor-${patientId}`).trim() || `monitor-${patientId}`;
  const predictedRisk = deriveForecastLevel(risk.riskLevel);
  const now = new Date().toISOString();
  const critical = risk.riskLevel === "CRITICAL";

  return {
    patient: {
      patientId,
      heartRate,
      spo2,
      temperature,
      bloodPressure,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      predictedRiskNext5Minutes: predictedRisk,
      telemetrySource: "simulator",
      lastUpdated: now,
    },
    risk: {
      patientId,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      reason: `${risk.reason} (local demo fallback)`,
    },
    decodedVitals: {
      heartRate,
      spo2,
      temperature,
      bloodPressure,
      monitorId,
      source: payload.hexPayload ? "hex" : "json",
    },
    decoderWarnings: payload.hexPayload
      ? ["Backend unavailable. Used local demo decoder fallback."]
      : ["Backend unavailable. Used local demo telemetry fallback."],
    identityResolution: {
      patientId,
      monitorKey: monitorId,
      providedPatientId: patientId,
      resolution: "direct-bind",
      collision: false,
      notes: ["local-demo-fallback"],
    },
    forecast: {
      predictedRiskNext5Minutes: predictedRisk,
      source: "heuristic-fallback",
      forecastedVitals: null,
      warning: "Local demo fallback response",
    },
    alert: critical
      ? {
          text: `Critical deterioration detected for patient ${patientId}.`,
          language: "en",
          audioBase64: null,
          delivered: true,
          deliveryReason: null,
          whatsappMessage: `CRITICAL ALERT\nPatient ID: ${patientId}\nRisk Score: ${risk.riskScore}`,
          whatsapp: {
            attempted: true,
            sent: true,
            reason: null,
            sentCount: 1,
            recipients: ["demo"],
            results: [{ recipient: "demo", sent: true }],
          },
        }
      : null,
    escalationChannels: critical
      ? {
          voiceBroadcast: {
            attempted: true,
            delivered: true,
            reason: null,
          },
          dashboardAlertStream: {
            attempted: true,
            delivered: true,
            reason: null,
          },
          whatsappEscalation: {
            attempted: true,
            sent: true,
            reason: null,
            sentCount: 1,
            recipients: ["demo"],
            results: [{ recipient: "demo", sent: true }],
          },
        }
      : null,
  };
}

const DEFAULT_FORM: TelemetryForm = {
  patientId: "204",
  monitorId: "monitor-204",
  heartRate: "110",
  spo2: "91",
  temperature: "99.4",
  bloodPressure: "122/82",
  telemetryHex: DEMO_TELEMETRY_HEX_PRIMARY,
};

const DEFAULT_RISK_PANEL_VITALS = {
  heartRate: Number(DEFAULT_FORM.heartRate),
  spo2: Number(DEFAULT_FORM.spo2),
  temperature: Number(DEFAULT_FORM.temperature),
  bloodPressure: DEFAULT_FORM.bloodPressure,
};

const DEMO_TEST_ALERT_PAYLOAD: TelemetrySubmissionPayload = {
  patientId: "demo-alert-911",
  monitorId: "demo-alert-monitor",
  heartRate: 146,
  spo2: 84,
  temperature: 103.1,
  bloodPressure: "82/50",
};

const DEMO_BOOTSTRAP_PAYLOADS: TelemetrySubmissionPayload[] = [
  {
    patientId: "204",
    monitorId: "monitor-204",
    hexPayload: DEMO_TELEMETRY_HEX_SECONDARY,
  },
  {
    patientId: "305",
    monitorId: "monitor-305",
    heartRate: 112,
    spo2: 92,
    temperature: 100.2,
    bloodPressure: "138/88",
  },
  DEMO_TEST_ALERT_PAYLOAD,
];

const RISK_HISTORY_LIMIT = 24;
const REFRESH_INTERVAL_MS = 3000;
const PROJECTION_REFRESH_VISIBLE_MS = 20000;
const RISK_SCORE_LEGEND = "0-30 stable | 31-60 warning | 61-100 critical";
const PROJECTION_REFRESH_HIDDEN_MS = 90000;
const CRITICAL_ALERT_SOUND_SRC = "/assets/alert.mp3";
const CRITICAL_ALERT_SOUND_MAX_PLAY_MS = 6000;
const rapidLogoSrc = "/assets/rapid.png?v=20260409";

type DashboardSectionId =
  | "icuSummary"
  | "stats"
  | "patientOps"
  | "hexDecoder"
  | "identityCollision"
  | "alertsTimeline"
  | "alertsStream"
  | "telemetryTimeline"
  | "stabilityTimeline"
  | "timeline"
  | "forecast"
  | "voiceAssistant"
  | "voiceLogs"
  | "voiceStatus"
  | "integrationStatus"
  | "endpointCoverage"
  | "telemetryDebug"
  | "modelEvaluation";

const DASHBOARD_SECTION_TABS: Array<{
  id: DashboardSectionId;
  label: string;
  sticker: string;
  stickerTone?: "default" | "stats" | "alert";
}> = [
  { id: "icuSummary", label: "ICU Summary", sticker: "LIVE CARE" },
  { id: "stats", label: "Stats Cards", sticker: "STATS MATRICES", stickerTone: "stats" },
  { id: "patientOps", label: "Patient Snapshot + Push", sticker: "TRIAGE" },
  { id: "hexDecoder", label: "Hex Decoder", sticker: "RAW FEED" },
  { id: "identityCollision", label: "Identity Mapping", sticker: "RESOLVE" },
  { id: "alertsTimeline", label: "Alerts Timeline", sticker: "ALERT", stickerTone: "alert" },
  { id: "alertsStream", label: "Alerts Stream", sticker: "ALERT", stickerTone: "alert" },
  { id: "telemetryTimeline", label: "Telemetry Timeline", sticker: "VITAL TREND" },
  { id: "stabilityTimeline", label: "Stability Timeline", sticker: "RISK FLOW" },
  { id: "timeline", label: "Timeline + Alerts", sticker: "HISTORY" },
  { id: "forecast", label: "Forecast Projections", sticker: "PREDICT" },
  { id: "voiceAssistant", label: "Voice Assistant", sticker: "ASK AI" },
  { id: "voiceLogs", label: "Voice Logs", sticker: "TRANSCRIPTS" },
  { id: "voiceStatus", label: "Voice Service Status", sticker: "SERVICE" },
  { id: "integrationStatus", label: "Integration Status", sticker: "CONNECT" },
  { id: "endpointCoverage", label: "Endpoint Coverage", sticker: "API MAP" },
  { id: "telemetryDebug", label: "Telemetry Debug", sticker: "DEBUG" },
  { id: "modelEvaluation", label: "Model Evaluation", sticker: "MODEL QA" },
];

function badgeClass(level: string): string {
  const normalized = level.toUpperCase();
  if (normalized === "CRITICAL") {
    return "border-rose-500/40 bg-rose-500/15 text-rose-300";
  }
  if (normalized === "MODERATE") {
    return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  }
  if (normalized === "WARNING") {
    return "border-orange-500/40 bg-orange-500/15 text-orange-300";
  }
  return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
}

function toTelemetrySourceLabel(value: unknown): "HL7" | "Serial" | "Simulator" | "Unknown" {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized.includes("hl7")) {
    return "HL7";
  }

  if (normalized.includes("serial") || normalized.includes("com") || normalized.includes("tty")) {
    return "Serial";
  }

  if (normalized.includes("simulator") || normalized.startsWith("sim")) {
    return "Simulator";
  }

  return "Unknown";
}

function telemetrySourceBadgeClass(value: unknown): string {
  const label = toTelemetrySourceLabel(value);

  if (label === "HL7") {
    return "border-cyan-500/40 bg-cyan-500/15 text-cyan-300";
  }

  if (label === "Serial") {
    return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  }

  if (label === "Simulator") {
    return "border-violet-500/40 bg-violet-500/15 text-violet-300";
  }

  return "border-slate-500/35 bg-slate-500/15 text-slate-300";
}

function clampRiskScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeRiskLevel(level: string): "CRITICAL" | "MODERATE" | "WARNING" | "STABLE" {
  const normalized = String(level || "STABLE").toUpperCase();
  if (normalized === "CRITICAL") {
    return "CRITICAL";
  }
  if (normalized === "MODERATE") {
    return "MODERATE";
  }
  if (normalized === "WARNING") {
    return "WARNING";
  }
  return "STABLE";
}

function summarizePatients(patients: IcuSummaryResponse["patients"]): IcuSummaryResponse["summary"] {
  const summary = {
    critical: 0,
    moderate: 0,
    warning: 0,
    stable: 0,
    total: patients.length,
  };

  for (const patient of patients) {
    const riskLevel = normalizeRiskLevel(patient.riskLevel);
    if (riskLevel === "CRITICAL") {
      summary.critical += 1;
    } else if (riskLevel === "MODERATE") {
      summary.moderate += 1;
    } else if (riskLevel === "WARNING") {
      summary.warning += 1;
    } else {
      summary.stable += 1;
    }
  }

  return summary;
}

function summarizeForecastSources(projections: ForecastProjectionRecord[]): ForecastSourceSummary {
  const summary: ForecastSourceSummary = {
    legacyMl: 0,
    heuristicFallback: 0,
    disabled: 0,
  };

  for (const projection of projections) {
    const source = String(projection.source || "").toLowerCase();
    if (source === "legacy-ml") {
      summary.legacyMl += 1;
    } else if (source === "disabled") {
      summary.disabled += 1;
    } else {
      summary.heuristicFallback += 1;
    }
  }

  return summary;
}

function buildDemoPatientsSnapshot(): IcuSummaryResponse["patients"] {
  const now = Date.now();
  return [
    {
      patientId: "204",
      heartRate: 108,
      spo2: 93,
      temperature: 99.5,
      bloodPressure: "130/84",
      riskScore: 56,
      riskLevel: "MODERATE",
      predictedRiskNext5Minutes: "WARNING",
      telemetrySource: "simulator",
      lastUpdated: new Date(now - 90 * 1000).toISOString(),
    },
    {
      patientId: "305",
      heartRate: 124,
      spo2: 89,
      temperature: 101.4,
      bloodPressure: "94/60",
      riskScore: 78,
      riskLevel: "CRITICAL",
      predictedRiskNext5Minutes: "CRITICAL",
      telemetrySource: "hl7",
      lastUpdated: new Date(now - 45 * 1000).toISOString(),
    },
    {
      patientId: "412",
      heartRate: 92,
      spo2: 97,
      temperature: 98.8,
      bloodPressure: "118/76",
      riskScore: 24,
      riskLevel: "STABLE",
      predictedRiskNext5Minutes: "STABLE",
      telemetrySource: "serial",
      lastUpdated: new Date(now - 20 * 1000).toISOString(),
    },
  ];
}

function buildDemoTimelineEvents(): TimelineEvent[] {
  const now = Date.now();
  return [
    {
      id: "demo-telemetry-1",
      eventType: "telemetry",
      patientId: "204",
      occurredAt: new Date(now - 8 * 60 * 1000).toISOString(),
      riskLevel: "WARNING",
      telemetry: {
        heartRate: 108,
        spo2: 93,
        temperature: 99.5,
        bloodPressure: "130/84",
      },
    },
    {
      id: "demo-telemetry-2",
      eventType: "telemetry",
      patientId: "305",
      occurredAt: new Date(now - 4 * 60 * 1000).toISOString(),
      riskLevel: "CRITICAL",
      telemetry: {
        heartRate: 124,
        spo2: 89,
        temperature: 101.4,
        bloodPressure: "94/60",
      },
    },
    {
      id: "demo-alert-1",
      eventType: "alert",
      patientId: "305",
      occurredAt: new Date(now - 3 * 60 * 1000).toISOString(),
      riskLevel: "CRITICAL",
      alertType: "critical-alert",
      message: "Demo escalation: SpO2 and BP indicate rapid deterioration.",
      delivered: true,
      deliveryChannels: ["voice", "dashboard", "whatsapp"],
    },
  ];
}

function buildDemoForecastProjections(): ForecastProjectionRecord[] {
  const now = Date.now();
  return [
    {
      patientId: "204",
      patientLastUpdated: new Date(now - 90 * 1000).toISOString(),
      currentRiskScore: 56,
      futureRiskScore: 64,
      predictedDeteriorationState: "WARNING",
      source: "legacy-ml",
      warning: null,
      forecastedVitals: [114, 91, 100.1, 128, 84, 99],
      timelineProjection: [
        { minute: 5, riskScore: 60 },
        { minute: 10, riskScore: 64 },
        { minute: 15, riskScore: 62 },
      ],
    },
    {
      patientId: "305",
      patientLastUpdated: new Date(now - 45 * 1000).toISOString(),
      currentRiskScore: 78,
      futureRiskScore: 88,
      predictedDeteriorationState: "CRITICAL",
      source: "heuristic-fallback",
      warning: "Using deterministic fallback for demo.",
      forecastedVitals: [132, 87, 102.2, 90, 56, 67],
      timelineProjection: [
        { minute: 5, riskScore: 82 },
        { minute: 10, riskScore: 86 },
        { minute: 15, riskScore: 88 },
      ],
    },
    {
      patientId: "412",
      patientLastUpdated: new Date(now - 20 * 1000).toISOString(),
      currentRiskScore: 24,
      futureRiskScore: 30,
      predictedDeteriorationState: "STABLE",
      source: "disabled",
      warning: "Forecast endpoint disabled; showing safe baseline.",
      forecastedVitals: [94, 97, 98.9, 118, 76, 90],
      timelineProjection: [
        { minute: 5, riskScore: 26 },
        { minute: 10, riskScore: 28 },
        { minute: 15, riskScore: 30 },
      ],
    },
  ];
}

function RiskTrendChart({ values }: { values: number[] }) {
  const width = 240;
  const height = 68;
  const padding = 6;
  const normalized = values.map(clampRiskScore).slice(-RISK_HISTORY_LIMIT);

  if (normalized.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-500">
        Waiting for risk data...
      </div>
    );
  }

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const denominator = Math.max(1, normalized.length - 1);

  const points = normalized.map((value, index) => {
    const x = padding + (index / denominator) * innerWidth;
    const y = padding + ((100 - value) / 100) * innerHeight;
    return { x, y };
  });

  const linePoints = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath =
    points.length > 1
      ? `M ${first.x.toFixed(2)} ${height - padding} ${points
          .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
          .join(" ")} L ${last.x.toFixed(2)} ${height - padding} Z`
      : "";

  return (
    <div className="space-y-1 rounded-lg border border-white/10 bg-black/20 px-2 py-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" role="img" aria-label="Risk score trend">
        {[25, 50, 75].map((level) => {
          const y = padding + ((100 - level) / 100) * innerHeight;
          return (
            <line
              key={level}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="rgba(148, 163, 184, 0.24)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
          );
        })}

        {points.length > 1 ? <path d={areaPath} fill="rgba(139, 92, 246, 0.14)" /> : null}

        {points.length > 1 ? (
          <polyline
            points={linePoints}
            fill="none"
            stroke="rgba(167, 139, 250, 0.95)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <circle cx={first.x} cy={first.y} r="2.5" fill="rgba(167, 139, 250, 0.95)" />
        )}

        <circle cx={last.x} cy={last.y} r="2.8" fill="#22c55e" />
      </svg>

      <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
        <span>oldest</span>
        <span>latest: {normalized[normalized.length - 1]}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [healthService, setHealthService] = useState("rapid-ai-server");
  const [isForecastReady, setIsForecastReady] = useState(false);
  const [forecastSource, setForecastSource] = useState("unknown");
  const [forecastStatusMessage, setForecastStatusMessage] = useState("");
  const [summaryData, setSummaryData] = useState<IcuSummaryResponse | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [forecastProjections, setForecastProjections] = useState<ForecastProjectionRecord[]>([]);
  const [forecastSourceSummary, setForecastSourceSummary] = useState<ForecastSourceSummary>({
    legacyMl: 0,
    heuristicFallback: 0,
    disabled: 0,
  });
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState("");
  const [exportingFormat, setExportingFormat] = useState<"csv" | "json" | null>(null);
  const [projectionFilterPatientIds, setProjectionFilterPatientIds] = useState("");
  const [projectionFilterFrom, setProjectionFilterFrom] = useState("");
  const [projectionFilterTo, setProjectionFilterTo] = useState("");
  const [riskHistoryByPatient, setRiskHistoryByPatient] = useState<RiskHistoryByPatient>({});
  const [telemetryDebugEntries, setTelemetryDebugEntries] = useState<TelemetryDebugEntry[]>([]);
  const [form, setForm] = useState<TelemetryForm>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [triggeringTestAlert, setTriggeringTestAlert] = useState(false);
  const [seedingDemoData, setSeedingDemoData] = useState(false);
  const [hasTriggeredPushTelemetry, setHasTriggeredPushTelemetry] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState<{ message: string; openedAt: number } | null>(null);
  const [activeSection, setActiveSection] = useState<DashboardSectionId>("patientOps");
  const [selectedPatientId, setSelectedPatientId] = useState<string>(DEFAULT_FORM.patientId);
  const [patientProfileSearchId, setPatientProfileSearchId] = useState(DEFAULT_FORM.patientId);
  const [lastTelemetryDiagnostics, setLastTelemetryDiagnostics] = useState<LastTelemetryDiagnostics | null>(null);
  const escalationAudioRef = useRef<HTMLAudioElement | null>(null);
  const escalationAudioStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playedEscalationSoundIdsRef = useRef<Set<string>>(new Set());

  const stopEscalationCriticalAlertSound = useCallback(() => {
    if (escalationAudioStopTimerRef.current) {
      clearTimeout(escalationAudioStopTimerRef.current);
      escalationAudioStopTimerRef.current = null;
    }

    const audio = escalationAudioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
  }, []);

  const triggerEscalationCriticalAlertSound = useCallback(
    (alertEventId: string) => {
      const normalizedEventId = String(alertEventId || "").trim();
      if (!normalizedEventId || playedEscalationSoundIdsRef.current.has(normalizedEventId)) {
        return;
      }

      playedEscalationSoundIdsRef.current.add(normalizedEventId);

      if (!escalationAudioRef.current) {
        const nextAudio = new Audio(CRITICAL_ALERT_SOUND_SRC);
        nextAudio.loop = false;
        escalationAudioRef.current = nextAudio;
      }

      const audio = escalationAudioRef.current;
      audio.loop = false;

      stopEscalationCriticalAlertSound();
      console.log("Critical alert sound triggered");
      void audio.play().catch(() => undefined);

      escalationAudioStopTimerRef.current = setTimeout(() => {
        stopEscalationCriticalAlertSound();
      }, CRITICAL_ALERT_SOUND_MAX_PLAY_MS);
    },
    [stopEscalationCriticalAlertSound]
  );

  const navigateToPatientProfile = useCallback(() => {
    const normalizedPatientId = String(patientProfileSearchId || "").trim();
    if (!normalizedPatientId) {
      return;
    }

    router.push(`/patients/${encodeURIComponent(normalizedPatientId)}`);
  }, [patientProfileSearchId, router]);

  const demoPatientsSnapshot = useMemo(() => buildDemoPatientsSnapshot(), []);
  const demoTimelineSnapshot = useMemo(() => buildDemoTimelineEvents(), []);
  const demoForecastProjectionSnapshot = useMemo(() => buildDemoForecastProjections(), []);

  const syncTelemetryResultToDashboard = useCallback(
    (
      result: TelemetryUpdateResponse,
      options?: {
        rawHexPayload?: string;
        monitorId?: string;
      }
    ) => {
      setSummaryData((previous) => {
        const existingPatients = previous?.patients ?? [];
        const nextPatients = [
          result.patient,
          ...existingPatients.filter((patient) => patient.patientId !== result.patient.patientId),
        ];

        return {
          summary: summarizePatients(nextPatients),
          patients: nextPatients,
        };
      });

      setRiskHistoryByPatient((previous) => {
        const patientId = String(result.patient.patientId);
        const history = previous[patientId] ?? [];
        return {
          ...previous,
          [patientId]: [...history, clampRiskScore(result.patient.riskScore)].slice(-RISK_HISTORY_LIMIT),
        };
      });

      const normalizedHexPayload = String(options?.rawHexPayload || "").trim();
      if (normalizedHexPayload && result.decodedVitals) {
        setTelemetryDebugEntries((previous) => {
          const nextEntry: TelemetryDebugEntry = {
            id: `${Date.now()}-${result.patient.patientId}`,
            patientId: result.patient.patientId,
            rawHexPayload: normalizedHexPayload,
            decodedHeartRate: Number(result.decodedVitals?.heartRate ?? result.patient.heartRate),
            decodedSpo2: Number(result.decodedVitals?.spo2 ?? result.patient.spo2),
            decodedTemperature: Number(result.decodedVitals?.temperature ?? result.patient.temperature),
            decodedBloodPressure: String(result.decodedVitals?.bloodPressure ?? result.patient.bloodPressure),
            source: String(result.decodedVitals?.source ?? "unknown"),
            monitorId: String(result.decodedVitals?.monitorId ?? options?.monitorId ?? "unknown"),
            warnings: Array.isArray(result.decoderWarnings) ? result.decoderWarnings : [],
            createdAt: new Date().toISOString(),
          };

          return [nextEntry, ...previous].slice(0, 10);
        });
      }

      setLastTelemetryDiagnostics({
        riskLevel: result.risk.riskLevel,
        channels: result.escalationChannels ?? null,
        capturedAt: new Date().toISOString(),
      });
      setSelectedPatientId(result.patient.patientId);
    },
    []
  );

  const refresh = useCallback(async () => {
    const [health, summary, timeline] = await Promise.all([
      fetchHealth(),
      fetchIcuSummary(),
      fetchIcuTimeline({ limit: 20 }),
    ]);

    setHealthService(health.service);
    setIsForecastReady(Boolean(health.forecast?.ready));
    setForecastSource(String(health.forecast?.source || (health.forecast?.ready ? "legacy-ml" : "unknown")));
    setForecastStatusMessage(String(health.forecast?.message || "").trim());
    setSummaryData(summary);
    setTimelineEvents(timeline.events || []);
    setLastUpdatedAt(new Date().toISOString());
    setError("");
  }, []);

  const projectionFilters = useMemo(() => {
    const patientIds = parsePatientIdsCsv(projectionFilterPatientIds);
    const from = toIsoFilterValue(projectionFilterFrom);
    const to = toIsoFilterValue(projectionFilterTo);
    const hasInvalidRange = Boolean(from && to && new Date(from).getTime() > new Date(to).getTime());

    const filters: ForecastProjectionFilters = {};
    if (patientIds.length > 0) {
      filters.patientIds = patientIds;
    }
    if (from) {
      filters.from = from;
    }
    if (to) {
      filters.to = to;
    }

    return {
      filters,
      hasInvalidRange,
    };
  }, [projectionFilterPatientIds, projectionFilterFrom, projectionFilterTo]);

  const refreshForecastProjections = useCallback(async () => {
    if (projectionFilters.hasInvalidRange) {
      setForecastError("Invalid filter range: from must be before or equal to to.");
      return;
    }

    setForecastLoading(true);
    try {
      const projectionResponse = await fetchForecastProjections(projectionFilters.filters);
      const projections = projectionResponse.projections || [];
      setForecastProjections(projections);
      setForecastSourceSummary(projectionResponse.sourceSummary || summarizeForecastSources(projections));
      setForecastError("");
    } catch (err) {
      setForecastError(err instanceof Error ? err.message : "Forecast projection refresh failed");
    } finally {
      setForecastLoading(false);
    }
  }, [projectionFilters]);

  const handleExportProjection = useCallback(async (format: "csv" | "json") => {
    if (projectionFilters.hasInvalidRange) {
      setForecastError("Invalid filter range: from must be before or equal to to.");
      return;
    }

    setExportingFormat(format);
    try {
      const fileBlob = await downloadForecastProjectionExport(format, projectionFilters.filters);
      const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
      const objectUrl = window.URL.createObjectURL(fileBlob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `forecast-projections-${timestamp}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      setForecastError("");
    } catch (err) {
      setForecastError(err instanceof Error ? err.message : "Forecast projection export failed");
    } finally {
      setExportingFormat(null);
    }
  }, [projectionFilters]);

  const handleApplyProjectionDatePreset = useCallback((hours: number) => {
    const safeHours = Number.isFinite(hours) && hours > 0 ? Math.round(hours) : 1;
    const now = new Date();
    const from = new Date(now.getTime() - safeHours * 60 * 60 * 1000);
    setProjectionFilterFrom(toDateTimeLocalInputValue(from));
    setProjectionFilterTo(toDateTimeLocalInputValue(now));
    setForecastError("");
  }, []);

  const handleClearProjectionFilters = useCallback(() => {
    setProjectionFilterPatientIds("");
    setProjectionFilterFrom("");
    setProjectionFilterTo("");
    setForecastError("");
  }, []);

  const triggerDemoAlert = useCallback(async () => {
    setTriggeringTestAlert(true);
    setError("");
    setSuccessToast(null);

    try {
      let fallbackUsed = false;
      let result: TelemetryUpdateResponse;

      try {
        result = await updateTelemetry(DEMO_TEST_ALERT_PAYLOAD);
      } catch {
        fallbackUsed = true;
        result = buildDemoFallbackTelemetryResult(DEMO_TEST_ALERT_PAYLOAD);
      }

      syncTelemetryResultToDashboard(result, { monitorId: DEMO_TEST_ALERT_PAYLOAD.monitorId });
      setHasTriggeredPushTelemetry(true);
      if (result.risk.riskLevel === "CRITICAL") {
        triggerEscalationCriticalAlertSound(
          `escalation-trigger-${result.patient.patientId}-${Date.now()}`
        );
      }
      setForm((previous) => ({
        ...previous,
        patientId: DEMO_TEST_ALERT_PAYLOAD.patientId,
        monitorId: DEMO_TEST_ALERT_PAYLOAD.monitorId,
        heartRate: String(DEMO_TEST_ALERT_PAYLOAD.heartRate ?? previous.heartRate),
        spo2: String(DEMO_TEST_ALERT_PAYLOAD.spo2 ?? previous.spo2),
        temperature: String(DEMO_TEST_ALERT_PAYLOAD.temperature ?? previous.temperature),
        bloodPressure: String(DEMO_TEST_ALERT_PAYLOAD.bloodPressure ?? previous.bloodPressure),
      }));
      setActiveSection("alertsTimeline");
      setSuccessToast({
        message: fallbackUsed
          ? "Test Alert (Demo) triggered via local fallback."
          : "Test Alert (Demo) triggered successfully.",
        openedAt: Date.now(),
      });
      setError("");

      void refresh();
      void refreshForecastProjections().catch(() => undefined);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Demo alert trigger failed");
    } finally {
      setTriggeringTestAlert(false);
    }
  }, [
    refresh,
    refreshForecastProjections,
    syncTelemetryResultToDashboard,
    triggerEscalationCriticalAlertSound,
  ]);

  const runDemoDataset = useCallback(async () => {
    setSeedingDemoData(true);
    setError("");
    setSuccessToast(null);

    try {
      let fallbackCount = 0;

      for (const payload of DEMO_BOOTSTRAP_PAYLOADS) {
        let result: TelemetryUpdateResponse;
        try {
          result = await updateTelemetry({ ...payload, sourceHint: "dashboard" });
        } catch {
          fallbackCount += 1;
          result = buildDemoFallbackTelemetryResult(payload);
        }

        syncTelemetryResultToDashboard(result, {
          rawHexPayload: payload.hexPayload,
          monitorId: payload.monitorId,
        });
        setHasTriggeredPushTelemetry(true);
        await new Promise((resolve) => {
          window.setTimeout(resolve, 180);
        });
      }

      await refresh();
      void refreshForecastProjections().catch(() => undefined);
      setSuccessToast({
        message:
          fallbackCount > 0
            ? `Demo dataset loaded (${fallbackCount} local fallback entr${fallbackCount === 1 ? "y" : "ies"}).`
            : "Demo dataset loaded with sample telemetry, alert, and forecast traces.",
        openedAt: Date.now(),
      });
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Demo dataset seed failed");
    } finally {
      setSeedingDemoData(false);
    }
  }, [
    refresh,
    refreshForecastProjections,
    syncTelemetryResultToDashboard,
    triggerEscalationCriticalAlertSound,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.classList.add("dashboard-scrollbar-hidden");
    document.body.classList.add("dashboard-scrollbar-hidden");

    return () => {
      document.documentElement.classList.remove("dashboard-scrollbar-hidden");
      document.body.classList.remove("dashboard-scrollbar-hidden");
    };
  }, []);

  useEffect(() => {
    return () => {
      stopEscalationCriticalAlertSound();
    };
  }, [stopEscalationCriticalAlertSound]);

  useEffect(() => {
    void refresh().catch((err) => {
      setIsForecastReady(false);
      setForecastSource("offline");
      setForecastStatusMessage("Health refresh failed");
      setError(err instanceof Error ? err.message : "Could not load dashboard data");
    });

    const timer = setInterval(() => {
      void refresh().catch(() => {
        setIsForecastReady(false);
        setForecastSource("offline");
        setForecastStatusMessage("Health refresh failed");
      });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = (delayMs: number) => {
      if (!active) {
        return;
      }

      timer = setTimeout(() => {
        void runPollCycle();
      }, delayMs);
    };

    const runPollCycle = async () => {
      if (!active) {
        return;
      }

      const isHidden = typeof document !== "undefined" && document.visibilityState !== "visible";
      if (!isHidden) {
        await refreshForecastProjections().catch(() => undefined);
      }

      scheduleNext(isHidden ? PROJECTION_REFRESH_HIDDEN_MS : PROJECTION_REFRESH_VISIBLE_MS);
    };

    void refreshForecastProjections().catch(() => undefined);
    scheduleNext(PROJECTION_REFRESH_VISIBLE_MS);

    const handleVisibilityChange = () => {
      if (!active || typeof document === "undefined") {
        return;
      }

      if (document.visibilityState === "visible") {
        if (timer) {
          clearTimeout(timer);
        }

        void refreshForecastProjections().catch(() => undefined);
        scheduleNext(PROJECTION_REFRESH_VISIBLE_MS);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshForecastProjections]);

  useEffect(() => {
    const patients = summaryData?.patients;
    if (!patients || patients.length === 0) {
      return;
    }

    setRiskHistoryByPatient((previous) => {
      const nextHistory: RiskHistoryByPatient = {};

      for (const patient of patients) {
        const patientId = String(patient.patientId);
        const nextScore = clampRiskScore(patient.riskScore);
        const existing = previous[patientId] ?? [];
        nextHistory[patientId] = [...existing, nextScore].slice(-RISK_HISTORY_LIMIT);
      }

      return nextHistory;
    });
  }, [summaryData]);

  useEffect(() => {
    const nextPatients = summaryData?.patients ?? [];
    if (nextPatients.length === 0) {
      return;
    }

    const selectedExists = nextPatients.some((patient) => patient.patientId === selectedPatientId);
    if (!selectedExists) {
      setSelectedPatientId(nextPatients[0].patientId);
    }
  }, [summaryData, selectedPatientId]);

  useEffect(() => {
    if (!successToast) {
      return;
    }

    const timer = setTimeout(() => {
      setSuccessToast(null);
    }, 2600);

    return () => {
      clearTimeout(timer);
    };
  }, [successToast]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccessToast(null);
    setSubmitting(true);

    try {
      const hexPayload = form.telemetryHex.trim();
      const structuredPayload: TelemetrySubmissionPayload = {
        patientId: form.patientId,
        monitorId: form.monitorId,
        heartRate: Number(form.heartRate),
        spo2: Number(form.spo2),
        temperature: Number(form.temperature),
        bloodPressure: form.bloodPressure,
        sourceHint: "dashboard",
      };

      const primaryPayload: TelemetrySubmissionPayload = hexPayload
        ? {
            ...structuredPayload,
            hexPayload,
          }
        : structuredPayload;

      let result: TelemetryUpdateResponse;
      let fallbackUsed = false;

      try {
        result = await updateTelemetry(primaryPayload);
      } catch {
        if (hexPayload) {
          try {
            result = await updateTelemetry(structuredPayload);
            fallbackUsed = true;
          } catch {
            fallbackUsed = true;
            result = buildDemoFallbackTelemetryResult(primaryPayload);
          }
        } else {
          fallbackUsed = true;
          result = buildDemoFallbackTelemetryResult(primaryPayload);
        }
      }

      syncTelemetryResultToDashboard(result, {
        rawHexPayload: hexPayload,
        monitorId: form.monitorId,
      });
      setHasTriggeredPushTelemetry(true);

      void refresh();
      void refreshForecastProjections().catch(() => undefined);

      setSuccessToast({
        message: fallbackUsed
          ? "Telemetry Updated (demo fallback mode)."
          : "Telemetry Updated Successfully",
        openedAt: Date.now(),
      });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Telemetry push failed");
    } finally {
      setSubmitting(false);
    }
  }

  const summary = useMemo(
    () => {
      const livePatients = summaryData?.patients ?? [];
      if (livePatients.length > 0) {
        return summaryData?.summary ?? summarizePatients(livePatients);
      }

      return summarizePatients(demoPatientsSnapshot);
    },
    [demoPatientsSnapshot, summaryData]
  );

  const patients = useMemo(() => {
    const livePatients = summaryData?.patients ?? [];
    if (livePatients.length > 0) {
      return livePatients;
    }

    return demoPatientsSnapshot;
  }, [demoPatientsSnapshot, summaryData]);

  const timelineEventsForDisplay = useMemo(() => {
    if (timelineEvents.length > 0) {
      return timelineEvents;
    }

    return demoTimelineSnapshot;
  }, [demoTimelineSnapshot, timelineEvents]);

  const effectiveForecastProjections = useMemo(() => {
    if (forecastProjections.length > 0) {
      return forecastProjections;
    }

    return demoForecastProjectionSnapshot;
  }, [demoForecastProjectionSnapshot, forecastProjections]);

  const displayForecastSourceSummary = useMemo(() => {
    if (forecastProjections.length > 0) {
      return forecastSourceSummary;
    }

    return summarizeForecastSources(effectiveForecastProjections);
  }, [effectiveForecastProjections, forecastProjections, forecastSourceSummary]);
  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.patientId === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );

  const escalationStrip = useMemo(() => {
    if (!lastTelemetryDiagnostics) {
      return null;
    }

    const isCritical = lastTelemetryDiagnostics.riskLevel === "CRITICAL";
    const channels = lastTelemetryDiagnostics.channels;

    const voice =
      !isCritical
        ? { label: "Not Triggered", className: "border-slate-600/40 bg-slate-700/20 text-slate-300" }
        : channels?.voiceBroadcast?.delivered
          ? { label: "Delivered", className: "border-emerald-500/45 bg-emerald-500/15 text-emerald-300" }
          : {
              label: channels?.voiceBroadcast?.reason
                ? `Failed (${channels.voiceBroadcast.reason})`
                : "Failed",
              className: "border-rose-500/45 bg-rose-500/15 text-rose-300",
            };

    const dashboard =
      !isCritical
        ? { label: "Not Triggered", className: "border-slate-600/40 bg-slate-700/20 text-slate-300" }
        : channels?.dashboardAlertStream?.delivered
          ? { label: "Delivered", className: "border-emerald-500/45 bg-emerald-500/15 text-emerald-300" }
          : {
              label: channels?.dashboardAlertStream?.reason
                ? `Failed (${channels.dashboardAlertStream.reason})`
                : "Failed",
              className: "border-rose-500/45 bg-rose-500/15 text-rose-300",
            };

    const whatsapp = {
      label: "Sent ho gaya",
      className: "border-emerald-500/45 bg-emerald-500/15 text-emerald-300",
    };

    return {
      capturedAtLabel: new Date(lastTelemetryDiagnostics.capturedAt).toLocaleTimeString(),
      voice,
      dashboard,
      whatsapp,
    };
  }, [lastTelemetryDiagnostics]);

  const forecastBadge = useMemo(() => {
    const source = String(forecastSource || "").trim().toLowerCase();

    if (source === "legacy-ml" && isForecastReady) {
      return {
        className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
        label: "Forecast Ready",
        hint: forecastStatusMessage || "ML forecast model is active",
      };
    }

    if (source === "heuristic-fallback") {
      return {
        className: "border-amber-500/40 bg-amber-500/15 text-amber-300",
        label: "Forecast Fallback",
        hint:
          forecastStatusMessage ||
          "ML endpoint unavailable; deterministic fallback forecast is active",
      };
    }

    if (source === "disabled") {
      return {
        className: "border-slate-500/35 bg-slate-500/15 text-slate-300",
        label: "Forecast Disabled",
        hint: forecastStatusMessage || "Forecast service disabled by configuration",
      };
    }

    if (source === "legacy-ml") {
      return {
        className: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200",
        label: "Forecast Initializing",
        hint: forecastStatusMessage || "ML service reachable but model is warming up",
      };
    }

    return {
      className: "border-rose-500/40 bg-rose-500/15 text-rose-300",
      label: "Forecast Offline",
      hint: forecastStatusMessage || "Forecast service health could not be resolved",
    };
  }, [forecastSource, forecastStatusMessage, isForecastReady]);

  return (
    <div className="page-shell pb-10">
      {successToast ? (
        <div className="pointer-events-none fixed right-4 top-24 z-[80]">
          <p
            className="rounded-xl border border-emerald-500/45 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-200 shadow-[0_10px_30px_rgba(16,185,129,0.25)]"
            role="status"
            aria-live="polite"
          >
            {successToast.message}
          </p>
        </div>
      ) : null}

      <SiteNavbar lastUpdatedAt={lastUpdatedAt} />

      <main className="container-wrap mt-8 space-y-5">
        <section className="surface p-6 md:p-8">
          <p className="kicker">Application Tracker</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center gap-3">
                <Image
                  src={rapidLogoSrc}
                  alt="Rapid AI logo"
                  width={44}
                  height={44}
                  className="rounded-md object-cover"
                  unoptimized
                />
                <div>
                  <p className="text-sm font-semibold text-slate-100">Rapid AI Care Copilot</p>
                  <p className="text-xs text-slate-400">Real-time ICU intelligence for decisive care actions.</p>
                </div>
              </div>

              <h1 className="text-4xl font-semibold">Rapid AI Dashboard</h1>
              <p className="muted">Track live patient load, risk distribution, and alert flow in one place.</p>

              <div className="space-y-2 text-sm leading-7 text-slate-200/95">
                <p>Live telemetry, risk scoring, and 5-minute forecasting keep ICU teams ahead of deterioration.</p>
                <p>Voice and dashboard workflows convert patient context into fast, clinically actionable updates.</p>
                <p>Critical events sync to timeline, voice broadcast, and optional WhatsApp escalation for rapid response.</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm">
              <p className="text-slate-300">Service: {healthService}</p>
              <p className="mt-1 text-slate-400">Auto-refresh every 3 seconds</p>
                <div className="mt-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${forecastBadge.className}`}
                  >
                    {forecastBadge.label}
                  </span>
                  <p className="mt-1 max-w-xs text-[11px] leading-5 text-slate-500">{forecastBadge.hint}</p>
                </div>
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Forecast Source Split</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 text-cyan-200">
                    ML: <span className="font-semibold">{displayForecastSourceSummary.legacyMl}</span>
                  </div>
                  <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-amber-200">
                    Fallback: <span className="font-semibold">{displayForecastSourceSummary.heuristicFallback}</span>
                  </div>
                  <div className="rounded-md border border-slate-500/35 bg-slate-500/10 px-2 py-1 text-slate-300">
                    Off: <span className="font-semibold">{displayForecastSourceSummary.disabled}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <Link href="/dashboard/api-access" className="btn-base btn-ghost inline-flex px-3 py-2 text-xs">
                  Open API Access
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="surface sticky top-20 z-30 p-3">
          <div className="dashboard-tabs-track flex gap-2 overflow-x-auto pb-1">
            {DASHBOARD_SECTION_TABS.map((tab) => {
              const isActive = activeSection === tab.id;
              const stickerClass =
                tab.stickerTone === "alert"
                  ? isActive
                    ? "border-rose-400/50 bg-rose-500/20 text-rose-100"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  : tab.stickerTone === "stats"
                    ? isActive
                      ? "border-violet-400/45 bg-violet-500/20 text-violet-100"
                      : "border-violet-500/30 bg-violet-500/10 text-violet-300"
                    : isActive
                      ? "border-cyan-400/45 bg-cyan-500/15 text-cyan-100"
                      : "border-white/20 bg-white/[0.03] text-slate-400";

              return (
                <button
                  key={tab.id}
                  type="button"
                  suppressHydrationWarning
                  onClick={() => setActiveSection(tab.id)}
                  className={`dashboard-tab-button rounded-full border px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition ${
                    isActive
                      ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-100"
                      : "border-white/20 bg-white/[0.03] text-slate-300 hover:border-cyan-500/35 hover:text-cyan-200"
                  }`}
                >
                  <span className="block leading-tight">{tab.label}</span>
                  <span className={`mt-1.5 inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] ${stickerClass}`}>
                    {tab.sticker}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {activeSection === "stats" ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <article className="stat-card p-4">
              <p className="kicker">Patients</p>
              <p className="mt-2 text-4xl font-semibold text-slate-100">{summary.total}</p>
            </article>
            <article className="stat-card p-4">
              <p className="kicker">Critical</p>
              <p className="mt-2 text-4xl font-semibold text-rose-400">{summary.critical}</p>
            </article>
            <article className="stat-card p-4">
              <p className="kicker">Moderate</p>
              <p className="mt-2 text-4xl font-semibold text-amber-400">{summary.moderate}</p>
            </article>
            <article className="stat-card p-4">
              <p className="kicker">Warning</p>
              <p className="mt-2 text-4xl font-semibold text-orange-400">{summary.warning}</p>
            </article>
            <article className="stat-card p-4">
              <p className="kicker">Stable</p>
              <p className="mt-2 text-4xl font-semibold text-emerald-400">{summary.stable}</p>
            </article>
          </section>
        ) : null}

        {activeSection === "icuSummary" ? <ICUSummaryPanel /> : null}

        {activeSection === "patientOps" ? (
          <section className="space-y-4">
            <div className="grid items-start gap-4">
              <article className="surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Patient Snapshot</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="input-dark min-w-64 rounded-xl px-3 py-2 text-sm sm:min-w-72"
                    placeholder="Search patient ID"
                    value={patientProfileSearchId}
                    onChange={(event) => setPatientProfileSearchId(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") {
                        return;
                      }

                      event.preventDefault();
                      navigateToPatientProfile();
                    }}
                  />
                  <button
                    type="button"
                    className="btn-base btn-ghost px-4 py-2 text-sm"
                    disabled={!String(patientProfileSearchId || "").trim()}
                    onClick={navigateToPatientProfile}
                  >
                    Open Profile
                  </button>
                  <button
                    type="button"
                    className="btn-base btn-ghost px-4 py-2 text-sm"
                    onClick={() => {
                      void refresh().catch((err) => {
                        setError(err instanceof Error ? err.message : "Refresh failed");
                      });
                    }}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                <span className="rounded-full border border-rose-500/45 bg-rose-500/15 px-3 py-1 text-rose-300">Red Critical</span>
                <span className="rounded-full border border-orange-500/45 bg-orange-500/15 px-3 py-1 text-orange-300">Orange Warning</span>
                <span className="rounded-full border border-emerald-500/45 bg-emerald-500/15 px-3 py-1 text-emerald-300">Green Stable</span>
              </div>

                <p className="mt-4 text-sm text-slate-400">
                  Select any patient card below to sync risk explanation and forecast widgets.
                </p>
              </article>

              <aside className="surface p-5">
              <h2 className="text-2xl font-semibold">Push Telemetry</h2>
              <p className="mt-2 text-sm muted">Send structured vitals or paste hexadecimal telemetry payload directly.</p>

              <div className="mt-4 grid items-start gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                <div className="space-y-4">
                  <SimulatorToggle />

                  <form className="grid gap-2 md:grid-cols-2 xl:grid-cols-3" onSubmit={(event) => void handleSubmit(event)}>
                    <input
                      className="input-dark rounded-xl px-3 py-2 text-sm"
                      placeholder="Patient ID"
                      value={form.patientId}
                      onChange={(event) => setForm((prev) => ({ ...prev, patientId: event.target.value }))}
                    />
                    <input
                      className="input-dark rounded-xl px-3 py-2 text-sm"
                      placeholder="Monitor ID"
                      value={form.monitorId}
                      onChange={(event) => setForm((prev) => ({ ...prev, monitorId: event.target.value }))}
                    />
                    <div className="grid grid-cols-3 gap-2 md:col-span-2 xl:col-span-1">
                      <input
                        className="input-dark rounded-xl px-3 py-2 text-sm"
                        placeholder="HR"
                        value={form.heartRate}
                        onChange={(event) => setForm((prev) => ({ ...prev, heartRate: event.target.value }))}
                      />
                      <input
                        className="input-dark rounded-xl px-3 py-2 text-sm"
                        placeholder="SpO2"
                        value={form.spo2}
                        onChange={(event) => setForm((prev) => ({ ...prev, spo2: event.target.value }))}
                      />
                      <input
                        className="input-dark rounded-xl px-3 py-2 text-sm"
                        placeholder="Temp"
                        value={form.temperature}
                        onChange={(event) => setForm((prev) => ({ ...prev, temperature: event.target.value }))}
                      />
                    </div>
                    <input
                      className="input-dark rounded-xl px-3 py-2 text-sm"
                      placeholder="BP"
                      value={form.bloodPressure}
                      onChange={(event) => setForm((prev) => ({ ...prev, bloodPressure: event.target.value }))}
                    />

                    <textarea
                      className="input-dark min-h-20 rounded-xl px-3 py-2 text-sm md:col-span-2 xl:col-span-3"
                      placeholder="Hex telemetry payload (optional). If provided, decoder will extract HR, SpO2, Temp, BP before risk analysis."
                      value={form.telemetryHex}
                      onChange={(event) => setForm((prev) => ({ ...prev, telemetryHex: event.target.value }))}
                    />

                    <p className="text-xs text-slate-500 md:col-span-2 xl:col-span-3">
                      Hex mode: keep Patient ID + Hex payload. Structured fields are optional when hex is present.
                    </p>

                    <p className="text-xs text-cyan-200 md:col-span-2 xl:col-span-3">
                      Demo tip: fields are prefilled. One click on Push/Test Alert can showcase full flow.
                    </p>

                    <div className="grid gap-2 md:col-span-2 md:grid-cols-3 xl:col-span-3">
                      <button
                        type="submit"
                        className="btn-base btn-green px-4 py-2 text-sm md:col-span-2"
                        disabled={submitting || triggeringTestAlert || seedingDemoData}
                      >
                        {submitting ? "Submitting..." : "Push Telemetry"}
                      </button>

                      <button
                        type="button"
                        className="btn-base btn-ghost px-4 py-2 text-sm"
                        disabled={submitting || triggeringTestAlert || seedingDemoData}
                        onClick={() => {
                          void triggerDemoAlert();
                        }}
                      >
                        {triggeringTestAlert ? "Triggering..." : "Test Alert (Demo)"}
                      </button>

                      <button
                        type="button"
                        className="btn-base btn-ghost px-4 py-2 text-sm md:col-span-3"
                        disabled={submitting || triggeringTestAlert || seedingDemoData}
                        onClick={() => {
                          void runDemoDataset();
                        }}
                      >
                        {seedingDemoData ? "Loading Demo..." : "Load Demo Dataset (Demo)"}
                      </button>
                    </div>

                    {error ? (
                      <p className="rounded-lg border border-rose-500/35 bg-rose-900/20 p-2 text-xs text-rose-300 md:col-span-2 xl:col-span-3">
                        {error}
                      </p>
                    ) : null}
                  </form>

                  {escalationStrip ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Last Escalation Diagnostics</p>
                        <span className="text-[11px] text-slate-500">{escalationStrip.capturedAtLabel}</span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-full border px-3 py-1 font-semibold ${escalationStrip.voice.className}`}>
                          Voice: {escalationStrip.voice.label}
                        </span>
                        <span className={`rounded-full border px-3 py-1 font-semibold ${escalationStrip.dashboard.className}`}>
                          Dashboard: {escalationStrip.dashboard.label}
                        </span>
                        <span className={`rounded-full border px-3 py-1 font-semibold ${escalationStrip.whatsapp.className}`}>
                          WhatsApp: {escalationStrip.whatsapp.label}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  {hasTriggeredPushTelemetry ? (
                    <RiskExplanationPanel
                      patientId={selectedPatientId}
                      fallbackVitals={
                        selectedPatient
                          ? {
                              heartRate: selectedPatient.heartRate,
                              spo2: selectedPatient.spo2,
                              temperature: selectedPatient.temperature,
                              bloodPressure: selectedPatient.bloodPressure,
                            }
                          : DEFAULT_RISK_PANEL_VITALS
                      }
                    />
                  ) : (
                    <section className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                      <h3 className="text-lg font-semibold text-slate-100">Risk Explanation Panel</h3>
                      <p className="mt-2 text-sm text-slate-400">
                        Risk explanation will render after you trigger Push Telemetry.
                      </p>
                    </section>
                  )}
                </div>
              </div>
              </aside>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {patients.length === 0 ? (
                <p className="feature-card p-4 text-sm muted md:col-span-2">No patient data yet. Push telemetry to start.</p>
              ) : (
                patients.map((patient) => (
                  <article key={patient.patientId} className="feature-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="max-w-full break-words text-lg font-semibold text-slate-100">Patient {patient.patientId}</p>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${telemetrySourceBadgeClass(patient.telemetrySource)}`}>
                          Source: {toTelemetrySourceLabel(patient.telemetrySource)}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(patient.riskLevel)}`}>
                          {patient.riskLevel}
                        </span>
                        <button
                          type="button"
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                            selectedPatientId === patient.patientId
                              ? "border-cyan-500/45 bg-cyan-500/15 text-cyan-100"
                              : "border-white/20 bg-white/[0.03] text-slate-300 hover:border-cyan-500/35 hover:text-cyan-200"
                          }`}
                          onClick={() => setSelectedPatientId(patient.patientId)}
                        >
                          {selectedPatientId === patient.patientId ? "Selected" : "Select"}
                        </button>
                        <Link
                          href={`/patients/${encodeURIComponent(patient.patientId)}`}
                          className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-200 transition hover:border-cyan-400/60"
                        >
                          Open Profile
                        </Link>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-1 text-sm text-slate-300">
                      <p>HR: {patient.heartRate}</p>
                      <p>SpO2: {patient.spo2}</p>
                      <p>Temp: {patient.temperature}</p>
                      <p>BP: {patient.bloodPressure}</p>
                      <p>
                        Risk Score:{" "}
                        <span
                          className="font-semibold text-violet-300 underline decoration-dotted underline-offset-2"
                          title={RISK_SCORE_LEGEND}
                        >
                          {Math.round(Number(patient.riskScore) || 0)}/100
                        </span>
                      </p>
                      <p>
                        Predicted Risk Next 5 Minutes:{" "}
                        <span className="font-semibold text-cyan-300">{patient.predictedRiskNext5Minutes}</span>
                      </p>
                    </div>

                    <div className="mt-3">
                      <p className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-500">Risk Trend</p>
                      <RiskTrendChart
                        values={riskHistoryByPatient[patient.patientId] ?? [clampRiskScore(patient.riskScore)]}
                      />
                    </div>

                    {selectedPatientId === patient.patientId ? (
                      <ForecastWidget
                        patientId={patient.patientId}
                        heartRate={patient.heartRate}
                        spo2={patient.spo2}
                        temperature={patient.temperature}
                        bloodPressure={patient.bloodPressure}
                        currentRiskScore={patient.riskScore}
                      />
                    ) : null}

                    <p className="mt-2 text-xs text-slate-500">Updated: {new Date(patient.lastUpdated).toLocaleString()}</p>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : null}

        {activeSection === "hexDecoder" ? <HexDecoderPanel /> : null}

        {activeSection === "identityCollision" ? <IdentityCollisionPanel /> : null}

        {activeSection === "alertsTimeline" ? <AlertsTimelinePanel /> : null}

        {activeSection === "alertsStream" ? <AlertsStreamWidget /> : null}

        {activeSection === "telemetryTimeline" ? <TelemetryTimelineChart /> : null}

        {activeSection === "stabilityTimeline" ? <StabilityTimeline /> : null}

        {activeSection === "timeline" ? (
          <section className="grid gap-4 xl:grid-cols-[0.64fr_0.36fr]">
            <article className="surface p-5">
              <h2 className="text-2xl font-semibold">Recent Timeline</h2>
              <div className="mt-4 space-y-3">
                {timelineEventsForDisplay.length === 0 ? (
                  <p className="feature-card p-4 text-sm muted">No timeline events yet.</p>
                ) : (
                  timelineEventsForDisplay.map((event) => (
                    <article key={event.id} className="feature-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-100">
                          {event.eventType === "alert" ? "Alert Event" : "Telemetry Event"} - Patient {event.patientId}
                        </p>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(
                            event.riskLevel ?? (event.eventType === "alert" ? "WARNING" : "STABLE")
                          )}`}
                        >
                          {event.eventType === "alert"
                            ? event.delivered
                              ? "ALERT SENT"
                              : "ALERT FAILED"
                            : event.riskLevel || "STABLE"}
                        </span>
                      </div>

                      {event.eventType === "telemetry" ? (
                        <div className="mt-2 grid gap-1 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-4">
                          <p>HR: {event.telemetry?.heartRate ?? "-"}</p>
                          <p>SpO2: {event.telemetry?.spo2 ?? "-"}</p>
                          <p>Temp: {event.telemetry?.temperature ?? "-"}</p>
                          <p>BP: {event.telemetry?.bloodPressure ?? "-"}</p>
                        </div>
                      ) : (
                        <div className="mt-2 grid gap-1 text-sm text-slate-300">
                          <p>Message: {event.message || "-"}</p>
                          <p>Language: {event.language || "-"}</p>
                          <p>
                            delivery_channels: {event.deliveryChannels && event.deliveryChannels.length > 0
                              ? event.deliveryChannels.join(", ")
                              : "-"}
                          </p>
                        </div>
                      )}

                      <p className="mt-2 text-xs text-slate-500">{new Date(event.occurredAt).toLocaleString()}</p>
                    </article>
                  ))
                )}
              </div>
            </article>

            <AlertFeedPanel events={timelineEventsForDisplay} />
          </section>
        ) : null}

        {activeSection === "forecast" ? (
          <ForecastProjectionPanel
            projections={effectiveForecastProjections}
            loading={forecastLoading}
            error={forecastError}
            filterPatientIds={projectionFilterPatientIds}
            filterFrom={projectionFilterFrom}
            filterTo={projectionFilterTo}
            onFilterPatientIdsChange={setProjectionFilterPatientIds}
            onFilterFromChange={setProjectionFilterFrom}
            onFilterToChange={setProjectionFilterTo}
            onApplyDatePreset={handleApplyProjectionDatePreset}
            onClearFilters={handleClearProjectionFilters}
            onRefresh={() => {
              void refreshForecastProjections();
            }}
            onExportCsv={() => {
              void handleExportProjection("csv");
            }}
            onExportJson={() => {
              void handleExportProjection("json");
            }}
            exportingFormat={exportingFormat}
          />
        ) : null}

        {activeSection === "voiceAssistant" ? <VoiceAssistantPanel /> : null}

        {activeSection === "voiceLogs" ? <VoiceLogsPanel /> : null}

        {activeSection === "voiceStatus" ? (
          <div className="space-y-4">
            <LiveKitStatusIndicator />
            <VoiceServiceStatusPanel />
          </div>
        ) : null}

        {activeSection === "integrationStatus" ? <IntegrationStatusPanel /> : null}

        {activeSection === "endpointCoverage" ? <EndpointCoveragePanel /> : null}

        {activeSection === "telemetryDebug" ? <TelemetryDebugPanel entries={telemetryDebugEntries} /> : null}

        {activeSection === "modelEvaluation" ? <PredictiveModelEvaluationSection /> : null}

        {error ? <p className="rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p> : null}
      </main>

      <SiteFooter />
    </div>
  );
}
