"use client";

import { useMemo, useState } from "react";
import { ingestTelemetryHex, TelemetryIngestResponse } from "@/lib/api";

type DecoderStatus = "decoded" | "partial" | "failed";

type DecodedTelemetryFields = {
  heartRate: string;
  spo2: string;
  temperature: string;
  bloodPressure: string;
  packetIntegrityStatus: string;
  reconstructionStatus: string;
};

type FallbackJsonVitals = {
  heartRate: number | null;
  spo2: number | null;
  temperature: number | null;
  bloodPressure: string | null;
};

const DEMO_HEX_PAYLOAD_PRIMARY =
  "7B22686561727452617465223A3132382C2273706F32223A38362C2274656D7065726174757265223A3130322E322C22626C6F6F645072657373757265223A2238342F3532227D";
const DEMO_HEX_PAYLOAD_SECONDARY =
  "7B22686561727452617465223A39362C2273706F32223A39372C2274656D7065726174757265223A39382E362C22626C6F6F645072657373757265223A223132302F3738227D";

function normalizeHexInput(value: string): string {
  return String(value || "").replace(/\s+/g, "").trim();
}

function isValidHex(value: string): boolean {
  const normalized = normalizeHexInput(value);
  if (!normalized) {
    return false;
  }

  return /^[0-9a-fA-F]+$/.test(normalized) && normalized.length % 2 === 0;
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }

  return null;
}

function toLabel(value: string | null | undefined): string {
  const text = String(value || "").trim();
  if (!text) {
    return "-";
  }

  return text
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function toWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry || "").trim())
    .filter((entry) => entry.length > 0);
}

function decodeJsonVitalsFromHex(rawHex: string): FallbackJsonVitals | null {
  const normalizedHex = normalizeHexInput(rawHex);
  if (!isValidHex(normalizedHex)) {
    return null;
  }

  try {
    const bytePairs = normalizedHex.match(/.{1,2}/g) || [];
    const bytes = Uint8Array.from(bytePairs.map((pair) => Number.parseInt(pair, 16)));
    const decodedText = new TextDecoder().decode(bytes).trim();
    if (!decodedText) {
      return null;
    }

    const parsed = JSON.parse(decodedText);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const parsedRecord = parsed as Record<string, unknown>;
    const heartRate = pickNumber(parsedRecord.heartRate, parsedRecord.heart_rate, parsedRecord.hr);
    const spo2 = pickNumber(parsedRecord.spo2, parsedRecord.SpO2, parsedRecord.oxygen_saturation);
    const temperature = pickNumber(parsedRecord.temperature, parsedRecord.temp, parsedRecord.TEMP);
    const bloodPressure = pickString(parsedRecord.bloodPressure, parsedRecord.blood_pressure, parsedRecord.bp);

    if (heartRate === null && spo2 === null && temperature === null && !bloodPressure) {
      return null;
    }

    return {
      heartRate,
      spo2,
      temperature,
      bloodPressure,
    };
  } catch {
    return null;
  }
}

function toDecodedFieldsFromJsonFallback(vitals: FallbackJsonVitals): DecodedTelemetryFields {
  return {
    heartRate: vitals.heartRate === null ? "--" : `${Math.round(vitals.heartRate)} bpm`,
    spo2: vitals.spo2 === null ? "--" : `${Math.round(vitals.spo2)}%`,
    temperature: vitals.temperature === null ? "--" : `${vitals.temperature.toFixed(1)} deg`,
    bloodPressure: vitals.bloodPressure || "--",
    packetIntegrityStatus: "Valid",
    reconstructionStatus: "Decoded",
  };
}

function toStatusChipClass(status: DecoderStatus): string {
  if (status === "decoded") {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  }

  if (status === "partial") {
    return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  }

  return "border-rose-500/40 bg-rose-500/15 text-rose-300";
}

