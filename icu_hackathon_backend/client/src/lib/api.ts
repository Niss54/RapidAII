export type PatientRecord = {
  patientId: string;
  heartRate: number;
  spo2: number;
  temperature: number;
  bloodPressure: string;
  riskScore: number;
  riskLevel: string;
  predictedRiskNext5Minutes: "CRITICAL" | "MODERATE" | "WARNING" | "STABLE";
  telemetrySource?: "hl7" | "serial" | "simulator" | string;
  lastUpdated: string;
};

export type IcuSummaryResponse = {
  summary: {
    critical: number;
    moderate: number;
    warning: number;
    stable: number;
    total: number;
  };
  patients: PatientRecord[];
};

export type TimelineEvent = {
  id: string;
  eventType: "telemetry" | "alert";
  patientId: string;
  occurredAt: string;
  riskLevel?: string;
  reason?: string | null;
  telemetry?: {
    heartRate: number | null;
    spo2: number | null;
    temperature: number | null;
    bloodPressure: string | null;
  };
  alertType?: string;
  language?: "en" | "hi" | string;
  message?: string;
  delivered?: boolean;
  deliveryReason?: string | null;
  deliveryChannels?: string[];
};

export type TimelineResponse = {
  events: TimelineEvent[];
  total: number;
};

export type ForecastProjectionPoint = {
  minute: number;
  riskScore: number;
};

export type ForecastProjectionFilters = {
  patientId?: string;
  patientIds?: string[];
  from?: string;
  to?: string;
};

export type ForecastSourceSummary = {
  legacyMl: number;
  heuristicFallback: number;
  disabled: number;
};

export type ForecastProjectionRecord = {
  patientId: string;
  patientLastUpdated: string | null;
  currentRiskScore: number;
  futureRiskScore: number;
  predictedDeteriorationState: "CRITICAL" | "MODERATE" | "WARNING" | "STABLE";
  source: "legacy-ml" | "heuristic-fallback" | "disabled";
  warning: string | null;
  forecastedVitals: number[] | null;
  timelineProjection: ForecastProjectionPoint[];
};

export type ForecastProjectionResponse = {
  generatedAt: string;
  total: number;
  appliedFilters: {
    patientIds: string[];
    from: string | null;
    to: string | null;
  };
  sourceSummary: ForecastSourceSummary;
  projections: ForecastProjectionRecord[];
};

export type LiveKitTokenResponse = {
  token: string;
  roomName: string;
  identity: string;
  wsUrl: string;
};

export type VoiceLanguage =
  | "en"
  | "hi"
  | "bn"
  | "ta"
  | "te"
  | "mr"
  | "gu"
  | "kn"
  | "ml"
  | "pa"
  | "ur"
  | "or";

export type VoiceQueryResponse = {
  transcript: string;
  intent: "PATIENT_STATUS" | "ICU_SUMMARY" | "LANGUAGE_SWITCH" | "GENERAL_QUERY" | "ALERT_LOCK";
  patientId: string | null;
  language: VoiceLanguage;
  responseText: string;
  audioBase64: string | null;
};

export type VoiceLanguagesResponse = {
  activeLanguage: VoiceLanguage;
  supportedLanguages: VoiceLanguage[];
};

export type VoiceAlertStateResponse =
  | {
      active: false;
    }
  | {
      active: true;
      patientId: string | null;
      message: string | null;
      language: VoiceLanguage;
      remainingMs: number;
    };

