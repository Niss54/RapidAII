const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const apiKeyService = require("../services/apiKeyService");
const apiKeyRouter = require("../routes/apiKey");

function createServer() {
  const app = express();
  app.use(express.json());
  app.use("/api-key", apiKeyRouter);
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

test("GET /api-key/my-key auto-creates first key and returns masked value", async () => {
  const original = apiKeyService.getOrCreateApiKeyForUser;
  let capturedUserId = null;

  apiKeyService.getOrCreateApiKeyForUser = async (userId) => {
    capturedUserId = userId;
    return {
      metadata: {
        user_id: userId,
        plan_type: "free",
        usage_limit: 1000,
        usage_count: 0,
        created_at: "2026-04-11T10:00:00.000Z",
        expires_at: "2026-05-11T10:00:00.000Z",
        is_active: true,
      },
      maskedApiKey: "rapid_live_xxxxxxxxabcd",
      autoCreated: true,
    };
  };

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api-key/my-key`, {
        headers: {
          "x-user-id": "doctor-101",
        },
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(capturedUserId, "doctor-101");
      assert.equal(body.user_id, "doctor-101");
      assert.equal(body.plan_type, "free");
      assert.equal(body.usage_limit, 1000);
      assert.equal(body.usage_count, 0);
      assert.equal(body.auto_created, true);
      assert.equal(body.api_key_masked, "rapid_live_xxxxxxxxabcd");
    });
  } finally {
    apiKeyService.getOrCreateApiKeyForUser = original;
  }
});

test("GET /api-key/my-key returns 400 when user id is missing", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api-key/my-key`);

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(String(body.error || ""), /userId is required/i);
  });
});

test("POST /api-key/regenerate returns new key metadata and raw key", async () => {
  const original = apiKeyService.regenerateApiKeyForUser;
  let capturedUserId = null;

  apiKeyService.regenerateApiKeyForUser = async (userId) => {
    capturedUserId = userId;
    return {
      apiKey: "rapid_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      metadata: {
        user_id: userId,
        plan_type: "free",
        usage_limit: 1000,
        usage_count: 0,
        created_at: "2026-04-11T12:00:00.000Z",
        expires_at: "2026-05-11T12:00:00.000Z",
        is_active: true,
      },
      maskedApiKey: "rapid_live_xxxxxxxxaaaa",
      regenerated: true,
    };
  };

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api-key/regenerate`, {
        method: "POST",
        headers: {
          "x-user-id": "doctor-101",
        },
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(capturedUserId, "doctor-101");
      assert.equal(body.user_id, "doctor-101");
      assert.equal(body.plan_type, "free");
      assert.equal(body.usage_limit, 1000);
      assert.equal(body.usage_count, 0);
      assert.equal(body.api_key_masked, "rapid_live_xxxxxxxxaaaa");
      assert.equal(body.api_key, "rapid_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      assert.equal(body.regenerated, true);
    });
  } finally {
    apiKeyService.regenerateApiKeyForUser = original;
  }
});

test("POST /api-key/regenerate returns 400 when user id is missing", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api-key/regenerate`, {
      method: "POST",
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(String(body.error || ""), /userId is required/i);
  });
});

test("POST /api-key/upgrade returns upgraded key for premium plan", async () => {
  const original = apiKeyService.upgradeApiKeyPlanForUser;
  let captured = null;

  apiKeyService.upgradeApiKeyPlanForUser = async (userId, planType) => {
    captured = { userId, planType };
    return {
      apiKey: "rapid_live_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      metadata: {
        user_id: userId,
        plan_type: planType,
        usage_limit: 25000,
        usage_count: 0,
        created_at: "2026-04-11T12:00:00.000Z",
        expires_at: "2027-04-11T12:00:00.000Z",
        is_active: true,
      },
      maskedApiKey: "rapid_live_xxxxxxxxbbbb",
      upgraded: true,
    };
  };

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api-key/upgrade`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "doctor-101",
        },
        body: JSON.stringify({
          planType: "premium_yearly",
          paymentGateway: "razorpay_test",
          paymentReference: "pay_test_123",
        }),
      });

      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(captured, { userId: "doctor-101", planType: "premium_yearly" });
      assert.equal(body.plan_type, "premium_yearly");
      assert.equal(body.usage_limit, 25000);
      assert.equal(body.api_key, "rapid_live_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
      assert.equal(body.upgraded, true);
      assert.equal(body.payment.gateway, "razorpay_test");
    });
  } finally {
    apiKeyService.upgradeApiKeyPlanForUser = original;
  }
});

test("POST /api-key/upgrade rejects non-premium plans", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api-key/upgrade`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "doctor-101",
      },
      body: JSON.stringify({
        planType: "free",
        paymentGateway: "razorpay_test",
      }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(String(body.error || ""), /premium_monthly or premium_yearly/i);
  });
});
