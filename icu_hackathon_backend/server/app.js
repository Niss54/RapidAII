
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const express = require("express");
const app = express();
const cors = require("cors");
const { initializeForecastService, getForecastServiceStatus } = require("./services/forecastService");
const hl7IngestionService = require("./services/hl7IngestionService");
const serialBridge = require("./services/serialBridge");
const { getWhatsAppIntegrationStatus } = require("./services/whatsappService");
const { apiKeyAuthMiddleware } = require("./middleware/apiKeyAuth");

const telemetryRoutes = require("./routes/telemetry");
const voiceRoutes = require("./routes/voice");
const summaryRoutes = require("./routes/summary");
const simulatorRoutes = require("./routes/simulator");
const integrationRoutes = require("./routes/integration");
const apiKeyRoutes = require("./routes/apiKey");
const billingRoutes = require("./routes/billing");
const whatsappWebhookRoutes = require("./routes/whatsappWebhook");
// Root health-check endpoint for Render
app.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "rapidai-server"
  });
});

function hasPlaceholderValue(value) {
  return /^your[_-]/i.test(String(value || "").trim());
}

function isWhatsAppWebhookActive() {
  const verifyToken = String(process.env.VERIFY_TOKEN || "").trim();
  return Boolean(verifyToken) && !hasPlaceholderValue(verifyToken);
}

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "icu-voice-server",
    forecast: getForecastServiceStatus(),
  });
});

app.use("/api-key", apiKeyRoutes);
app.use("/billing", billingRoutes);

const whatsappWebhookActive = isWhatsAppWebhookActive();
if (whatsappWebhookActive) {
  app.use("/whatsapp", whatsappWebhookRoutes);
}
// Public health-check endpoint for Render
app.get("/integration/status", (_req, res) => {
  res.json({ status: "ok" });
});
app.use(apiKeyAuthMiddleware);

app.use("/telemetry", telemetryRoutes);
app.use("/voice", voiceRoutes);
app.use("/icu", summaryRoutes);
app.use("/simulator", simulatorRoutes);
app.use("/integration", integrationRoutes);

const port = Number(process.env.SERVER_PORT || 4000);

async function start() {
  // const forecastStatus = await initializeForecastService();
  // console.log(`Forecast mode: ${forecastStatus.source} (${forecastStatus.message})`);

  if (process.env.ENABLE_FORECAST === "true") {
    const forecastStatus = await initializeForecastService();
    console.log(`Forecast mode: ${forecastStatus.source} (${forecastStatus.message})`);
  } else {
    console.log("Forecast service disabled in production environment");
  }

  const hl7Status = hl7IngestionService.startHl7IngestionService();
  console.log(
    `HL7 ingestion active on TCP ${hl7Status.port} -> ${hl7Status.forwardUrl}`
  );

  if (process.env.ENABLE_SERIAL === "true") {
    // const serialStatus = serialBridge.startSerialBridge();
    // console.log(
    //   `Serial bridge active on ${serialStatus.port} @ ${serialStatus.baudRate} -> ${serialStatus.forwardUrl}`
    // );

    if (process.env.ENABLE_SERIAL === "true") {
      const serialStatus = serialBridge.startSerialBridge();
      console.log(
        `Serial bridge active on ${serialStatus.port} @ ${serialStatus.baudRate} -> ${serialStatus.forwardUrl}`
      );
    } else {
      console.log("Serial bridge disabled in production environment");
    }
  } else {
    console.log("Serial bridge disabled in production environment");
  }

  console.log(
    whatsappWebhookActive
      ? "WhatsApp webhook endpoint active at POST /whatsapp/webhook"
      : "WhatsApp webhook endpoint inactive (VERIFY_TOKEN missing)"
  );

  const whatsappStatus = getWhatsAppIntegrationStatus();
  console.log(
    whatsappStatus.status === "active"
      ? "WhatsApp escalation integration active"
      : `WhatsApp escalation integration inactive (${whatsappStatus.reason || "credentials-missing"})`
  );

  const PORT = process.env.PORT || process.env.SERVER_PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error("Server failed to start", error);
  process.exit(1);
});