export type TelemetryUpdateResponse = {
  patient: PatientRecord;
  risk: {
    patientId: string;
    riskScore: number;
    riskLevel: "CRITICAL" | "MODERATE" | "WARNING" | "STABLE";
    reason: string;
  };
  decodedVitals?: {
    heartRate: number;
    spo2: number;
    temperature: number;
    bloodPressure: string;
    monitorId?: string;
    source: "hex" | "json";
  };
  decoderWarnings?: string[];
  identityResolution?: {
    patientId: string;
    monitorKey: string;
    providedPatientId: string | null;
    resolution: "direct-bind" | "anonymous-bind" | "monitor-binding" | "collision-fallback" | "pattern-fallback";
    collision: boolean;
    notes: string[];
  };
  forecast?: {
    predictedRiskNext5Minutes: "CRITICAL" | "MODERATE" | "WARNING" | "STABLE";
    source: "legacy-ml" | "heuristic-fallback" | "disabled";
    forecastedVitals: number[] | null;
    warning: string | null;
  };
  alert: {
    text: string;
    language: string;
    audioBase64: string | null;
    delivered: boolean;
    deliveryReason: string | null;
    whatsappMessage?: string | null;
    whatsapp?: {
      attempted: boolean;
      sent: boolean;
      reason: string | null;
      sentCount: number;
      recipients: string[];
      results: Array<Record<string, unknown>>;
    };
  } | null;
  escalationChannels?: {
    voiceBroadcast: {
      attempted: boolean;
      delivered: boolean;
      reason: string | null;
    };
    dashboardAlertStream: {
      attempted: boolean;
      delivered: boolean;
      reason: string | null;
    };
    whatsappEscalation: {
      attempted: boolean;
      sent: boolean;
      reason: string | null;
      sentCount: number;
      recipients: string[];
      results: Array<Record<string, unknown>>;
    };
  } | null;
};

export type TelemetryIngestResponse = {
  heartRate?: number;
  heart_rate?: number;
  hr?: number;
  spo2?: number;
  temperature?: number;
  bloodPressure?: string;
  blood_pressure?: string;
  bp?: string;
  packet_integrity_status?: string;
  packetIntegrityStatus?: string;
  reconstruction_status?: string;
  reconstructionStatus?: string;
  observations_ingested?: number;
  observationsIngested?: number;
  warnings?: string[];
  message?: string;
  latest_vitals?: Record<string, unknown>;
};

export type AnalyticsPatientState = {
  patient_id: string;
  monitor_id?: string;
  resolution_strategy?: string;
  timestamp?: number | null;
  risk_score?: number;
  risk_level?: string;
  last_source?: string;
  updated_at?: number | null;
  latest_vitals?: Record<string, unknown>;
};

export type AnalyticsPatientsResponse = {
  patients: AnalyticsPatientState[];
};

export type AnalyticsPatientDetail = {
  patient_id: string;
  latest_vitals: Record<string, unknown>;
  signal_history?: Record<string, Array<{ value: number; timestamp: number }>>;
  alerts?: Array<Record<string, unknown>>;
  conflicts?: Array<Record<string, unknown>>;
  risk_score?: number;
  risk_level?: string;
  last_source?: string;
  updated_at?: number | null;
};

export type AnalyticsAlertRecord = {
  patient_id?: string;
  severity?: string;
  reason?: string;
  alert_reason?: string;
  timestamp?: number;
  risk_score?: number;
  signal?: string;
  value?: number;
  duplicate_suppressed?: boolean | string | number;
  duplicateSuppressed?: boolean | string | number;
  cooldown_remaining_seconds?: number | string;
  cooldownRemainingSeconds?: number | string;
};

export type AnalyticsAlertsResponse = {
  alerts: AnalyticsAlertRecord[];
  count: number;
};

export type TriageInsight = {
  available?: boolean;
  severity?: "negligible" | "moderate" | "high" | "urgent" | string;
  assessment?: string;
  value?: number;
};

export type TriageAnalysisResponse = {
  patient_id?: string;
  overall_severity?: "negligible" | "moderate" | "high" | "urgent" | string;
  triage_priority?: string;
  recommended_escalation?: string;
  risk_explanation_summary?: string;
  insights?: {
    shock_index?: TriageInsight;
    map?: TriageInsight;
    sepsis_warning?: TriageInsight;
    cushings_warning?: TriageInsight;
    [key: string]: TriageInsight | undefined;
  };
};

export type ForecastNextResponse = {
  forecasted_vitals: number[];
  status: string;
};

export type VoiceLogRecord = {
  id: string;
  patient_id?: string | null;
  query_text: string;
  detected_intent: string;
  language: string;
  response_summary: string;
  timestamp: string;
};

