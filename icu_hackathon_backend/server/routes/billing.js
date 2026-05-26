const crypto = require("node:crypto");
const express = require("express");
const apiKeyService = require("../services/apiKeyService");

const router = express.Router();
const DEMO_GATEWAY = "razorpay_test";

const PLAN_CATALOG = Object.freeze([
  {
    code: "premium_monthly",
    name: "Premium Monthly",
    billingCycle: "monthly",
    amountUsd: 5,
    usageLimit: apiKeyService.PLAN_USAGE_LIMITS.premium_monthly,
    highlights: [
      "25,000 API requests per day",
      "Access to telemetry, ICU, voice, forecast, and integration endpoints",
      "One-click API key rotation from dashboard",
    ],
  },
  {
    code: "premium_yearly",
    name: "Premium Yearly",
    billingCycle: "yearly",
    amountUsd: 60,
    usageLimit: apiKeyService.PLAN_USAGE_LIMITS.premium_yearly,
    highlights: [
      "25,000 API requests per day",
      "12-month API key validity window",
      "Lower annual billing overhead for production teams",
    ],
  },
]);

const PLAN_LOOKUP = PLAN_CATALOG.reduce((accumulator, plan) => {
  accumulator[plan.code] = plan;
  return accumulator;
}, {});

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

function resolvePlanCode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || !PLAN_LOOKUP[normalized]) {
    throw new Error("planCode must be premium_monthly or premium_yearly");
  }

  return normalized;
}

function resolveGateway(value) {
  const normalized = String(value || DEMO_GATEWAY).trim().toLowerCase();
  if (normalized !== DEMO_GATEWAY) {
    throw new Error("Only razorpay_test gateway is supported in demo mode");
  }

  return normalized;
}

function generateId(prefix) {
  const suffix = crypto.randomBytes(6).toString("hex");
  return `${prefix}_${Date.now()}_${suffix}`;
}

function buildPlanPayload(plan) {
  return {
    code: plan.code,
    name: plan.name,
    billing_cycle: plan.billingCycle,
    amount_usd: plan.amountUsd,
    amount_display: `$${plan.amountUsd}`,
    usage_limit: plan.usageLimit,
    highlights: plan.highlights,
  };
}

router.get("/plans", (_req, res) => {
  return res.status(200).json({
    gateway: DEMO_GATEWAY,
    mode: "test",
    plans: PLAN_CATALOG.map(buildPlanPayload),
  });
});

router.post("/checkout", (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(400).json({
        error: "userId is required. Provide x-user-id header, body userId, or userId query parameter.",
      });
    }

    const planCode = resolvePlanCode(req?.body?.planCode || req?.body?.planType);
    const gateway = resolveGateway(req?.body?.gateway || req?.body?.paymentGateway);
    const plan = PLAN_LOOKUP[planCode];
    const orderId = generateId("order_test");

    return res.status(200).json({
      status: "created",
      mode: "test",
      user_id: userId,
      gateway,
      razorpay_key_id: "rzp_test_rapid_dummy",
      order: {
        id: orderId,
        amount_usd: plan.amountUsd,
        amount_display: `$${plan.amountUsd}`,
        currency: "USD",
        plan_code: plan.code,
        billing_cycle: plan.billingCycle,
      },
      plan: buildPlanPayload(plan),
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Could not create checkout session",
    });
  }
});

router.post("/confirm", async (req, res) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(400).json({
        error: "userId is required. Provide x-user-id header, body userId, or userId query parameter.",
      });
    }

    const planCode = resolvePlanCode(req?.body?.planCode || req?.body?.planType);
    const gateway = resolveGateway(req?.body?.gateway || req?.body?.paymentGateway);
    const plan = PLAN_LOOKUP[planCode];

    const orderIdInput = String(req?.body?.orderId || "").trim();
    const orderId = orderIdInput || generateId("order_test");

    if (!orderId.startsWith("order_test_")) {
      return res.status(400).json({
        error: "Invalid orderId for test checkout",
      });
    }

    const paymentIdInput = String(
      req?.body?.razorpayPaymentId || req?.body?.paymentId || req?.body?.paymentReference || ""
    ).trim();
    const paymentId = paymentIdInput || generateId("pay_test");

    if (!paymentId.startsWith("pay_test_")) {
      return res.status(400).json({
        error: "Invalid test payment reference",
      });
    }

    const upgraded = await apiKeyService.upgradeApiKeyPlanForUser(userId, plan.code);

    return res.status(200).json({
      status: "active",
      mode: "test",
      user_id: userId,
      plan: buildPlanPayload(plan),
      api_key: upgraded.apiKey,
      api_key_masked: upgraded.maskedApiKey,
      usage: {
        usage_limit: Number(upgraded.metadata?.usage_limit || 0),
        usage_count: Number(upgraded.metadata?.usage_count || 0),
      },
      subscription: {
        plan_type: upgraded.metadata?.plan_type,
        created_at: upgraded.metadata?.created_at,
        expires_at: upgraded.metadata?.expires_at,
      },
      payment: {
        gateway,
        order_id: orderId,
        payment_id: paymentId,
      },
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Could not confirm demo payment",
    });
  }
});

module.exports = router;