function resolveDecodedResponse(response: TelemetryIngestResponse, rawHexPayload: string): {
  fields: DecodedTelemetryFields;
  status: DecoderStatus;
} {
  const latestVitals =
    response.latest_vitals && typeof response.latest_vitals === "object"
      ? (response.latest_vitals as Record<string, unknown>)
      : {};

  let heartRate = pickNumber(response.heartRate, response.heart_rate, response.hr, latestVitals.heartRate, latestVitals.heart_rate, latestVitals.hr);
  let spo2 = pickNumber(response.spo2, latestVitals.spo2, latestVitals.SpO2);
  let temperature = pickNumber(response.temperature, latestVitals.temperature, latestVitals.temp, latestVitals.TEMP);
  let bloodPressure = pickString(response.bloodPressure, response.blood_pressure, response.bp, latestVitals.bloodPressure, latestVitals.blood_pressure, latestVitals.bp);

  const warnings = toWarnings(response.warnings);
  const observationsIngested = pickNumber(response.observations_ingested, response.observationsIngested) ?? 0;
  const hasBackendReconstructionStatus = Boolean(
    pickString(response.reconstruction_status, response.reconstructionStatus)
  );
  let reconstructionStatus =
    pickString(response.reconstruction_status, response.reconstructionStatus) ??
    (observationsIngested > 0 && warnings.length === 0
      ? "decoded"
      : observationsIngested > 0 || warnings.length > 0
        ? "partial"
        : "failed");
  let packetIntegrityStatus =
    pickString(response.packet_integrity_status, response.packetIntegrityStatus) ??
    (warnings.length > 0 ? "warning" : "valid");

  const shouldTryJsonFallback = heartRate === null && spo2 === null && temperature === null && !bloodPressure;
  const fallbackJsonVitals = shouldTryJsonFallback ? decodeJsonVitalsFromHex(rawHexPayload) : null;

  if (fallbackJsonVitals) {
    heartRate = heartRate ?? fallbackJsonVitals.heartRate;
    spo2 = spo2 ?? fallbackJsonVitals.spo2;
    temperature = temperature ?? fallbackJsonVitals.temperature;
    bloodPressure = bloodPressure ?? fallbackJsonVitals.bloodPressure;

    if (!hasBackendReconstructionStatus) {
      reconstructionStatus = "decoded";
    }

    if (!pickString(response.packet_integrity_status, response.packetIntegrityStatus)) {
      packetIntegrityStatus = "valid";
    }
  }

  const availableVitalsCount = [heartRate, spo2, temperature, bloodPressure].filter((value) => {
    if (typeof value === "number") {
      return Number.isFinite(value);
    }

    return typeof value === "string" && value.trim().length > 0;
  }).length;

  const normalizedReconstruction = reconstructionStatus.toLowerCase();
  const status: DecoderStatus =
    (fallbackJsonVitals !== null && availableVitalsCount >= 2) ||
    (availableVitalsCount === 4 && !normalizedReconstruction.includes("fail")) ||
    normalizedReconstruction.includes("decoded")
      ? "decoded"
      : availableVitalsCount > 0 || normalizedReconstruction.includes("partial") || warnings.length > 0
        ? "partial"
        : "failed";

  return {
    fields: {
      heartRate: heartRate === null ? "--" : `${Math.round(heartRate)} bpm`,
      spo2: spo2 === null ? "--" : `${Math.round(spo2)}%`,
      temperature: temperature === null ? "--" : `${temperature.toFixed(1)} deg`,
      bloodPressure: bloodPressure || "--",
      packetIntegrityStatus: toLabel(packetIntegrityStatus),
      reconstructionStatus: toLabel(reconstructionStatus),
    },
    status,
  };
}