export type VoiceLogsResponse = {
  logs: VoiceLogRecord[];
  total: number;
  page: number;
  limit: number;
};

export type SimulatorControlResponse = {
  running: boolean;
  status: "Running" | "Stopped";
  intervalMs: number;
  targetUrl: string;
  lastError: string | null;
};

export type HealthResponse = {
  status: string;
  service: string;
  forecast?: {
    enabled?: boolean;
    checkedAt?: string;
    ready?: boolean;
    source?: string;
    message?: string;
    nextUrl?: string;
  };
};

export type IntegrationStatusResponse = {
  hl7_listener: "running" | "stopped" | string;
  serial_bridge: "running" | "stopped" | string;
  last_message_received: string | null;
};

export type WhatsAppIntegrationStatusResponse = {
  status: "active" | "inactive" | string;
  tokenConfigured: boolean;
  phoneNumberConfigured: boolean;
  reason?: string | null;
};

export type ApiKeyDetailsResponse = {
  user_id: string;
  plan_type: "free" | "pro" | "hospital" | string;
  usage_limit: number;
  usage_count: number;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
  api_key_masked: string;
  auto_created: boolean;
};

export type ApiKeyRegenerateResponse = {
  user_id: string;
  plan_type: "free" | "pro" | "hospital" | string;
  usage_limit: number;
  usage_count: number;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
  api_key_masked: string;
  api_key: string;
  regenerated: boolean;
};

export type BillingPlanCode = "premium_monthly" | "premium_yearly";

export type BillingPlan = {
  code: BillingPlanCode;
  name: string;
  billing_cycle: "monthly" | "yearly";
  amount_usd: number;
  amount_display: string;
  usage_limit: number;
  highlights: string[];
};

export type BillingPlansResponse = {
  gateway: string;
  mode: "test" | string;
  plans: BillingPlan[];
};

export type BillingCheckoutResponse = {
  status: "created" | string;
  mode: "test" | string;
  user_id: string;
  gateway: string;
  razorpay_key_id: string;
  order: {
    id: string;
    amount_usd: number;
    amount_display: string;
    currency: string;
    plan_code: BillingPlanCode;
    billing_cycle: "monthly" | "yearly";
  };
  plan: BillingPlan;
};

export type BillingConfirmResponse = {
  status: "active" | string;
  mode: "test" | string;
  user_id: string;
  plan: BillingPlan;
  api_key: string;
  api_key_masked: string;
  usage: {
    usage_limit: number;
    usage_count: number;
  };
  subscription: {
    plan_type: string;
    created_at: string;
    expires_at: string | null;
  };
  payment: {
    gateway: string;
    order_id: string;
    payment_id: string;
  };
};

const SERVER_BASE =
  process.env.NEXT_PUBLIC_SERVER_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";
const ANALYTICS_BASE =
  process.env.NEXT_PUBLIC_ANALYTICS_URL ??
  process.env.NEXT_PUBLIC_PYTHON_API_URL ??
  "http://localhost:8080";
const API_KEY_STORAGE_KEY = "rapidai-runtime-api-key";
const API_KEY_USER_ID_STORAGE_KEY = "rapidai-api-access-user-id";
const DEFAULT_API_KEY_USER_ID = "doctor-101";
const PRECONFIGURED_API_KEY = String(process.env.NEXT_PUBLIC_API_KEY || "").trim();

let cachedRuntimeApiKey: string | null = null;
let inFlightApiKeyPromise: Promise<string | null> | null = null;

function buildUrl(base: string, path: string): string {
  const normalizedBase = String(base || "").replace(/\/+$/, "");
  if (!normalizedBase) {
    return path;
  }

  return `${normalizedBase}${path}`;
}

function isBrowserEnvironment(): boolean {
  return typeof window !== "undefined";
}

