const express = require("express");
const apiKeyService = require("../services/apiKeyService");
const razorpayService = require("../services/razorpayService");

const router = express.Router();
const SUPPORTED_GATEWAY = "razorpay_test";
const DEFAULT_CURRENCY = "INR";

const PLAN_CATALOG = Object.freeze([
  {
    code: "premium_monthly",
    name: "Premium Monthly",
    billingCycle: "monthly",
    amount: 499,
    currency: DEFAULT_CURRENCY,
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
    amount: 4999,
    currency: DEFAULT_CURRENCY,
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
  const normalized = String(value || SUPPORTED_GATEWAY).trim().toLowerCase();
  if (normalized !== SUPPORTED_GATEWAY) {
    throw new Error("Only razorpay_test gateway is supported");
  }

  return normalized;
}

function formatCurrencyDisplay(amount, currency) {
  const normalizedAmount = Number(amount);
  const normalizedCurrency = String(currency || DEFAULT_CURRENCY).trim().toUpperCase();

  if (!Number.isFinite(normalizedAmount)) {
    throw new Error("amount must be numeric");
  }

  const formatter = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });

  return `${normalizedCurrency} ${formatter.format(normalizedAmount)}`;
}

function toMinorUnits(amount) {
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error("amount must be a positive number");
  }

  return Math.round(normalizedAmount * 100);
}

function sanitizeNoteValue(value, maxLength = 64) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function buildReceipt(plan) {
  return `rapid_${plan.billingCycle}_${Date.now().toString(36)}`.slice(0, 40);
}

function buildOrderNotes(userId, plan) {
  return {
    user_id: sanitizeNoteValue(userId),
    plan_code: plan.code,
    billing_cycle: plan.billingCycle,
    product: "rapidai_premium_api",
  };
}

function buildPlanPayload(plan) {
  return {
    code: plan.code,
    name: plan.name,
    billing_cycle: plan.billingCycle,
    amount: plan.amount,
    amount_display: formatCurrencyDisplay(plan.amount, plan.currency),
    currency: plan.currency,
    usage_limit: plan.usageLimit,
    highlights: plan.highlights,
  };
}

function resolveOrderId(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error("orderId is required");
  }

  return normalized;
}

function resolvePaymentId(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error("razorpayPaymentId is required");
  }

  return normalized;
}

function resolveSignature(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error("razorpaySignature is required");
  }

  return normalized;
}

function assertOrderMatchesPlan(order, userId, plan) {
  const orderAmount = Number(order?.amount || 0);
  const expectedAmount = toMinorUnits(plan.amount);
  const orderCurrency = String(order?.currency || "").trim().toUpperCase();
  const orderNotes = order?.notes && typeof order.notes === "object" ? order.notes : {};
  const orderUserId = sanitizeNoteValue(orderNotes?.user_id || "");
  const orderPlanCode = String(orderNotes?.plan_code || "").trim().toLowerCase();

  if (orderAmount !== expectedAmount) {
    throw new Error("Checkout order amount does not match selected plan");
  }

  if (orderCurrency !== String(plan.currency || "").trim().toUpperCase()) {
    throw new Error("Checkout order currency does not match selected plan");
  }

  if (orderUserId !== sanitizeNoteValue(userId)) {
    throw new Error("Checkout order does not belong to this user");
  }

  if (orderPlanCode !== plan.code) {
    throw new Error("Checkout order does not match selected plan");
  }
}

function assertPaymentMatchesOrder(payment, orderId, plan) {
  const paymentOrderId = String(payment?.order_id || "").trim();
  const paymentStatus = String(payment?.status || "").trim().toLowerCase();
  const paymentAmount = Number(payment?.amount || 0);
  const paymentCurrency = String(payment?.currency || "").trim().toUpperCase();
  const expectedAmount = toMinorUnits(plan.amount);

  if (paymentOrderId !== orderId) {
    throw new Error("Payment does not belong to the provided order");
  }

  if (!["authorized", "captured"].includes(paymentStatus)) {
    throw new Error(`Razorpay payment is not successful yet (status: ${paymentStatus || "unknown"})`);
  }

  if (paymentAmount !== expectedAmount) {
    throw new Error("Payment amount does not match selected plan");
  }

  if (paymentCurrency !== String(plan.currency || "").trim().toUpperCase()) {
    throw new Error("Payment currency does not match selected plan");
  }
}

router.get("/plans", (_req, res) => {
  return res.status(200).json({
    gateway: SUPPORTED_GATEWAY,
    mode: "test",
    configured: razorpayService.isRazorpayConfigured(),
    plans: PLAN_CATALOG.map(buildPlanPayload),
  });
});

router.post("/checkout", async (req, res) => {
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
    if (!razorpayService.isRazorpayConfigured()) {
      return res.status(503).json({
        error: "Razorpay test credentials are missing on the server. Add them to .env and retry.",
      });
    }

    const receipt = buildReceipt(plan);
    const order = await razorpayService.createOrder({
      amountSubunits: toMinorUnits(plan.amount),
      currency: plan.currency,
      receipt,
      notes: buildOrderNotes(userId, plan),
    });

    return res.status(200).json({
      status: "created",
      mode: "test",
      user_id: userId,
      gateway,
      razorpay_key_id: razorpayService.getPublicKeyId(),
      order: {
        id: order.id,
        receipt: String(order?.receipt || receipt),
        amount: plan.amount,
        amount_subunits: Number(order?.amount || toMinorUnits(plan.amount)),
        amount_display: formatCurrencyDisplay(plan.amount, plan.currency),
        currency: String(order?.currency || plan.currency).trim().toUpperCase(),
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
    if (!razorpayService.isRazorpayConfigured()) {
      return res.status(503).json({
        error: "Razorpay test credentials are missing on the server. Add them to .env and retry.",
      });
    }

    const orderId = resolveOrderId(req?.body?.orderId || req?.body?.razorpayOrderId);
    const paymentId = resolvePaymentId(
      req?.body?.razorpayPaymentId || req?.body?.paymentId || req?.body?.paymentReference
    );
    const signature = resolveSignature(req?.body?.razorpaySignature || req?.body?.signature);

    razorpayService.verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
    });

    const [order, payment] = await Promise.all([
      razorpayService.fetchOrder(orderId),
      razorpayService.fetchPayment(paymentId),
    ]);

    assertOrderMatchesPlan(order, userId, plan);
    assertPaymentMatchesOrder(payment, orderId, plan);

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
        signature_verified: true,
        status: String(payment?.status || "").trim().toLowerCase() || "captured",
      },
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Could not confirm Razorpay payment",
    });
  }
});

module.exports = router;