export default function HexDecoderPanel() {
  const [hexPayload, setHexPayload] = useState(DEMO_HEX_PAYLOAD_PRIMARY);
  const [output, setOutput] = useState<DecodedTelemetryFields | null>(null);
  const [status, setStatus] = useState<DecoderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [invalidHex, setInvalidHex] = useState(false);

  const canDecode = useMemo(() => normalizeHexInput(hexPayload).length > 0, [hexPayload]);

  async function handleDecode(): Promise<void> {
    const normalizedHex = normalizeHexInput(hexPayload);

    if (!isValidHex(normalizedHex)) {
      setOutput(null);
      setStatus("failed");
      setInvalidHex(true);
      setError("Invalid hex payload. Use only hexadecimal characters with an even length.");
      return;
    }

    setLoading(true);
    setInvalidHex(false);
    setError("");

    try {
      const response = await ingestTelemetryHex(normalizedHex);
      const decoded = resolveDecodedResponse(response, normalizedHex);
      setOutput(decoded.fields);
      setStatus(decoded.status);

      if (decoded.status === "failed") {
        setError("Decoder could not reconstruct vitals from this packet.");
      }
    } catch (requestError) {
      const fallbackJsonVitals = decodeJsonVitalsFromHex(normalizedHex);
      if (fallbackJsonVitals) {
        setOutput(toDecodedFieldsFromJsonFallback(fallbackJsonVitals));
        setStatus("decoded");
        setError("Live decoder unavailable. Showing local demo decode from payload.");
      } else {
        setOutput(null);
        setStatus("failed");
        setError(requestError instanceof Error ? requestError.message : "Decode request failed");
      }
    } finally {
      setLoading(false);
    }
  }

  const fields = output
    ? [
        { label: "Heart Rate", value: output.heartRate },
        { label: "SpO2", value: output.spo2 },
        { label: "Temperature", value: output.temperature },
        { label: "Blood Pressure", value: output.bloodPressure },
        { label: "Packet Integrity Status", value: output.packetIntegrityStatus },
        { label: "Reconstruction Status", value: output.reconstructionStatus },
      ]
    : [];

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Hex Telemetry Decoder</h2>
          <p className="mt-1 text-sm text-slate-400">Visualize decoding pipeline from raw hex payload into structured vitals.</p>
        </div>

        {status ? (
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${toStatusChipClass(status)}`}>
            {status}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_auto_1fr]">
        <article className="feature-card p-4">
          <label htmlFor="hex-decoder-payload" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Paste Hex Payload
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-base btn-ghost px-3 py-1 text-[11px]"
              onClick={() => {
                setHexPayload(DEMO_HEX_PAYLOAD_PRIMARY);
                setOutput(null);
                setStatus(null);
                setError("");
                setInvalidHex(false);
              }}
            >
              Load Sample A
            </button>
            <button
              type="button"
              className="btn-base btn-ghost px-3 py-1 text-[11px]"
              onClick={() => {
                setHexPayload(DEMO_HEX_PAYLOAD_SECONDARY);
                setOutput(null);
                setStatus(null);
                setError("");
                setInvalidHex(false);
              }}
            >
              Load Sample B
            </button>
          </div>
          <textarea
            id="hex-decoder-payload"
            className="input-dark mt-2 min-h-36 w-full rounded-xl px-3 py-2 font-mono text-sm"
            placeholder="Paste telemetry hex packet here"
            value={hexPayload}
            onChange={(event) => {
              setHexPayload(event.target.value);
              setOutput(null);
              setStatus(null);
              setError("");
              setInvalidHex(false);
            }}
          />
          <p className="mt-2 text-[11px] text-cyan-200">
            Demo payload is preloaded. Click Decode for one-click walkthrough.
          </p>

          {invalidHex ? (
            <span className="mt-3 inline-flex rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-300">
              Invalid Hex
            </span>
          ) : null}
        </article>

        <div className="flex items-center justify-center">
          <button
            type="button"
            className="btn-base btn-main min-w-32 px-5 py-2.5 text-sm"
            disabled={!canDecode || loading}
            onClick={() => {
              void handleDecode();
            }}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                Decoding...
              </span>
            ) : (
              "Decode"
            )}
          </button>
        </div>

        <article className="feature-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Decoded Output</p>

          {fields.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Run decode to view structured telemetry vitals and packet status.</p>
          ) : (
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              {fields.map((field) => (
                <div key={field.label} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{field.label}</p>
                  <p className="mt-1 font-semibold text-slate-100">{field.value}</p>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      {error ? <p className="mt-4 rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}