function readStoredRuntimeApiKey(): string | null {
  if (PRECONFIGURED_API_KEY) {
    cachedRuntimeApiKey = PRECONFIGURED_API_KEY;
    return cachedRuntimeApiKey;
  }

  if (cachedRuntimeApiKey && cachedRuntimeApiKey.trim().length > 0) {
    return cachedRuntimeApiKey;
  }

  if (isBrowserEnvironment()) {
    const stored = String(window.localStorage.getItem(API_KEY_STORAGE_KEY) || "").trim();
    if (stored) {
      cachedRuntimeApiKey = stored;
      return cachedRuntimeApiKey;
    }
  }

  return null;
}

function persistRuntimeApiKey(apiKey: string): void {
  if (PRECONFIGURED_API_KEY) {
    cachedRuntimeApiKey = PRECONFIGURED_API_KEY;
    return;
  }

  const normalized = String(apiKey || "").trim();
  if (!normalized) {
    return;
  }

  cachedRuntimeApiKey = normalized;

  if (!isBrowserEnvironment()) {
    return;
  }

  try {
    window.localStorage.setItem(API_KEY_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage quota/privacy mode issues.
  }
}

function clearStoredRuntimeApiKey(): void {
  cachedRuntimeApiKey = PRECONFIGURED_API_KEY || null;

  if (!isBrowserEnvironment()) {
    return;
  }

  try {
    window.localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // Ignore storage quota/privacy mode issues.
  }
}

function readHeaderApiKey(headers: Headers): string {
  return String(headers.get("x-api-key") || "").trim();
}

function resolveRuntimeApiUserId(): string {
  if (!isBrowserEnvironment()) {
    return DEFAULT_API_KEY_USER_ID;
  }

  const stored = String(window.localStorage.getItem(API_KEY_USER_ID_STORAGE_KEY) || "").trim();
  return stored || DEFAULT_API_KEY_USER_ID;
}

function isPublicApiPath(path: string): boolean {
  const normalized = String(path || "").trim().toLowerCase();
  return normalized === "/health" || normalized.startsWith("/api-key") || normalized.startsWith("/billing");
}

async function parseJsonPayload(response: Response): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (!body) {
    return {};
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { error: body };
  }
}

async function regenerateRuntimeApiKey(): Promise<string | null> {
  if (PRECONFIGURED_API_KEY) {
    persistRuntimeApiKey(PRECONFIGURED_API_KEY);
    return PRECONFIGURED_API_KEY;
  }

  if (inFlightApiKeyPromise) {
    return inFlightApiKeyPromise;
  }

  inFlightApiKeyPromise = (async () => {
    try {
      const response = await fetch(buildUrl(SERVER_BASE, "/api-key/regenerate"), {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": resolveRuntimeApiUserId(),
        },
      });

      const data = await parseJsonPayload(response);
      if (!response.ok) {
        return null;
      }

      const apiKey = String(data?.api_key || "").trim();
      if (!apiKey) {
        return null;
      }

      persistRuntimeApiKey(apiKey);
      return apiKey;
    } catch {
      return null;
    } finally {
      inFlightApiKeyPromise = null;
    }
  })();

  return inFlightApiKeyPromise;
}

