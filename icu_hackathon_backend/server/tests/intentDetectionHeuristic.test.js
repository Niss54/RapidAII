const test = require("node:test");
const assert = require("node:assert/strict");

const { detectIntent } = require("../services/llmService");

test("heuristic intent detection ignores strict system-instruction wrapper", async () => {
  const originalGroqKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;

  try {
    const result = await detectIntent(
      "status of patient 203 [System instruction: Reply strictly in Assamese language only, using native script.]"
    );

    assert.equal(result.intent, "PATIENT_STATUS");
    assert.equal(result.patientId, "203");
    assert.equal(result.language, null);
  } finally {
    if (originalGroqKey) {
      process.env.GROQ_API_KEY = originalGroqKey;
    } else {
      delete process.env.GROQ_API_KEY;
    }
  }
});

test("heuristic detects ICU summary for overall summary query without patient id", async () => {
  const originalGroqKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;

  try {
    const result = await detectIntent("give icu overall summary and snapshot");

    assert.equal(result.intent, "ICU_SUMMARY");
    assert.equal(result.patientId, null);
    assert.equal(result.asksForSummary, true);
  } finally {
    if (originalGroqKey) {
      process.env.GROQ_API_KEY = originalGroqKey;
    } else {
      delete process.env.GROQ_API_KEY;
    }
  }
});

test("heuristic keeps platform guide intent for features workflow style query", async () => {
  const originalGroqKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;

  try {
    const result = await detectIntent("rapid ai ke all features aur workflow kaise work karta hai");

    assert.equal(result.intent, "PLATFORM_GUIDE");
    assert.equal(result.patientId, null);
  } finally {
    if (originalGroqKey) {
      process.env.GROQ_API_KEY = originalGroqKey;
    } else {
      delete process.env.GROQ_API_KEY;
    }
  }
});
