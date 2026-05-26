const {
  findApiKeyByRawValue,
  isApiKeyExpired,
  countApiUsageForRange,
  logApiUsage,
} = require("../services/apiKeyService");

class ApiKeyAuthError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = "ApiKeyAuthError";
    this.statusCode = statusCode;
  }
}

function resolveLocalDevApiKey() {
  const configured = String(process.env.API_KEY || "").trim();
  if (!configured || /^your[_-]/i.test(configured)) {
    return "";
  }

  return configured;
}

function resolveLocalDevUserId() {
  const configured = String(process.env.LOCAL_API_USER_ID || "").trim();
  return configured || "local-dev-user";
}

function getHeaderApiKey(req) {
  const raw = req?.headers?.["x-api-key"];
  if (Array.isArray(raw)) {
    return String(raw[0] || "").trim();
  }

  return String(raw || "").trim();
}

function resolveUtcDayWindow(referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const day = referenceDate.getUTCDate();

  const startUtc = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));

  return {
    startUtc,
    endUtc,
  };
}

async function enforceDailyUsageLimitAndTrack(authContext, endpoint, timestamp = new Date()) {
  const usageLimit = Number(authContext?.usage_limit);
  const apiKeyHash = String(authContext?.api_key || "").trim();

  if (!apiKeyHash) {
    throw new Error("Missing API key hash in request auth context");
  }

  if (!Number.isFinite(usageLimit) || usageLimit < 0) {
    throw new Error("Invalid usage_limit for API key plan");
  }

  const { startUtc, endUtc } = resolveUtcDayWindow(timestamp);
  const dailyUsageCount = await countApiUsageForRange(apiKeyHash, startUtc, endUtc);

  if (dailyUsageCount >= usageLimit) {
    throw new ApiKeyAuthError("Daily usage limit exceeded for this API key", 429);
  }

  await logApiUsage({
    apiKey: apiKeyHash,
    endpoint,
    timestamp,
  });

  return dailyUsageCount + 1;
}

async function validateApiKey(req) {
  const providedApiKey = getHeaderApiKey(req);
  if (!providedApiKey) {
    throw new ApiKeyAuthError("Missing x-api-key header", 401);
  }

  const localDevApiKey = resolveLocalDevApiKey();
  if (localDevApiKey && providedApiKey === localDevApiKey) {
    const authContext = {
      api_key: "__local_dev_key__",
      user_id: resolveLocalDevUserId(),
      api_key_id: "local-dev",
      plan_type: "local-dev",
      usage_limit: Number.MAX_SAFE_INTEGER,
      skipUsageTracking: true,
    };

    req.authContext = authContext;
    req.user_id = authContext.user_id;
    return authContext;
  }

  const apiKeyRecord = await findApiKeyByRawValue(providedApiKey);
  if (!apiKeyRecord) {
    throw new ApiKeyAuthError("Invalid API key", 401);
  }

  if (!apiKeyRecord.is_active) {
    throw new ApiKeyAuthError("API key is inactive", 401);
  }

  if (isApiKeyExpired(apiKeyRecord)) {
    throw new ApiKeyAuthError("API key has expired", 401);
  }

  const authContext = {
    api_key: apiKeyRecord.api_key,
    user_id: String(apiKeyRecord.user_id),
    api_key_id: apiKeyRecord.id,
    plan_type: apiKeyRecord.plan_type,
    usage_limit: Number(apiKeyRecord.usage_limit),
  };

  req.authContext = authContext;
  req.user_id = authContext.user_id;

  return authContext;
}

async function apiKeyAuthMiddleware(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }

  const requestPath = String(req?.path || req?.originalUrl || "");
  if (requestPath.startsWith("/whatsapp/")) {
    return next();
  }

  try {
    const authContext = await validateApiKey(req);
    if (authContext.skipUsageTracking) {
      req.authContext = {
        ...authContext,
        daily_usage_count: null,
      };
      return next();
    }

    const endpoint = String(req?.path || req?.originalUrl || "/");
    const requestTimestamp = new Date();
    const currentDailyUsage = await enforceDailyUsageLimitAndTrack(authContext, endpoint, requestTimestamp);

    req.authContext = {
      ...authContext,
      daily_usage_count: currentDailyUsage,
    };

    return next();
  } catch (error) {
    if (error instanceof ApiKeyAuthError) {
      return res.status(error.statusCode).json({
        error: error.message,
      });
    }

    return res.status(500).json({
      error: error instanceof Error ? error.message : "API key validation failed",
    });
  }
}

module.exports = {
  validateApiKey,
  enforceDailyUsageLimitAndTrack,
  apiKeyAuthMiddleware,
};