async function requestJsonFromBase<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const targetUrl = buildUrl(base, path);
  const headers = new Headers(init?.headers ?? undefined);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const needsApiKey = !isPublicApiPath(path);

  if (needsApiKey && !headers.has("x-api-key")) {
    const existingApiKey = readStoredRuntimeApiKey();
    if (existingApiKey) {
      headers.set("x-api-key", existingApiKey);
    } else {
      const generatedApiKey = await regenerateRuntimeApiKey();
      if (generatedApiKey) {
        headers.set("x-api-key", generatedApiKey);
      }
    }
  }

  const originalRequestApiKey = readHeaderApiKey(headers);

  const sendRequest = async () =>
    fetch(targetUrl, {
      ...init,
      cache: "no-store",
      headers,
    });

  let response = await sendRequest();
  let data = await parseJsonPayload(response);

  const supportsApiKeyRetry = (payload: Record<string, unknown>, status: number): boolean => {
    const errorText = String(payload?.error || "").toLowerCase();
    return status === 401 || status === 403 || errorText.includes("x-api-key") || errorText.includes("api key");
  };

  let canRetryWithFreshKey = needsApiKey && supportsApiKeyRetry(data, response.status);

  if (canRetryWithFreshKey) {
    const latestStoredApiKey = readStoredRuntimeApiKey();
    if (latestStoredApiKey && latestStoredApiKey !== originalRequestApiKey) {
      headers.set("x-api-key", latestStoredApiKey);
      response = await sendRequest();
      data = await parseJsonPayload(response);
      canRetryWithFreshKey = needsApiKey && supportsApiKeyRetry(data, response.status);
    }
  }

  if (canRetryWithFreshKey) {
    const refreshedApiKey = await regenerateRuntimeApiKey();
    if (refreshedApiKey && readHeaderApiKey(headers) !== refreshedApiKey) {
      headers.set("x-api-key", refreshedApiKey);
      response = await sendRequest();
      data = await parseJsonPayload(response);
    }
  }

  if (!response.ok) {
    if (needsApiKey && (response.status === 401 || response.status === 403)) {
      clearStoredRuntimeApiKey();
    }

    throw new Error(String(data?.error || `Request failed for ${path}`));
  }

  return data as T;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJsonFromBase(SERVER_BASE, path, init);
}

function normalizeApiAccessUserId(userId: string): string {
  const normalized = String(userId || "").trim();
  if (!normalized) {
    throw new Error("userId is required");
  }

  return normalized;
}

function normalizeBillingPlanCode(planCode: string): BillingPlanCode {
  const normalized = String(planCode || "").trim().toLowerCase();
  if (normalized === "premium_yearly") {
    return "premium_yearly";
  }

  if (normalized === "premium_monthly") {
    return "premium_monthly";
  }

  throw new Error("planCode must be premium_monthly or premium_yearly");
}

export function toDataUrl(base64Audio: string): string {
  return `data:audio/mpeg;base64,${base64Audio}`;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson("/health");
}

export async function fetchIntegrationStatus(): Promise<IntegrationStatusResponse> {
  return requestJson("/integration/status");
}

export async function fetchWhatsAppIntegrationStatus(): Promise<WhatsAppIntegrationStatusResponse> {
  return requestJson("/integration/whatsapp-status");
}

export async function fetchMyApiKey(userId: string): Promise<ApiKeyDetailsResponse> {
  const normalizedUserId = normalizeApiAccessUserId(userId);
  return requestJson("/api-key/my-key", {
    headers: {
      "x-user-id": normalizedUserId,
    },
  });
}

export async function regenerateMyApiKey(userId: string): Promise<ApiKeyRegenerateResponse> {
  const normalizedUserId = normalizeApiAccessUserId(userId);
  return requestJson("/api-key/regenerate", {
    method: "POST",
    headers: {
      "x-user-id": normalizedUserId,
    },
  });
}

export async function fetchBillingPlans(): Promise<BillingPlansResponse> {
  return requestJson("/billing/plans");
}

export async function createDemoBillingCheckout(payload: {
  userId: string;
  planCode: BillingPlanCode;
  gateway?: string;
}): Promise<BillingCheckoutResponse> {
  const normalizedUserId = normalizeApiAccessUserId(payload.userId);
  const normalizedPlanCode = normalizeBillingPlanCode(payload.planCode);

  return requestJson("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({
      userId: normalizedUserId,
      planCode: normalizedPlanCode,
      gateway: String(payload.gateway || "razorpay_test"),
    }),
  });
}

export async function confirmDemoBillingPayment(payload: {
  userId: string;
  planCode: BillingPlanCode;
  orderId: string;
  razorpayPaymentId?: string;
  gateway?: string;
}): Promise<BillingConfirmResponse> {
  const normalizedUserId = normalizeApiAccessUserId(payload.userId);
  const normalizedPlanCode = normalizeBillingPlanCode(payload.planCode);
  const normalizedOrderId = String(payload.orderId || "").trim();

  if (!normalizedOrderId) {
    throw new Error("orderId is required");
  }

  return requestJson("/billing/confirm", {
    method: "POST",
    body: JSON.stringify({
      userId: normalizedUserId,
      planCode: normalizedPlanCode,
      orderId: normalizedOrderId,
      razorpayPaymentId: String(payload.razorpayPaymentId || "").trim(),
      gateway: String(payload.gateway || "razorpay_test"),
    }),
  });
}

