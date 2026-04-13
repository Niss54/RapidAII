const crypto = require("node:crypto");
const { getSupabaseClient, isSupabaseConfigured } = require("./supabaseClient");

const TABLE = "api_keys";
const API_USAGE_LOG_TABLE = "api_usage_logs";
const API_KEY_PREFIX = "rapid_live_";
const RANDOM_SEGMENT_LENGTH = 32;
const MASK_SEGMENT = "xxxxxxxx";

const PLAN_USAGE_LIMITS = {
  free: 1000,
  premium_monthly: 25000,
  premium_yearly: 25000,
  pro: 100000,
  hospital: 1000000,
};

const PLAN_EXPIRY_DAYS = {
  free: 30,
  premium_monthly: 30,
  premium_yearly: 365,
  pro: 365,
  hospital: 3650,
};

const VALID_PLAN_TYPES = new Set(Object.keys(PLAN_USAGE_LIMITS));

const defaultDependencies = {
  getSupabaseClient,
  isSupabaseConfigured,
  now: () => new Date(),
  randomBytes: (size) => crypto.randomBytes(size),
};

let dependencies = { ...defaultDependencies };

function ensureUserId(userId) {
  const normalized = String(userId || "").trim();
  if (!normalized) {
    throw new Error("userId is required");
  }

  return normalized;
}

function normalizePlanType(planType) {
  const normalized = String(planType || "free").trim().toLowerCase();
  if (!VALID_PLAN_TYPES.has(normalized)) {
    throw new Error("planType must be one of: free, premium_monthly, premium_yearly, pro, hospital");
  }

  return normalized;
}

function ensureApiKeyHash(apiKeyHash) {
  const normalized = String(apiKeyHash || "").trim();
  if (!normalized) {
    throw new Error("apiKey is required");
  }

  return normalized;
}

function normalizeEndpoint(endpoint) {
  const normalized = String(endpoint || "")
    .split("?")[0]
    .trim();

  return normalized || "/";
}

function resolveUtcDayWindow(referenceDate = dependencies.now()) {
  const dateValue = referenceDate instanceof Date ? referenceDate : new Date(String(referenceDate || ""));
  if (!Number.isFinite(dateValue.getTime())) {
    throw new Error("referenceDate must be a valid date");
  }

  const year = dateValue.getUTCFullYear();
  const month = dateValue.getUTCMonth();
  const day = dateValue.getUTCDate();

  const startUtc = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));

  return {
    startUtc,
    endUtc,
  };
}

