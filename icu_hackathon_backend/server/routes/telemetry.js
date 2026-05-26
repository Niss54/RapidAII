const express = require("express");
const { analyzeRisk } = require("../services/riskAnalyzer");
const { resolveTelemetryPayload, validateResolvedVitals } = require("../services/telemetryDecoder");
const { resolveIdentity } = require("../services/identityResolver");
const { predictRiskNextFiveMinutes } = require("../services/forecastService");
const Patient = require("../models/Patient");
const { logTelemetryEvent } = require("../models/EventLog");
const { dispatchCriticalEscalation } = require("../services/escalationDispatcher");
const { logIngestionError } = require("../services/ingestionLogger");

const router = express.Router();

function resolveRequestApiKey(req) {
  const header = req?.headers?.["x-api-key"];
  return Array.isArray(header)
    ? String(header[0] || "").trim()
    : String(header || "").trim();
}

function resolveTelemetrySource(telemetry) {
  const sourceHint = String(telemetry?.sourceHint || "").trim().toLowerCase();
  const monitorId = String(telemetry?.monitorId || "").trim().toLowerCase();

  if (sourceHint.includes("hl7") || monitorId.includes("hl7")) {
    return "hl7";
  }

  if (
    sourceHint.includes("serial") ||
    monitorId.includes("serial") ||
    monitorId.includes("com") ||
    monitorId.includes("tty")
  ) {
    return "serial";
  }

  if (
    sourceHint.includes("simulator") ||
    sourceHint === "sim" ||
    monitorId.startsWith("sim-") ||
    monitorId.includes("simulator")
  ) {
    return "simulator";
  }

  return "";
}

router.post("/update", async (req, res) => {
  try {
    const telemetry = resolveTelemetryPayload(req.body || {});
    const { valid, missing } = validateResolvedVitals(telemetry);

    if (!valid) {
      logIngestionError("telemetry", "validation", "Invalid telemetry payload", {
        missing,
        monitorId: telemetry.monitorId,
        sourceHint: telemetry.sourceHint,
      });

      return res.status(400).json({
        error:
          "Telemetry payload is missing decodable vitals. Provide structured vitals or a valid hexadecimal telemetry payload.",
        missing,
        decoderWarnings: telemetry.decoderWarnings,
      });
    }

    const { heartRate, spo2, temperature, bloodPressure } = telemetry;
    const identity = resolveIdentity({
      patientId: telemetry.patientId,
      monitorId: telemetry.monitorId,
      source: telemetry.sourceHint,
      bedId: telemetry.bedId,
      heartRate,
      spo2,
      temperature,
      bloodPressure,
    });
    const patientId = identity.patientId;

    const forecast = await predictRiskNextFiveMinutes(
      {
        heartRate,
        spo2,
        temperature,
        bloodPressure,
      },
      {
        apiKey: resolveRequestApiKey(req),
      }
    );
    const telemetrySource = resolveTelemetrySource(telemetry);

    const risk = analyzeRisk({ patientId, heartRate, spo2, temperature, bloodPressure });
    const patient = await Patient.upsertPatient({
      patientId,
      heartRate,
      spo2,
      temperature,
      bloodPressure,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      predictedRiskNext5Minutes: forecast.predictedRiskLevel,
      telemetrySource,
    });

    await logTelemetryEvent({
      patientId,
      heartRate,
      spo2,
      temperature,
      bloodPressure,
      riskLevel: risk.riskLevel,
      reason: risk.reason,
    });

    let alert = null;
    let escalationChannels = null;
    const isDashboardTelemetry = String(telemetry.sourceHint || "").trim().toLowerCase() === "dashboard";

    if (risk.riskLevel === "CRITICAL" && !isDashboardTelemetry) {
      const escalation = await dispatchCriticalEscalation({
        alertEvent: {
          patientId,
          alertType: "critical-alert",
          riskScore: risk.riskScore,
          reason: risk.reason,
          timestamp: new Date().toISOString(),
          vitals: {
            heartRate,
            spo2,
            temperature,
            bloodPressure,
          },
        },
      });

      alert = escalation.alert;
      escalationChannels = escalation.channels;
    }

    return res.status(200).json({
      patient,
      risk,
      alert,
      escalationChannels,
      decodedVitals: {
        heartRate,
        spo2,
        temperature,
        bloodPressure,
        monitorId: telemetry.monitorId || identity.monitorKey,
        source: telemetry.source,
      },
      decoderWarnings: telemetry.decoderWarnings,
      identityResolution: identity,
      forecast: {
        predictedRiskNext5Minutes: forecast.predictedRiskLevel,
        source: forecast.source,
        forecastedVitals: forecast.forecastedVitals,
        warning: forecast.warning,
      },
    });
  } catch (error) {
    logIngestionError("telemetry", "route", error, {
      monitorId: req?.body?.monitorId,
      patientId: req?.body?.patientId,
      source: req?.body?.source,
    });

    return res.status(500).json({
      error: error instanceof Error ? error.message : "Telemetry update failed",
    });
  }
});

module.exports = router;
