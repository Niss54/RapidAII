const PHYSIO_ID_MAP = {
  16770: "HR",
  18466: "HR",
  18949: "SBP",
  18950: "DBP",
  18951: "MAP",
  18963: "MAP",
  19272: "TEMP",
  19384: "SpO2",
  61669: "HR",
};

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRoundedNumber(value, digits = 0) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return null;
  }

  if (digits <= 0) {
    return Math.round(numeric);
  }

  return Number(numeric.toFixed(digits));
}

function hasDecodedVitalValue(value) {
  const numeric = toFiniteNumber(value);
  return numeric !== null && numeric > 0;
}

function normalizeBloodPressure(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!match) {
    return null;
  }

  return `${Number(match[1])}/${Number(match[2])}`;
}

function resolveBloodPressureValue(rawPayload) {
  const normalized =
    normalizeBloodPressure(
      rawPayload?.bloodPressure ??
        rawPayload?.blood_pressure ??
        rawPayload?.bp
    );
  if (normalized) {
    return normalized;
  }

  const systolic = toFiniteNumber(
    rawPayload?.systolic ?? rawPayload?.sbp ?? rawPayload?.SBP
  );
  const diastolic = toFiniteNumber(
    rawPayload?.diastolic ?? rawPayload?.dbp ?? rawPayload?.DBP
  );
  if (systolic === null || diastolic === null) {
    return null;
  }

  return `${Math.round(systolic)}/${Math.round(diastolic)}`;
}

function sanitizeHexPayload(rawValue) {
  const clean = String(rawValue || "").replace(/[^0-9a-fA-F]/g, "");
  if (!clean) {
    return "";
  }

  if (clean.length % 2 === 0) {
    return clean;
  }

  return clean.slice(0, -1);
}

function decodeIeee11073Float(packet, offset) {
  const exponent = packet.readInt8(offset);
  let mantissa = (packet[offset + 1] << 16) | (packet[offset + 2] << 8) | packet[offset + 3];

  if (mantissa & 0x800000) {
    mantissa -= 0x1000000;
  }

  return mantissa * Math.pow(10, exponent);
}

function decodeHexObservations(hexPayload) {
  const warnings = [];
  const normalizedHex = sanitizeHexPayload(hexPayload);

  if (!normalizedHex) {
    warnings.push("No hexadecimal telemetry payload was provided");
    return { observations: [], warnings };
  }

  if (normalizedHex.length < 12) {
    warnings.push("Hex payload too short for telemetry frame decoding");
    return { observations: [], warnings };
  }

  const packet = Buffer.from(normalizedHex, "hex");
  const observations = [];

  for (let offset = 0; offset <= packet.length - 6; offset += 6) {
    const physioId = packet.readUInt16BE(offset);
    const signal = PHYSIO_ID_MAP[physioId];

    if (!signal) {
      continue;
    }

    const value = decodeIeee11073Float(packet, offset + 2);
    observations.push({
      signal,
      value,
      sourceSignal: `physio_id_${physioId}`,
    });
  }

  if (observations.length === 0) {
    warnings.push("No supported vital-sign identifiers decoded from hex payload");
  }

  return { observations, warnings };
}

function decodeHexJsonVitals(hexPayload) {
  const normalizedHex = sanitizeHexPayload(hexPayload);
  if (!normalizedHex) {
    return null;
  }

  let decodedText = "";
  try {
    decodedText = Buffer.from(normalizedHex, "hex").toString("utf8").trim();
  } catch {
    return null;
  }

  if (!decodedText || !decodedText.startsWith("{")) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(decodedText);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const heartRate = toRoundedNumber(
    toFiniteNumber(
      parsed.heartRate ??
        parsed.heart_rate ??
        parsed.hr ??
        parsed.heartrate
    )
  );
  const spo2 = toRoundedNumber(
    toFiniteNumber(
      parsed.spo2 ??
        parsed.SpO2 ??
        parsed.spo_2 ??
        parsed.oxygenSaturation ??
        parsed.oxygen_saturation
    )
  );
  const temperature = toRoundedNumber(
    toFiniteNumber(
      parsed.temperature ??
        parsed.temp ??
        parsed.tempC ??
        parsed.temp_c ??
        parsed.bodyTemperature ??
        parsed.body_temperature
    ),
    1
  );
  const bloodPressure = resolveBloodPressureValue(parsed);

  if (
    heartRate === null &&
    spo2 === null &&
    temperature === null &&
    !bloodPressure
  ) {
    return null;
  }

  return {
    heartRate,
    spo2,
    temperature,
    bloodPressure,
    warning: "Decoded vitals from hex-encoded JSON payload",
  };
}