export async function fetchSimulatorStatus(): Promise<SimulatorControlResponse> {
  return requestJson("/simulator/status");
}

export async function startBackendSimulation(): Promise<SimulatorControlResponse> {
  return requestJson("/simulator/start", {
    method: "POST",
  });
}

export async function stopBackendSimulation(): Promise<SimulatorControlResponse> {
  return requestJson("/simulator/stop", {
    method: "POST",
  });
}

export async function fetchIcuSummary(): Promise<IcuSummaryResponse> {
  return requestJson("/icu/summary");
}

export async function fetchIcuTimeline(params?: {
  patientId?: string;
  limit?: number;
}): Promise<TimelineResponse> {
  const query = new URLSearchParams();

  if (params?.patientId) {
    query.set("patientId", params.patientId);
  }

  if (typeof params?.limit === "number") {
    query.set("limit", String(params.limit));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson(`/icu/timeline${suffix}`);
}

function appendForecastProjectionFilters(
  query: URLSearchParams,
  filters?: ForecastProjectionFilters
) {
  if (!filters) {
    return;
  }

  const patientId = String(filters.patientId || "").trim();
  if (patientId) {
    query.set("patientId", patientId);
  }

  if (Array.isArray(filters.patientIds) && filters.patientIds.length > 0) {
    const normalized = filters.patientIds
      .map((value) => String(value || "").trim())
      .filter((value) => value.length > 0);

    if (normalized.length > 0) {
      query.set("patientIds", normalized.join(","));
    }
  }

  const from = String(filters.from || "").trim();
  if (from) {
    query.set("from", from);
  }

  const to = String(filters.to || "").trim();
  if (to) {
    query.set("to", to);
  }
}

export async function fetchForecastProjections(
  filters?: ForecastProjectionFilters
): Promise<ForecastProjectionResponse> {
  const query = new URLSearchParams();
  appendForecastProjectionFilters(query, filters);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson(`/icu/forecast/projection${suffix}`);
}

export async function downloadForecastProjectionExport(
  format: "csv" | "json",
  filters?: ForecastProjectionFilters
): Promise<Blob> {
  const query = new URLSearchParams();
  query.set("format", format);
  appendForecastProjectionFilters(query, filters);

  const headers = new Headers();
  const initialApiKey = readStoredRuntimeApiKey();
  if (initialApiKey) {
    headers.set("x-api-key", initialApiKey);
  } else {
    const generatedApiKey = await regenerateRuntimeApiKey();
    if (generatedApiKey) {
      headers.set("x-api-key", generatedApiKey);
    }
  }

  const sendRequest = async () =>
    fetch(`${SERVER_BASE}/icu/forecast/projection/export?${query.toString()}`, {
      cache: "no-store",
      headers,
    });

  let response = await sendRequest();

  if (response.status === 401 || response.status === 403) {
    const usedApiKey = readHeaderApiKey(headers);
    const latestStoredApiKey = readStoredRuntimeApiKey();

    if (latestStoredApiKey && latestStoredApiKey !== usedApiKey) {
      headers.set("x-api-key", latestStoredApiKey);
      response = await sendRequest();
    }
  }

  if (response.status === 401 || response.status === 403) {
    const refreshedApiKey = await regenerateRuntimeApiKey();
    if (refreshedApiKey && readHeaderApiKey(headers) !== refreshedApiKey) {
      headers.set("x-api-key", refreshedApiKey);
      response = await sendRequest();
    }
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearStoredRuntimeApiKey();
    }

    let message = `Request failed for projection export (${response.status})`;
    try {
      const data = await response.json();
      if (data?.error) {
        message = String(data.error);
      }
    } catch {
      // Keep fallback message when response is not JSON.
    }

    throw new Error(message);
  }

  return response.blob();
}

