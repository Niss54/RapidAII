const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPlatformGuideContext,
  buildPlatformGuideReply,
} = require("../services/platformGuideKnowledge");

test("platform guide context includes README/presentation-trained snippets", () => {
  const context = buildPlatformGuideContext({
    transcript: "presentation and readme me voice features aur api docs batao",
  });

  const sources = Array.isArray(context?.knowledgeBase?.trainingSources)
    ? context.knowledgeBase.trainingSources.map((entry) => String(entry.source || ""))
    : [];

  assert.equal(sources.some((source) => /readme\.md$/i.test(source)), true);
  assert.equal(sources.some((source) => /presentation\.md$/i.test(source)), true);

  const snippets = Array.isArray(context?.knowledgeBase?.snippets) ? context.knowledgeBase.snippets : [];
  assert.equal(snippets.length > 0, true);
  assert.equal(
    snippets.some((snippet) => /voice|language|assistant|api/i.test(String(snippet?.text || ""))),
    true
  );

  assert.equal(Number(context?.knowledgeBase?.featureCatalog?.endpointCount) > 0, true);
  assert.equal(Array.isArray(context?.demoPatients?.patientIds), true);
  assert.equal(context?.demoPatients?.patientIds?.includes("901"), true);
});

test("platform guide fallback reply supports Assamese and Nepali language aliases", () => {
  const asReply = buildPlatformGuideReply({
    transcript: "api key kaise use karein",
    language: "as",
    normalizeLanguageFn: (value) => value,
  });

  const neReply = buildPlatformGuideReply({
    transcript: "developer api docs and endpoints",
    language: "ne",
    normalizeLanguageFn: (value) => value,
  });

  assert.equal(typeof asReply, "string");
  assert.equal(asReply.length > 0, true);
  assert.equal(typeof neReply, "string");
  assert.equal(neReply.length > 0, true);
});

test("platform guide provides short and long intro variants with realtime mention", () => {
  const shortReply = buildPlatformGuideReply({
    transcript: "rapid ai short intro do",
    language: "en",
    normalizeLanguageFn: (value) => value,
  });

  const longReply = buildPlatformGuideReply({
    transcript: "rapid ai long detailed intro do",
    language: "en",
    normalizeLanguageFn: (value) => value,
  });

  assert.equal(shortReply.length < longReply.length, true);
  assert.equal(/real[-\s]?time/i.test(shortReply), true);
  assert.equal(/real[-\s]?time/i.test(longReply), true);
});

test("platform guide patient demo reply includes trained patient IDs", () => {
  const reply = buildPlatformGuideReply({
    transcript: "demo patient data and pid batao",
    language: "hi",
    normalizeLanguageFn: (value) => value,
  });

  assert.equal(/901/.test(reply), true);
  assert.equal(/902/.test(reply), true);
  assert.equal(/903/.test(reply), true);
});