function vitalsFromObservations(observations) {
  let heartRate = null;
  let spo2 = null;
  let temperature = null;
  let systolic = null;
  let diastolic = null;
  let mapPressure = null;

  for (const observation of observations) {
    const signal = String(observation.signal || "").toUpperCase();
    const value = toFiniteNumber(observation.value);
    if (value === null) {
      continue;
    }

    if (signal === "HR") {
      heartRate = value;
    } else if (signal === "SPO2") {
      spo2 = value;
    } else if (signal === "TEMP") {
      temperature = value;
    } else if (signal === "SBP") {
      systolic = value;
    } else if (signal === "DBP") {
      diastolic = value;
    } else if (signal === "MAP") {
      mapPressure = value;
    }
  }

  if (systolic !== null && diastolic === null && mapPressure !== null) {
    const estimatedDiastolic = (3 * mapPressure - systolic) / 2;
    diastolic = toFiniteNumber(estimatedDiastolic);
  }

  const bloodPressure =
    systolic !== null && diastolic !== null
      ? `${Math.round(systolic)}/${Math.round(diastolic)}`
      : null;

  return {
    heartRate: toRoundedNumber(heartRate),
    spo2: toRoundedNumber(spo2),
    temperature: toRoundedNumber(temperature, 1),
    bloodPressure,
  };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return "";
}

function resolveTelemetryPayload(payload) {
  const body = payload && typeof payload === "object" ? payload : {};

  const patientId = String(body.patientId || body.patient_id || "").trim();
  const monitorId = firstNonEmpty(
    body.monitorId,
    body.monitor_id,
    body.monitor,
    body.deviceId,
    body.device_id,
    body.source,
    body.bedId,
    body.bed_id
  );
  const sourceHint = firstNonEmpty(body.source, body.streamId, body.stream_id, body.feed);
  const bedId = firstNonEmpty(body.bedId, body.bed_id, body.bed);
  const hexPayload = firstNonEmpty(
    body.hexPayload,
    body.hex_payload,
    body.telemetryHex,
    body.telemetry_hex,
    body.hex,
    body.payloadHex
  );

  let source = "json";
  let decoderWarnings = [];
  let decodedObservations = [];
  let decodedVitals = {
    heartRate: null,
    spo2: null,
    temperature: null,
    bloodPressure: null,
  };

  if (hexPayload) {
    source = "hex";
    const decoded = decodeHexObservations(hexPayload);
    decoderWarnings = decoded.warnings;
    decodedObservations = decoded.observations;
    decodedVitals = vitalsFromObservations(decodedObservations);

    const requiresJsonFallback =
      !hasDecodedVitalValue(decodedVitals.heartRate) ||
      !hasDecodedVitalValue(decodedVitals.spo2) ||
      !hasDecodedVitalValue(decodedVitals.temperature) ||
      !normalizeBloodPressure(decodedVitals.bloodPressure);

    if (requiresJsonFallback) {
      const fallbackVitals = decodeHexJsonVitals(hexPayload);
      if (fallbackVitals) {
        decodedVitals = {
          heartRate: hasDecodedVitalValue(decodedVitals.heartRate)
            ? decodedVitals.heartRate
            : fallbackVitals.heartRate,
          spo2: hasDecodedVitalValue(decodedVitals.spo2)
            ? decodedVitals.spo2
            : fallbackVitals.spo2,
          temperature: hasDecodedVitalValue(decodedVitals.temperature)
            ? decodedVitals.temperature
            : fallbackVitals.temperature,
          bloodPressure: decodedVitals.bloodPressure || fallbackVitals.bloodPressure,
        };

        decoderWarnings = decoderWarnings.filter((warning) => {
          const normalizedWarning = String(warning || "").trim().toLowerCase();
          return normalizedWarning !== "no supported vital-sign identifiers decoded from hex payload";
        });
        decoderWarnings.push(fallbackVitals.warning);
      }
    }
  }

  const fallbackBloodPressure = resolveBloodPressureValue(body);

  const resolved = {
    patientId,
    monitorId,
    sourceHint,
    bedId,
    heartRate: toFiniteNumber(decodedVitals.heartRate ?? body.heartRate),
    spo2: toFiniteNumber(decodedVitals.spo2 ?? body.spo2),
    temperature: toFiniteNumber(decodedVitals.temperature ?? body.temperature),
    bloodPressure: decodedVitals.bloodPressure || fallbackBloodPressure,
    source,
    decoderWarnings,
    decodedObservations,
    usedHexPayload: Boolean(hexPayload),
  };

  return resolved;
}

function validateResolvedVitals(resolved) {
  const missing = [];

  if (!Number.isFinite(resolved.heartRate)) {
    missing.push("heartRate");
  }

  if (!Number.isFinite(resolved.spo2)) {
    missing.push("spo2");
  }

  if (!Number.isFinite(resolved.temperature)) {
    missing.push("temperature");
  }

  if (!normalizeBloodPressure(resolved.bloodPressure)) {
    missing.push("bloodPressure");
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

module.exports = {
  resolveTelemetryPayload,
  validateResolvedVitals,
};