export async function updateTelemetry(payload: {
  patientId: string;
  monitorId?: string;
  heartRate?: number;
  spo2?: number;
  temperature?: number;
  bloodPressure?: string;
  hexPayload?: string;
  telemetryHex?: string;
  hex_payload?: string;
  sourceHint?: string;
}): Promise<TelemetryUpdateResponse> {
  return requestJson("/telemetry/update", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function ingestTelemetryHex(hexPayload: string): Promise<TelemetryIngestResponse> {
  return requestJsonFromBase(ANALYTICS_BASE, "/api/v1/telemetry/ingest", {
    method: "POST",
    body: JSON.stringify({
      hex_payload: hexPayload,
      patient_id: "decode-only",
      monitor_id: "decode-only"
    }),
  });
}

export async function fetchAnalyticsPatients(): Promise<AnalyticsPatientsResponse> {
  return requestJsonFromBase(ANALYTICS_BASE, "/api/v1/patients");
}

export async function fetchAnalyticsPatientById(patientId: string): Promise<AnalyticsPatientDetail> {
  const normalizedPatientId = String(patientId || "").trim();
  if (!normalizedPatientId) {
    throw new Error("patient_id is required");
  }

  return requestJsonFromBase(
    ANALYTICS_BASE,
    `/api/v1/patients/${encodeURIComponent(normalizedPatientId)}`
  );
}

export async function fetchAnalyticsAlerts(params?: {
  patientId?: string;
  limit?: number;
}): Promise<AnalyticsAlertsResponse> {
  const query = new URLSearchParams();

  const patientId = String(params?.patientId || "").trim();
  if (patientId) {
    query.set("patient_id", patientId);
  }

  if (typeof params?.limit === "number" && Number.isFinite(params.limit) && params.limit > 0) {
    query.set("limit", String(Math.round(params.limit)));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJsonFromBase(ANALYTICS_BASE, `/api/v1/alerts${suffix}`);
}

export async function analyzeTriage(payload: {
  patient_id?: string;
  vitals?: Record<string, unknown>;
}): Promise<TriageAnalysisResponse> {
  return requestJsonFromBase(ANALYTICS_BASE, "/api/v1/analysis/triage", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function forecastNext(payload: {
  patient_id: string;
  vitals?: number[][];
  feature_names?: string[];
}): Promise<ForecastNextResponse> {
  return requestJsonFromBase(ANALYTICS_BASE, "/api/v1/forecast/next", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchVoiceLogs(params?: {
  patientId?: string;
  language?: string;
  intent?: string;
  page?: number;
  limit?: number;
}): Promise<VoiceLogsResponse> {
  const query = new URLSearchParams();

  const patientId = String(params?.patientId || "").trim();
  const language = String(params?.language || "").trim();
  const intent = String(params?.intent || "").trim();

  if (patientId) {
    query.set("patientId", patientId);
  }

  if (language) {
    query.set("language", language);
  }

  if (intent) {
    query.set("intent", intent);
  }

  const page = Number(params?.page);
  if (Number.isFinite(page) && page > 0) {
    query.set("page", String(Math.round(page)));
  }

  const limit = Number(params?.limit);
  if (Number.isFinite(limit) && limit > 0) {
    query.set("limit", String(Math.round(limit)));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson(`/icu/voice-logs${suffix}`);
}

export async function fetchVoiceToken(): Promise<LiveKitTokenResponse> {
  return requestJson("/voice/token");
}

export async function fetchVoiceLanguages(): Promise<VoiceLanguagesResponse> {
  return requestJson("/voice/languages");
}

export async function fetchVoiceAlertState(): Promise<VoiceAlertStateResponse> {
  return requestJson("/voice/alert-state");
}

export async function queryVoice(payload: {
  text?: string;
  audioBase64?: string;
  language?: VoiceLanguage;
  userId?: string;
}): Promise<VoiceQueryResponse> {
  return requestJson("/voice/query", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function setRuntimeApiKey(apiKey: string): void {
  persistRuntimeApiKey(apiKey);
}

export function clearRuntimeApiKey(): void {
  clearStoredRuntimeApiKey();
}
