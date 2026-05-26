const express = require("express");
const {
  startSimulation,
  stopSimulation,
  getSimulationStatus,
  syncSimulatorApiKey,
} = require("../services/simulatorService");

const router = express.Router();

function readHeaderApiKey(req) {
  const raw = req?.headers?.["x-api-key"];
  if (Array.isArray(raw)) {
    return String(raw[0] || "").trim();
  }

  return String(raw || "").trim();
}

router.post("/start", (req, res) => {
  const status = startSimulation({
    apiKey: readHeaderApiKey(req),
  });
  return res.status(200).json(status);
});

router.post("/stop", (_req, res) => {
  const status = stopSimulation();
  return res.status(200).json(status);
});

router.get("/status", (req, res) => {
  const apiKey = readHeaderApiKey(req);
  if (apiKey) {
    return res.status(200).json(syncSimulatorApiKey(apiKey));
  }

  return res.status(200).json(getSimulationStatus());
});

module.exports = router;