function toIsoTimestamp(value, label) {
  const dateValue = value instanceof Date ? value : new Date(String(value || ""));
  if (!Number.isFinite(dateValue.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }

  return dateValue.toISOString();
}

function resolveUsageLimit(planType) {
  return PLAN_USAGE_LIMITS[planType];
}

function resolveExpiresAt(planType) {
  const now = dependencies.now();
  const days = PLAN_EXPIRY_DAYS[planType];
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

function buildRandomSegment() {
  const bytesNeeded = Math.ceil(RANDOM_SEGMENT_LENGTH / 2);
  const segment = dependencies.randomBytes(bytesNeeded).toString("hex").slice(0, RANDOM_SEGMENT_LENGTH);

  if (segment.length !== RANDOM_SEGMENT_LENGTH) {
    throw new Error("Failed to generate API key segment");
  }

  return segment;
}

function buildRawApiKey() {
  return `${API_KEY_PREFIX}${buildRandomSegment()}`;
}

function hashApiKey(rawApiKey) {
  const normalized = String(rawApiKey || "").trim();
  if (!normalized) {
    throw new Error("API key is required for hashing");
  }

  const hashSecret = String(process.env.API_KEY_HASH_SECRET || "").trim();
  const material = hashSecret ? `${normalized}:${hashSecret}` : normalized;

  return crypto.createHash("sha256").update(material).digest("hex");
}

function getApiKeyHint(rawApiKey) {
  const normalized = String(rawApiKey || "").trim();
  if (!normalized || normalized.length < 4) {
    return "xxxx";
  }

  return normalized.slice(-4).toLowerCase();
}

function maskApiKey({ rawApiKey, keyHint } = {}) {
  const normalizedHint = String(keyHint || "").trim().toLowerCase();
  let suffix = normalizedHint;

  if (!/^[a-f0-9]{4}$/.test(suffix)) {
    suffix = getApiKeyHint(rawApiKey);
  }

  if (!/^[a-f0-9]{4}$/.test(suffix)) {
    suffix = "xxxx";
  }

  return `${API_KEY_PREFIX}${MASK_SEGMENT}${suffix}`;
}

function mapApiKeyRecord(row) {
  const usageCount = Number(row?.usage_count);

  return {
    id: row.id,
    api_key: row.api_key ? String(row.api_key) : "",
    user_id: row.user_id,
    plan_type: row.plan_type,
    usage_limit: row.usage_limit,
    usage_count: Number.isFinite(usageCount) && usageCount >= 0 ? Math.round(usageCount) : 0,
    created_at: row.created_at,
    expires_at: row.expires_at,
    is_active: Boolean(row.is_active),
    key_hint: row.key_hint ? String(row.key_hint).toLowerCase() : null,
  };
}

async function withResolvedUsageCount(record, referenceDate = dependencies.now()) {
  if (!record) {
    return null;
  }

  const apiKeyHash = String(record.api_key || "").trim();
  if (!apiKeyHash) {
    return {
      ...record,
      usage_count: 0,
    };
  }

  const { startUtc, endUtc } = resolveUtcDayWindow(referenceDate);
  const usageCount = await countApiUsageForRange(apiKeyHash, startUtc, endUtc);

  return {
    ...record,
    usage_count: usageCount,
  };
}

function isApiKeyExpired(record, now = dependencies.now()) {
  if (!record || !record.expires_at) {
    return false;
  }

  const expiresAt = new Date(String(record.expires_at));
  if (!Number.isFinite(expiresAt.getTime())) {
    return true;
  }

  return expiresAt.getTime() <= now.getTime();
}

async function generateApiKey(userId, planType = "free") {
  if (!dependencies.isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Configure SUPABASE_URL and service role key first.");
  }

  const normalizedUserId = ensureUserId(userId);
  const normalizedPlanType = normalizePlanType(planType);
  const rawApiKey = buildRawApiKey();
  const hashedApiKey = hashApiKey(rawApiKey);
  const keyHint = getApiKeyHint(rawApiKey);

  const insertPayload = {
    user_id: normalizedUserId,
    api_key: hashedApiKey,
    key_hint: keyHint,
    plan_type: normalizedPlanType,
    usage_limit: resolveUsageLimit(normalizedPlanType),
    expires_at: resolveExpiresAt(normalizedPlanType),
    is_active: true,
  };

  const supabase = dependencies.getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert(insertPayload)
    .select("id, api_key, user_id, plan_type, usage_limit, created_at, expires_at, is_active, key_hint")
    .single();

  if (error) {
    throw new Error(`API key creation failed: ${error.message}`);
  }

  return {
    apiKey: rawApiKey,
    metadata: mapApiKeyRecord(data),
  };
}

async function findApiKeyByRawValue(rawApiKey) {
  if (!dependencies.isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Configure SUPABASE_URL and service role key first.");
  }

  const hashedApiKey = hashApiKey(rawApiKey);
  const supabase = dependencies.getSupabaseClient();

  const { data, error } = await supabase
    .from(TABLE)
    .select("id, api_key, user_id, plan_type, usage_limit, created_at, expires_at, is_active, key_hint")
    .eq("api_key", hashedApiKey)
    .maybeSingle();

  if (error) {
    throw new Error(`API key lookup failed: ${error.message}`);
  }

  return data ? mapApiKeyRecord(data) : null;
}

async function findLatestValidApiKeyByUserId(userId) {
  if (!dependencies.isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Configure SUPABASE_URL and service role key first.");
  }

  const normalizedUserId = ensureUserId(userId);
  const supabase = dependencies.getSupabaseClient();

  const { data, error } = await supabase
    .from(TABLE)
    .select("id, api_key, user_id, plan_type, usage_limit, created_at, expires_at, is_active, key_hint")
    .eq("user_id", normalizedUserId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`API key lookup by user failed: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  for (const row of rows) {
    const record = mapApiKeyRecord(row);
    if (!isApiKeyExpired(record)) {
      return record;
    }
  }

  return null;
}

async function findLatestApiKeyByUserId(userId) {
  if (!dependencies.isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Configure SUPABASE_URL and service role key first.");
  }

  const normalizedUserId = ensureUserId(userId);
  const supabase = dependencies.getSupabaseClient();

  const { data, error } = await supabase
    .from(TABLE)
    .select("id, api_key, user_id, plan_type, usage_limit, created_at, expires_at, is_active, key_hint")
    .eq("user_id", normalizedUserId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`API key lookup by user failed: ${error.message}`);
  }

  const firstRow = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return firstRow ? mapApiKeyRecord(firstRow) : null;
}

async function deactivateActiveApiKeysByUserId(userId) {
  if (!dependencies.isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Configure SUPABASE_URL and service role key first.");
  }

  const normalizedUserId = ensureUserId(userId);
  const supabase = dependencies.getSupabaseClient();

  const { error } = await supabase
    .from(TABLE)
    .update({ is_active: false })
    .eq("user_id", normalizedUserId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`API key deactivation failed: ${error.message}`);
  }
}

async function getOrCreateApiKeyForUser(userId) {
  const normalizedUserId = ensureUserId(userId);
  const existing = await findLatestValidApiKeyByUserId(normalizedUserId);

  if (existing) {
    const usageAwareMetadata = await withResolvedUsageCount(existing);

    return {
      metadata: usageAwareMetadata,
      maskedApiKey: maskApiKey({ keyHint: usageAwareMetadata.key_hint }),
      autoCreated: false,
    };
  }

  const created = await generateApiKey(normalizedUserId, "free");
  const usageAwareMetadata = await withResolvedUsageCount(created.metadata);

  return {
    metadata: usageAwareMetadata,
    maskedApiKey: maskApiKey({
      rawApiKey: created.apiKey,
      keyHint: usageAwareMetadata.key_hint,
    }),
    autoCreated: true,
  };
}

async function regenerateApiKeyForUser(userId) {
  const normalizedUserId = ensureUserId(userId);
  const latest = await findLatestApiKeyByUserId(normalizedUserId);
  const planType = latest ? normalizePlanType(latest.plan_type) : "free";

  await deactivateActiveApiKeysByUserId(normalizedUserId);

  const created = await generateApiKey(normalizedUserId, planType);
  const usageAwareMetadata = await withResolvedUsageCount(created.metadata);

  return {
    apiKey: created.apiKey,
    metadata: usageAwareMetadata,
    maskedApiKey: maskApiKey({
      rawApiKey: created.apiKey,
      keyHint: usageAwareMetadata.key_hint,
    }),
    regenerated: true,
  };
}

async function upgradeApiKeyPlanForUser(userId, planType) {
  const normalizedUserId = ensureUserId(userId);
  const normalizedPlanType = normalizePlanType(planType);

  await deactivateActiveApiKeysByUserId(normalizedUserId);

  const created = await generateApiKey(normalizedUserId, normalizedPlanType);
  const usageAwareMetadata = await withResolvedUsageCount(created.metadata);

  return {
    apiKey: created.apiKey,
    metadata: usageAwareMetadata,
    maskedApiKey: maskApiKey({
      rawApiKey: created.apiKey,
      keyHint: usageAwareMetadata.key_hint,
    }),
    upgraded: true,
  };
}

async function countApiUsageForRange(apiKey, rangeStart, rangeEnd) {
  if (!dependencies.isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Configure SUPABASE_URL and service role key first.");
  }

  const normalizedApiKey = ensureApiKeyHash(apiKey);
  const rangeStartIso = toIsoTimestamp(rangeStart, "rangeStart");
  const rangeEndIso = toIsoTimestamp(rangeEnd, "rangeEnd");
  const supabase = dependencies.getSupabaseClient();

  const { count, error } = await supabase
    .from(API_USAGE_LOG_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("api_key", normalizedApiKey)
    .gte("timestamp", rangeStartIso)
    .lt("timestamp", rangeEndIso);

  if (error) {
    throw new Error(`API usage count failed: ${error.message}`);
  }

  const normalizedCount = Number(count);
  return Number.isFinite(normalizedCount) && normalizedCount >= 0
    ? Math.round(normalizedCount)
    : 0;
}

async function logApiUsage({ apiKey, endpoint, timestamp }) {
  if (!dependencies.isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Configure SUPABASE_URL and service role key first.");
  }

  const payload = {
    api_key: ensureApiKeyHash(apiKey),
    endpoint: normalizeEndpoint(endpoint),
    timestamp: timestamp ? toIsoTimestamp(timestamp, "timestamp") : dependencies.now().toISOString(),
  };

  const supabase = dependencies.getSupabaseClient();
  const { error } = await supabase.from(API_USAGE_LOG_TABLE).insert(payload);

  if (error) {
    throw new Error(`API usage log failed: ${error.message}`);
  }

  return payload;
}

function setApiKeyServiceTestDependencies(overrides = {}) {
  const next = { ...dependencies };

  if (typeof overrides.getSupabaseClient === "function") {
    next.getSupabaseClient = overrides.getSupabaseClient;
  }

  if (typeof overrides.isSupabaseConfigured === "function") {
    next.isSupabaseConfigured = overrides.isSupabaseConfigured;
  }

  if (typeof overrides.now === "function") {
    next.now = overrides.now;
  }

  if (typeof overrides.randomBytes === "function") {
    next.randomBytes = overrides.randomBytes;
  }

  dependencies = next;
}

function resetApiKeyServiceForTests() {
  dependencies = { ...defaultDependencies };
}

module.exports = {
  API_KEY_PREFIX,
  RANDOM_SEGMENT_LENGTH,
  PLAN_USAGE_LIMITS,
  PLAN_EXPIRY_DAYS,
  maskApiKey,
  generateApiKey,
  hashApiKey,
  normalizePlanType,
  findApiKeyByRawValue,
  findLatestApiKeyByUserId,
  findLatestValidApiKeyByUserId,
  getOrCreateApiKeyForUser,
  regenerateApiKeyForUser,
  upgradeApiKeyPlanForUser,
  countApiUsageForRange,
  logApiUsage,
  isApiKeyExpired,
  __setApiKeyServiceTestDependencies: setApiKeyServiceTestDependencies,
  __resetApiKeyServiceForTests: resetApiKeyServiceForTests,
};
