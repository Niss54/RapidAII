const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getSupportedLanguages,
  normalizeLanguage,
  getSarvamLanguageCandidates,
} = require("../services/sessionState");

test("session state exposes Assamese and Nepali in supported languages", () => {
  const supported = getSupportedLanguages();

  assert.equal(supported.includes("as"), true);
  assert.equal(supported.includes("ne"), true);
});

test("normalizeLanguage handles BCP-47 and language-name aliases", () => {
  assert.equal(normalizeLanguage("bn-IN"), "bn");
  assert.equal(normalizeLanguage("as-IN"), "as");
  assert.equal(normalizeLanguage("ne-NP"), "ne");
  assert.equal(normalizeLanguage("Assamese"), "as");
  assert.equal(normalizeLanguage("Oriya"), "or");
});

test("Sarvam language candidates include deterministic fallback chain", () => {
  const asCandidates = getSarvamLanguageCandidates("as");
  const neCandidates = getSarvamLanguageCandidates("ne");

  assert.deepEqual(asCandidates.slice(0, 4), ["as", "bn", "hi", "en"]);
  assert.deepEqual(neCandidates.slice(0, 3), ["ne", "hi", "en"]);
});

