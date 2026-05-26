const DEFAULT_PATIENT_IDS = ["201", "202", "203", "204", "205"];
const DEFAULT_INTERVAL_MS = 5000;
const MIN_INTERVAL_MS = 1000;
const { logIngestionError } = require("./ingestionLogger");

let simulationTimer = null;
let running = false;
let lastError = null;
let simulatorApiKey = String(process.env.SIMULATOR_API_KEY || "").trim();

function normalizeApiKey(value) {
  return String(value || "").trim();
}

function resolveSimulatorApiKey() {
  if (simulatorApiKey) {
    return simulatorApiKey;
  }

  return normalizeApiKey(process.env.SIMULATOR_API_KEY);
}

function setSimulatorApiKey(value) {
  const normalized = normalizeApiKey(value);
  if (!normalized) {
    return;
  }

  simulatorApiKey = normalized;
}

function syncSimulatorApiKey(value) {
  setSimulatorApiKey(value);
  return getSimulationStatus();
}

function parseIntervalMs() {
  const raw = Number(process.env.SIMULATOR_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(raw)) {
    return DEFAULT_INTERVAL_MS;
  }

  return Math.max(MIN_INTERVAL_MS, Math.round(raw));
}

function resolveTargetUrl() {
  const explicit = String(process.env.SIMULATOR_TARGET_URL || "").trim();
  if (explicit) {
    return explicit;
  }

  const serverPort = Number(process.env.SERVER_PORT || 4000);
  return `http://127.0.0.1:${serverPort}/telemetry/update`;
}

function pickPatientId() {
  const pool = String(process.env.SIMULATOR_PATIENT_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const candidates = pool.length > 0 ? pool : DEFAULT_PATIENT_IDS;
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, precision = 1) {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(precision));
}

function buildTelemetryPayload() {
  const patientId = pickPatientId();
  return {
    patientId,
    monitorId: `sim-${patientId}`,
    source: "simulator",
    heartRate: randomInt(70, 140),
    spo2: randomInt(82, 99),
    temperature: randomFloat(97.0, 103.0),
    bloodPressure: `${randomInt(90, 160)}/${randomInt(55, 100)}`,
  };
}

async function postTelemetrySample() {
  const headers = {
    "Content-Type": "application/json",
  };

  const runtimeApiKey = resolveSimulatorApiKey();
  if (runtimeApiKey) {
    headers["x-api-key"] = runtimeApiKey;
  }

  const response = await fetch(resolveTargetUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify(buildTelemetryPayload()),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Simulator target responded with ${response.status}: ${body}`);
  }
}

async function tick() {
  try {
    await postTelemetrySample();
    lastError = null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Simulator tick failed";
    logIngestionError("simulator", "tick", error, {
      targetUrl: resolveTargetUrl(),
      intervalMs: parseIntervalMs(),
    });
  }
}

function getSimulationStatus() {
  return {
    running,
    status: running ? "Running" : "Stopped",
    intervalMs: parseIntervalMs(),
    targetUrl: resolveTargetUrl(),
    apiKeyConfigured: Boolean(resolveSimulatorApiKey()),
    lastError,
  };
}

function startSimulation(options = {}) {
  setSimulatorApiKey(options.apiKey);

  if (running && simulationTimer) {
    return getSimulationStatus();
  }

  const intervalMs = parseIntervalMs();
  simulationTimer = setInterval(() => {
    void tick();
  }, intervalMs);

  running = true;
  void tick();
  return getSimulationStatus();
}

function stopSimulation() {
  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }

  running = false;
  return getSimulationStatus();
}

process.on("exit", () => {
  stopSimulation();
});

module.exports = {
  getSimulationStatus,
  startSimulation,
  stopSimulation,
  syncSimulatorApiKey,
};
