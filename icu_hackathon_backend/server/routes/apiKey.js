const express = require("express");
const apiKeyService = require("../services/apiKeyService");

const router = express.Router();
const PAID_PLAN_TYPES = new Set(["premium_monthly", "premium_yearly"]);

const PLAN_ALIASES = Object.freeze({
  monthly: "premium_monthly",
  month: "premium_monthly",
  premium: "premium_monthly",
  premium_monthly: "premium_monthly",
  yearly: "premium_yearly",
  year: "premium_yearly",
  annual: "premium_yearly",
  premium_yearly: "premium_yearly",
});

function normalizeBillingCycle(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "year" || normalized === "annual") {
    return "yearly";
  }

  if (normalized === "month") {
    return "monthly";
  }

  return normalized === "yearly" ? "yearly" : "monthly";
}

function resolvePaidPlanType(planType, billingCycle) {
  const raw = String(planType || "").trim().toLowerCase();
  const normalized = PLAN_ALIASES[raw] || raw;

  if (normalized) {
    const validated = apiKeyService.normalizePlanType(normalized);
    if (!PAID_PLAN_TYPES.has(validated)) {
      throw new Error("planType must be premium_monthly or premium_yearly");
    }

    return validated;
  }

  return billingCycle === "yearly" ? "premium_yearly" : "premium_monthly";
}

function resolvePaymentGateway(value) {
  const normalized = String(value || "razorpay_test").trim().toLowerCase();
  if (!normalized) {
    return "razorpay_test";
  }

  if (normalized !== "razorpay_test") {
    throw new Error("Only razorpay_test gateway is supported in demo mode");
  }

  return normalized;
}

function resolveUserId(req) {
  const fromBody = String(req?.body?.userId || "").trim();
  if (fromBody) {
    return fromBody;
  }

  const fromContext = String(req?.user_id || req?.authContext?.user_id || "").trim();
  if (fromContext) {
    return fromContext;
  }

  const headerValue = req?.headers?.["x-user-id"];
  const fromHeader = Array.isArray(headerValue)
    ? String(headerValue[0] || "").trim()
    : String(headerValue || "").trim();

  if (fromHeader) {
    return fromHeader;
  }

  return String(req?.query?.userId || "").trim();
}

function buildMetadataPayload(metadata) {
  return {
    user_id: metadata.user_id,
    plan_type: metadata.plan_type,
    usage_limit: metadata.usage_limit,
    usage_count: Number(metadata.usage_count || 0),
    created_at: metadata.created_at,
    expires_at: metadata.expires_at,
    is_active: metadata.is_active,
  };
}

router.get("/my-key", async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(400).json({
        error: "userId is required. Provide x-user-id header or userId query parameter.",
      });
    }

    const result = await apiKeyService.getOrCreateApiKeyForUser(userId);

    return res.status(200).json({
      ...buildMetadataPayload(result.metadata),
      api_key_masked: result.maskedApiKey,
      auto_created: result.autoCreated,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not resolve API key",
    });
  }
});

router.post("/regenerate", async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(400).json({
        error: "userId is required. Provide x-user-id header or userId query parameter.",
      });
    }

    const result = await apiKeyService.regenerateApiKeyForUser(userId);

    return res.status(200).json({
      ...buildMetadataPayload(result.metadata),
      api_key_masked: result.maskedApiKey,
      api_key: result.apiKey,
      regenerated: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not regenerate API key",
    });
  }
});

router.post("/upgrade", async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(400).json({
        error: "userId is required. Provide x-user-id header or userId query parameter.",
      });
    }

    const billingCycle = normalizeBillingCycle(req?.body?.billingCycle || req?.body?.cycle);
    const planType = resolvePaidPlanType(req?.body?.planType || req?.body?.planCode, billingCycle);
    const paymentGateway = resolvePaymentGateway(req?.body?.paymentGateway || req?.body?.gateway);
    const paymentReferenceInput = String(
      req?.body?.paymentReference || req?.body?.razorpayPaymentId || req?.body?.paymentId || ""
    ).trim();
    const paymentReference = paymentReferenceInput || `pay_test_${Date.now()}`;

    const result = await apiKeyService.upgradeApiKeyPlanForUser(userId, planType);

    return res.status(200).json({
      ...buildMetadataPayload(result.metadata),
      api_key_masked: result.maskedApiKey,
      api_key: result.apiKey,
      upgraded: true,
      billing_cycle: planType === "premium_yearly" ? "yearly" : "monthly",
      payment: {
        gateway: paymentGateway,
        mode: "test",
        reference: paymentReference,
      },
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Could not upgrade API key plan",
    });
  }
});

module.exports = router;
