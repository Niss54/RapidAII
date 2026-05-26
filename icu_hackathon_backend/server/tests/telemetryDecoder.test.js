const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveTelemetryPayload,
  validateResolvedVitals,
} = require("../services/telemetryDecoder");

function toHex(value) {
  return Buffer.from(String(value), "utf8").toString("hex").toUpperCase();
}

test("resolveTelemetryPayload decodes hex-encoded JSON vitals", () => {
  const payloadHex = toHex(
    JSON.stringify({
      heartRate: 110,
      spo2: 91,
      temperature: 99.4,
      bloodPressure: "122/82",
    })
  );

  const resolved = resolveTelemetryPayload({
    patientId: "204",
    monitorId: "monitor-204",
    hexPayload: payloadHex,
  });

  assert.equal(resolved.source, "hex");
  assert.equal(resolved.heartRate, 110);
  assert.equal(resolved.spo2, 91);
  assert.equal(resolved.temperature, 99.4);
  assert.equal(resolved.bloodPressure, "122/82");
  assert.equal(validateResolvedVitals(resolved).valid, true);
});

test("resolveTelemetryPayload builds blood pressure from hex-encoded JSON SBP/DBP", () => {
  const payloadHex = toHex(
    JSON.stringify({
      hr: 124,
      spo2: 88,
      temp: 101.2,
      systolic: 90,
      diastolic: 54,
    })
  );

  const resolved = resolveTelemetryPayload({
    patientId: "demo-alert-911",
    monitorId: "demo-alert-monitor",
    hexPayload: payloadHex,
  });

  assert.equal(resolved.heartRate, 124);
  assert.equal(resolved.spo2, 88);
  assert.equal(resolved.temperature, 101.2);
  assert.equal(resolved.bloodPressure, "90/54");
  assert.equal(validateResolvedVitals(resolved).valid, true);
});
