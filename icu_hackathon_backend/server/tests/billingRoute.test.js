const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const apiKeyService = require("../services/apiKeyService");
const billingRouter = require("../routes/billing");

function createServer() {
  const app = express();
  app.use(express.json());
  app.use("/billing", billingRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve(server);
    });
  });
}

async function withServer(run) {
  const server = await createServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /billing/plans returns demo premium plans", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/billing/plans`);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.mode, "test");
    assert.equal(body.gateway, "razorpay_test");
    assert.equal(Array.isArray(body.plans), true);
    assert.equal(body.plans.length, 2);
    assert.equal(body.plans[0].amount_display, "$5");
    assert.equal(body.plans[1].amount_display, "$60");
  });
});

test("POST /billing/checkout validates user id", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/billing/checkout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        planCode: "premium_monthly",
      }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(String(body.error || ""), /userId is required/i);
  });
});

test("POST /billing/confirm activates premium key in test mode", async () => {
  const original = apiKeyService.upgradeApiKeyPlanForUser;
  let captured = null;

  apiKeyService.upgradeApiKeyPlanForUser = async (userId, planCode) => {
    captured = { userId, planCode };
    return {
      apiKey: "rapid_live_cccccccccccccccccccccccccccccccc",
      maskedApiKey: "rapid_live_xxxxxxxxcccc",
      metadata: {
        plan_type: planCode,
        usage_limit: 25000,
        usage_count: 0,
        created_at: "2026-04-11T00:00:00.000Z",
        expires_at: "2026-05-11T00:00:00.000Z",
      },
    };
  };

  try {
    await withServer(async (baseUrl) => {
      const checkout = await fetch(`${baseUrl}/billing/checkout`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId: "doctor-101",
          planCode: "premium_monthly",
          paymentGateway: "razorpay_test",
        }),
      });

      const checkoutBody = await checkout.json();
      const orderId = String(checkoutBody?.order?.id || "");
      assert.equal(checkout.status, 200);
      assert.match(orderId, /^order_test_/);

      const confirm = await fetch(`${baseUrl}/billing/confirm`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId: "doctor-101",
          planCode: "premium_monthly",
          orderId,
          razorpayPaymentId: "pay_test_manual_123",
          paymentGateway: "razorpay_test",
        }),
      });

      assert.equal(confirm.status, 200);
      const body = await confirm.json();
      assert.deepEqual(captured, { userId: "doctor-101", planCode: "premium_monthly" });
      assert.equal(body.status, "active");
      assert.equal(body.plan.code, "premium_monthly");
      assert.equal(body.api_key, "rapid_live_cccccccccccccccccccccccccccccccc");
      assert.equal(body.payment.gateway, "razorpay_test");
      assert.equal(body.payment.payment_id, "pay_test_manual_123");
    });
  } finally {
    apiKeyService.upgradeApiKeyPlanForUser = original;
  }
});
