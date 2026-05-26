const test = require("node:test");
const assert = require("node:assert/strict");

const { processVoiceQuery } = require("../services/voiceController");

test("voice controller applies strict language instruction without misclassifying intent", async () => {
  const response = await processVoiceQuery({
    text: "status of patient 203 [System instruction: Reply strictly in Assamese language only, using native script.]",
    language: "bn",
    userId: "test-assamese-session",
  });

  assert.equal(response.intent, "PATIENT_STATUS");
  assert.equal(response.patientId, "203");
  assert.equal(response.language, "as");
  assert.equal(response.transcript.includes("System instruction"), false);
});

test("platform guide path keeps strict Nepali language preference in response metadata", async () => {
  const response = await processVoiceQuery({
    text: "rapid ai ke features aur readme overview batao [System instruction: Reply strictly in Nepali language only, using native script.]",
    language: "hi",
    userId: "test-nepali-session",
  });

  assert.equal(response.intent, "PLATFORM_GUIDE");
  assert.equal(response.language, "ne");
  assert.equal(response.responseText.length > 0, true);
});

test("trained demo patient returns detailed condition for pid 901", async () => {
  const response = await processVoiceQuery({
    text: "status of patient 901",
    language: "en",
    userId: "test-trained-patient-901",
  });

  assert.equal(response.intent, "PATIENT_STATUS");
  assert.equal(response.patientId, "901");
  assert.equal(/sepsis/i.test(response.responseText), true);
  assert.equal(/recommended action/i.test(response.responseText), true);
});

test("platform guide provides short vs long intro variants", async () => {
  const shortResponse = await processVoiceQuery({
    text: "rapid ai short intro do",
    language: "en",
    userId: "test-short-intro",
  });

  const longResponse = await processVoiceQuery({
    text: "rapid ai long detailed intro do",
    language: "en",
    userId: "test-long-intro",
  });

  assert.equal(shortResponse.intent, "PLATFORM_GUIDE");
  assert.equal(longResponse.intent, "PLATFORM_GUIDE");
  assert.equal(shortResponse.responseText.length < longResponse.responseText.length, true);
});
