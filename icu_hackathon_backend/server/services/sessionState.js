const SUPPORTED_LANGUAGES = ["en", "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur", "or", "as", "ne"];

const LANGUAGE_ALIASES = Object.freeze({
  english: "en",
  hindi: "hi",
  bengali: "bn",
  bangla: "bn",
  tamil: "ta",
  telugu: "te",
  marathi: "mr",
  gujarati: "gu",
  kannada: "kn",
  malayalam: "ml",
  punjabi: "pa",
  urdu: "ur",
  odia: "or",
  oriya: "or",
  assamese: "as",
  nepali: "ne",
  "en-in": "en",
  "hi-in": "hi",
  "bn-in": "bn",
  "ta-in": "ta",
  "te-in": "te",
  "mr-in": "mr",
  "gu-in": "gu",
  "kn-in": "kn",
  "ml-in": "ml",
  "pa-in": "pa",
  "ur-in": "ur",
  "or-in": "or",
  "as-in": "as",
  "ne-np": "ne",
});

const LANGUAGE_FALLBACK_ORDER = Object.freeze({
  as: ["bn", "hi", "en"],
  ne: ["hi", "en"],
  or: ["hi", "en"],
  ur: ["hi", "en"],
});

let activeLanguage = "en";
let languageBySession = new Map();
let introSpokenBySession = new Set();
let conversationHistoryBySession = new Map();
let activeAlert = {
  isActive: false,
  patientId: null,
  message: null,
  language: "en",
  untilMs: 0,
};

function normalizeSessionKey(sessionId) {
  const normalized = String(sessionId || "global").trim();
  return normalized.length > 0 ? normalized : "global";
}

function normalizeLanguage(language) {
  const normalized = String(language || "en").trim().toLowerCase();

  if (SUPPORTED_LANGUAGES.includes(normalized)) {
    return normalized;
  }

  if (LANGUAGE_ALIASES[normalized]) {
    return LANGUAGE_ALIASES[normalized];
  }

  const compact = normalized.replace(/\s+/g, "");
  if (LANGUAGE_ALIASES[compact]) {
    return LANGUAGE_ALIASES[compact];
  }

  const baseCode = compact.split(/[-_]/)[0];
  if (SUPPORTED_LANGUAGES.includes(baseCode)) {
    return baseCode;
  }

  if (LANGUAGE_ALIASES[baseCode]) {
    return LANGUAGE_ALIASES[baseCode];
  }

  return "en";
}

function getLanguage(sessionId) {
  if (!sessionId) {
    return activeLanguage;
  }

  return languageBySession.get(normalizeSessionKey(sessionId)) || activeLanguage;
}

function setLanguage(language, sessionId) {
  const normalized = normalizeLanguage(language);

  if (!sessionId) {
    activeLanguage = normalized;
    return activeLanguage;
  }

  const key = normalizeSessionKey(sessionId);
  languageBySession.set(key, normalized);

  if (languageBySession.size > 1000) {
    const oldestKey = languageBySession.keys().next().value;
    if (oldestKey) {
      languageBySession.delete(oldestKey);
    }
  }

  return normalized;
}

function getSupportedLanguages() {
  return [...SUPPORTED_LANGUAGES];
}

function getSarvamLanguageCandidates(language) {
  const normalized = normalizeLanguage(language);
  const languageSpecificFallbacks = LANGUAGE_FALLBACK_ORDER[normalized] || [];

  return Array.from(new Set([normalized, ...languageSpecificFallbacks, "en", "hi"]));
}

function shouldSpeakIntroduction(sessionId) {
  const key = normalizeSessionKey(sessionId);

  if (introSpokenBySession.has(key)) {
    return false;
  }

  introSpokenBySession.add(key);

  // Keep session cache bounded for long-running processes.
  if (introSpokenBySession.size > 1000) {
    const oldestKey = introSpokenBySession.values().next().value;
    if (oldestKey) {
      introSpokenBySession.delete(oldestKey);
    }
  }

  return true;
}

function resetIntroduction(sessionId) {
  if (!sessionId) {
    introSpokenBySession = new Set();
    languageBySession = new Map();
    conversationHistoryBySession = new Map();
    activeLanguage = "en";
    return;
  }

  const key = normalizeSessionKey(sessionId);
  introSpokenBySession.delete(key);
  languageBySession.delete(key);
  conversationHistoryBySession.delete(key);
}

function appendConversationTurn(sessionId, turn) {
  const key = normalizeSessionKey(sessionId);
  const current = conversationHistoryBySession.get(key) || [];

  const normalizedTurn = {
    role: String(turn?.role || "user").trim() || "user",
    text: String(turn?.text || "").trim(),
    intent: turn?.intent ? String(turn.intent) : null,
    emotion: turn?.emotion ? String(turn.emotion) : null,
    language: normalizeLanguage(turn?.language || getLanguage(key)),
    createdAt: new Date().toISOString(),
  };

  if (!normalizedTurn.text) {
    return;
  }

  const next = [...current, normalizedTurn].slice(-20);
  conversationHistoryBySession.set(key, next);

  if (conversationHistoryBySession.size > 1000) {
    const oldestKey = conversationHistoryBySession.keys().next().value;
    if (oldestKey) {
      conversationHistoryBySession.delete(oldestKey);
    }
  }
}

function getConversationHistory(sessionId, limit = 8) {
  const key = normalizeSessionKey(sessionId);
  const history = conversationHistoryBySession.get(key) || [];
  const safeLimit = Math.max(1, Number(limit) || 8);
  return history.slice(-safeLimit);
}

function activateAlertMode({ patientId, message, language, durationMs = 18000 }) {
  activeAlert = {
    isActive: true,
    patientId: patientId ? String(patientId) : null,
    message: message ? String(message) : null,
    language: normalizeLanguage(language || getLanguage()),
    untilMs: Date.now() + Math.max(3000, Number(durationMs) || 18000),
  };

  return getAlertMode();
}

function clearAlertMode() {
  activeAlert = {
    isActive: false,
    patientId: null,
    message: null,
    language: activeLanguage,
    untilMs: 0,
  };
}

function getAlertMode() {
  if (!activeAlert.isActive) {
    return { active: false };
  }

  if (Date.now() > activeAlert.untilMs) {
    clearAlertMode();
    return { active: false };
  }

  return {
    active: true,
    patientId: activeAlert.patientId,
    message: activeAlert.message,
    language: activeAlert.language,
    remainingMs: Math.max(0, activeAlert.untilMs - Date.now()),
  };
}

module.exports = {
  getLanguage,
  setLanguage,
  normalizeLanguage,
  getSupportedLanguages,
  getSarvamLanguageCandidates,
  shouldSpeakIntroduction,
  resetIntroduction,
  appendConversationTurn,
  getConversationHistory,
  activateAlertMode,
  clearAlertMode,
  getAlertMode,
};
