const test = require("node:test");
const assert = require("node:assert/strict");

const apiKeyService = require("../services/apiKeyService");
const { validateApiKey, apiKeyAuthMiddleware } = require("../middleware/apiKeyAuth");

const originalHashSecret = process.env.API_KEY_HASH_SECRET;
process.env.API_KEY_HASH_SECRET = "test-secret";

function createInsertClient(onInsert) {
  return {
    from(table) {
      assert.equal(table, "api_keys");
      return {
        insert(payload) {
          onInsert(payload);
          return {
            select() {
              return {
                async single() {
                  return {
                    data: {
                      id: "key-1",
                      user_id: payload.user_id,
                      plan_type: payload.plan_type,
                      usage_limit: payload.usage_limit,
                      created_at: "2026-04-11T10:00:00.000Z",
                      expires_at: payload.expires_at,
                      is_active: payload.is_active,
                      key_hint: payload.key_hint,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function createLookupClient(expectedHash, row) {
  return {
    from(table) {
      assert.equal(table, "api_keys");
      return {
        select() {
          return {
            eq(column, value) {
              assert.equal(column, "api_key");
              assert.equal(value, expectedHash);
              return {
                async maybeSingle() {
                  return {
                    data: row,
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

function createLookupAndUsageClient({ expectedHash, row, dailyUsageCount = 0, onUsageInsert }) {
  return {
    from(table) {
      if (table === "api_keys") {
        return {
          select() {
            return {
              eq(column, value) {
                assert.equal(column, "api_key");
                assert.equal(value, expectedHash);
                return {
                  async maybeSingle() {
                    return {
                      data: row,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "api_usage_logs") {
        return {
          select() {
            return {
              eq(column, value) {
                assert.equal(column, "api_key");
                assert.equal(value, expectedHash);
                return {
                  gte(gteColumn) {
                    assert.equal(gteColumn, "timestamp");
                    return {
                      async lt(ltColumn) {
                        assert.equal(ltColumn, "timestamp");
                        return {
                          count: dailyUsageCount,
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          async insert(payload) {
            if (typeof onUsageInsert === "function") {
              onUsageInsert(payload);
            }

            return {
              error: null,
            };
          },
        };
      }

      throw new Error(`Unexpected table access: ${table}`);
    },
  };
}

function createMockResponse() {
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  return response;
}

test.afterEach(() => {
  apiKeyService.__resetApiKeyServiceForTests();
});

test.after(() => {
  if (originalHashSecret === undefined) {
    delete process.env.API_KEY_HASH_SECRET;
    return;
  }

  process.env.API_KEY_HASH_SECRET = originalHashSecret;
});

test("generateApiKey stores hash and returns raw key once", async () => {
  let insertedPayload = null;

  apiKeyService.__setApiKeyServiceTestDependencies({
    isSupabaseConfigured: () => true,
    getSupabaseClient: () =>
      createInsertClient((payload) => {
        insertedPayload = payload;
      }),
    now: () => new Date("2026-04-11T00:00:00.000Z"),
    randomBytes: (size) => Buffer.alloc(size, 0xab),
  });

  const result = await apiKeyService.generateApiKey("user-7", "pro");

  assert.match(result.apiKey, /^rapid_live_[a-f0-9]{32}$/);
  assert.equal(result.apiKey.length, "rapid_live_".length + 32);
  assert.ok(insertedPayload, "insert payload should be captured");
  assert.notEqual(insertedPayload.api_key, result.apiKey, "database value must be hashed");
  assert.equal(String(insertedPayload.key_hint || "").length, 4);
  assert.equal(insertedPayload.plan_type, "pro");
  assert.equal(result.metadata.user_id, "user-7");
  assert.equal(result.metadata.plan_type, "pro");
  assert.equal(result.metadata.key_hint, insertedPayload.key_hint);
});

test("generateApiKey supports premium monthly and yearly plan types", async () => {
  const insertedPlans = [];

  apiKeyService.__setApiKeyServiceTestDependencies({
    isSupabaseConfigured: () => true,
    getSupabaseClient: () =>
      createInsertClient((payload) => {
        insertedPlans.push(payload.plan_type);
      }),
    now: () => new Date("2026-04-11T00:00:00.000Z"),
    randomBytes: (size) => Buffer.alloc(size, 0xcd),
  });

  const monthly = await apiKeyService.generateApiKey("doctor-202", "premium_monthly");
  const yearly = await apiKeyService.generateApiKey("doctor-202", "premium_yearly");

  assert.equal(monthly.metadata.plan_type, "premium_monthly");
  assert.equal(yearly.metadata.plan_type, "premium_yearly");
  assert.deepEqual(insertedPlans, ["premium_monthly", "premium_yearly"]);
});

test("validateApiKey attaches user_id to request context", async () => {
  const rawApiKey = "rapid_live_0123456789abcdef0123456789abcdef";
  const expectedHash = apiKeyService.hashApiKey(rawApiKey);

  apiKeyService.__setApiKeyServiceTestDependencies({
    isSupabaseConfigured: () => true,
    getSupabaseClient: () =>
      createLookupClient(expectedHash, {
        id: "key-9",
        user_id: "clinician-11",
        plan_type: "hospital",
        usage_limit: 500000,
        created_at: "2026-04-11T00:00:00.000Z",
        expires_at: "2026-05-11T00:00:00.000Z",
        is_active: true,
      }),
    now: () => new Date("2026-04-15T00:00:00.000Z"),
  });

  const req = {
    headers: {
      "x-api-key": rawApiKey,
    },
  };

  const context = await validateApiKey(req);

  assert.equal(context.user_id, "clinician-11");
  assert.equal(req.user_id, "clinician-11");
  assert.equal(req.authContext.plan_type, "hospital");
});

test("validateApiKey rejects when header is missing", async () => {
  await assert.rejects(
    () => validateApiKey({ headers: {} }),
    (error) => error && error.statusCode === 401 && /missing x-api-key/i.test(error.message)
  );
});

test("validateApiKey rejects expired key", async () => {
  const rawApiKey = "rapid_live_fedcba9876543210fedcba9876543210";
  const expectedHash = apiKeyService.hashApiKey(rawApiKey);

  apiKeyService.__setApiKeyServiceTestDependencies({
    isSupabaseConfigured: () => true,
    getSupabaseClient: () =>
      createLookupClient(expectedHash, {
        id: "key-10",
        user_id: "clinician-22",
        plan_type: "free",
        usage_limit: 1000,
        created_at: "2026-01-01T00:00:00.000Z",
        expires_at: "2026-01-31T00:00:00.000Z",
        is_active: true,
      }),
    now: () => new Date("2026-04-15T00:00:00.000Z"),
  });

  await assert.rejects(
    () =>
      validateApiKey({
        headers: {
          "x-api-key": rawApiKey,
        },
      }),
    (error) => error && error.statusCode === 401 && /expired/i.test(error.message)
  );
});

test("apiKeyAuthMiddleware tracks usage and allows request under daily limit", async () => {
  const rawApiKey = "rapid_live_11111111111111111111111111111111";
  const expectedHash = apiKeyService.hashApiKey(rawApiKey);
  let insertedUsagePayload = null;
  let nextCalled = false;

  apiKeyService.__setApiKeyServiceTestDependencies({
    isSupabaseConfigured: () => true,
    getSupabaseClient: () =>
      createLookupAndUsageClient({
        expectedHash,
        row: {
          id: "key-allow",
          api_key: expectedHash,
          user_id: "clinician-30",
          plan_type: "free",
          usage_limit: 1000,
          created_at: "2026-04-11T00:00:00.000Z",
          expires_at: "2026-05-11T00:00:00.000Z",
          is_active: true,
        },
        dailyUsageCount: 14,
        onUsageInsert: (payload) => {
          insertedUsagePayload = payload;
        },
      }),
    now: () => new Date("2026-04-15T08:05:00.000Z"),
  });

  const req = {
    method: "POST",
    path: "/telemetry/update",
    headers: {
      "x-api-key": rawApiKey,
    },
  };
  const res = createMockResponse();

  await apiKeyAuthMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
  assert.ok(insertedUsagePayload, "usage payload should be inserted");
  assert.equal(insertedUsagePayload.api_key, expectedHash);
  assert.equal(insertedUsagePayload.endpoint, "/telemetry/update");
  assert.match(String(insertedUsagePayload.timestamp || ""), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(req.authContext.daily_usage_count, 15);
});

test("apiKeyAuthMiddleware rejects request when daily limit is exceeded", async () => {
  const rawApiKey = "rapid_live_22222222222222222222222222222222";
  const expectedHash = apiKeyService.hashApiKey(rawApiKey);
  let usageInsertCount = 0;
  let nextCalled = false;

  apiKeyService.__setApiKeyServiceTestDependencies({
    isSupabaseConfigured: () => true,
    getSupabaseClient: () =>
      createLookupAndUsageClient({
        expectedHash,
        row: {
          id: "key-block",
          api_key: expectedHash,
          user_id: "clinician-31",
          plan_type: "free",
          usage_limit: 1000,
          created_at: "2026-04-11T00:00:00.000Z",
          expires_at: "2026-05-11T00:00:00.000Z",
          is_active: true,
        },
        dailyUsageCount: 1000,
        onUsageInsert: () => {
          usageInsertCount += 1;
        },
      }),
    now: () => new Date("2026-04-15T08:10:00.000Z"),
  });

  const req = {
    method: "POST",
    path: "/voice/query",
    headers: {
      "x-api-key": rawApiKey,
    },
  };
  const res = createMockResponse();

  await apiKeyAuthMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 429);
  assert.match(String(res.body?.error || ""), /daily usage limit exceeded/i);
  assert.equal(usageInsertCount, 0);
});
