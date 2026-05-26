const Groq = require("groq-sdk");
const { normalizeLanguage, getSupportedLanguages } = require("./sessionState");
const { isPlatformGuideQuery } = require("./platformGuideKnowledge");

const SUPPORTED_LANGUAGES = getSupportedLanguages();
const SUPPORTED_INTENTS = [
  "PATIENT_STATUS",
  "ICU_SUMMARY",
  "LANGUAGE_SWITCH",
  "PLATFORM_GUIDE",
  "GENERAL_QUERY",
];
const SUPPORTED_EMOTIONS = ["CALM", "ANXIOUS", "DISTRESSED", "ANGRY", "SAD", "NEUTRAL"];

const LANGUAGE_LABELS = {
  en: "English",
  hi: "Hindi",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  gu: "Gujarati",
  kn: "Kannada",
  ml: "Malayalam",
  pa: "Punjabi",
  ur: "Urdu",
  or: "Odia",
  as: "Assamese",
  ne: "Nepali",
};

const INTENT_SCHEMA = {
  intent: SUPPORTED_INTENTS.join(" | "),
  patientId: "string | null",
  language: `${SUPPORTED_LANGUAGES.join(" | ")} | null`,
  emotion: `${SUPPORTED_EMOTIONS.join(" | ")}`,
  asksForSummary: "boolean",
};

const LANGUAGE_KEYWORDS = {
  en: ["english", "angrezi", "अंग्रेजी"],
  hi: ["hindi", "हिंदी", "हिन्दी"],
  bn: ["bengali", "bangla", "বাংলা"],
  ta: ["tamil", "தமிழ்"],
  te: ["telugu", "తెలుగు"],
  mr: ["marathi", "मराठी"],
  gu: ["gujarati", "ગુજરાતી"],
  kn: ["kannada", "ಕನ್ನಡ"],
  ml: ["malayalam", "മലയാളം"],
  pa: ["punjabi", "ਪੰਜਾਬੀ"],
  ur: ["urdu", "اردو"],
  or: ["odia", "oriya", "ଓଡ଼ିଆ"],
  as: ["assamese", "অসমীয়া", "অসমিয়া"],
  ne: ["nepali", "नेपाली"],
};

const PATIENT_ID_STOPWORDS = new Set([
  "ka",
  "ke",
  "ki",
  "hai",
  "ho",
  "hu",
  "haan",
  "nah",
  "nahi",
  "please",
  "plz",
  "the",
  "this",
  "that",
  "and",
  "for",
  "with",
]);

const WELLBEING_QUERY_PATTERN =
  /random|joke|motivat|anxious|scared|stress|tense|panic|help me|what should i do|tips|calm|cope|burnout|overwhelmed|pareshan|pressan|tension|ghabra|rote|cry|helpless|how to stay calm/i;

function stripSystemInstruction(commandText) {
  const raw = String(commandText || "");
  return raw
    .replace(/\[\s*system\s+instruction\s*:[\s\S]*?\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizePatientId(rawValue) {
  if (!rawValue) {
    return null;
  }

  const normalized = String(rawValue)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  if (!normalized || normalized.length < 2) {
    return null;
  }

  if (PATIENT_ID_STOPWORDS.has(normalized)) {
    return null;
  }

  if (/^[a-z]+$/.test(normalized) && normalized.length <= 3) {
    return null;
  }

  return normalized;
}

function extractPatientIdFromText(commandText) {
  const text = String(commandText || "").toLowerCase();

  const numericMatch = text.match(
    /(?:patient|pt|mrn|pid|id|मरीज|रोगी)\s*(?:number|num|no\.?)*\s*[:#-]?\s*([0-9]{2,8})\b/i
  );
  if (numericMatch) {
    return sanitizePatientId(numericMatch[1]);
  }

  const genericMatch = text.match(
    /(?:patient|pt|mrn|pid|id|मरीज|रोगी)\s*(?:number|num|no\.?)*\s*[:#-]?\s*([a-z0-9_-]{2,20})\b/i
  );

  return genericMatch ? sanitizePatientId(genericMatch[1]) : null;
}

function detectLanguageFromText(text) {
  for (const [code, keywords] of Object.entries(LANGUAGE_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return code;
    }
  }

  return null;
}

function detectIntentHeuristic(commandText) {
  const text = stripSystemInstruction(commandText).toLowerCase();
  const patientId = extractPatientIdFromText(text);

  const emotion = detectEmotionHeuristic(text);
  const wantsLanguageSwitch =
    /switch|change|speak in|talk in|respond in|translate/.test(text) ||
    /भाषा|बदल|bol|bolo/.test(text);

  const requestedLanguage = detectLanguageFromText(text);

  if (wantsLanguageSwitch && requestedLanguage) {
    return {
      intent: "LANGUAGE_SWITCH",
      patientId: null,
      language: normalizeLanguage(requestedLanguage),
      emotion,
      asksForSummary: false,
    };
  }

  const asksForSummary =
    /summary|overview|brief|total|all patients|all patient|ward|icu|overall|snapshot|unit|census|सारांश|ओवरव्यू|कुल/.test(
      text
    );
  const asksPatientDetails =
    /status|condition|risk|detail|details|report|oxygen|spo2|heart|bp|temperature|vitals|रिपोर्ट|स्थिति|हाल/.test(
      text
    ) || (/patient|pt|pid|mrn|मरीज|रोगी/.test(text) && /summary|सारांश/.test(text));

  if (asksForSummary && !patientId) {
    return {
      intent: "ICU_SUMMARY",
      patientId: null,
      language: requestedLanguage ? normalizeLanguage(requestedLanguage) : null,
      emotion,
      asksForSummary: true,
    };
  }

  if (WELLBEING_QUERY_PATTERN.test(text)) {
    return {
      intent: "GENERAL_QUERY",
      patientId,
      language: requestedLanguage ? normalizeLanguage(requestedLanguage) : null,
      emotion,
      asksForSummary,
    };
  }

  if (isPlatformGuideQuery(text)) {
    return {
      intent: "PLATFORM_GUIDE",
      patientId: null,
      language: requestedLanguage ? normalizeLanguage(requestedLanguage) : null,
      emotion,
      asksForSummary: false,
    };
  }

  if (asksPatientDetails) {
    return {
      intent: "PATIENT_STATUS",
      patientId,
      language: requestedLanguage ? normalizeLanguage(requestedLanguage) : null,
      emotion,
      asksForSummary,
    };
  }

  if (/icu|ward|overall|all patients|all patient|brief|summary|snapshot/.test(text) && !patientId) {
    return {
      intent: "ICU_SUMMARY",
      patientId: null,
      language: requestedLanguage ? normalizeLanguage(requestedLanguage) : null,
      emotion,
      asksForSummary: true,
    };
  }

  return {
    intent: "GENERAL_QUERY",
    patientId,
    language: requestedLanguage ? normalizeLanguage(requestedLanguage) : null,
    emotion,
    asksForSummary,
  };
}

function detectEmotionHeuristic(text) {
  const source = String(text || "").toLowerCase();

  if (/panic|pareshan|pressan|bahut tension|rote|cry|helpless|ghabra|घबर|रो|डर/.test(source)) {
    return "DISTRESSED";
  }

  if (/anxious|worry|worried|stress|tense|uncertain|चिंता|फिकर|तनाव/.test(source)) {
    return "ANXIOUS";
  }

  if (/angry|frustrated|gussa|naraz|annoyed/.test(source)) {
    return "ANGRY";
  }

  if (/sad|upset|dukhi|udaas/.test(source)) {
    return "SAD";
  }

  if (/thanks|thank you|shukriya|good|great|ok|ठीक/.test(source)) {
    return "CALM";
  }

  return "NEUTRAL";
}

async function detectIntent(commandText) {
  const cleanedCommandText = stripSystemInstruction(commandText);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return detectIntentHeuristic(cleanedCommandText);
  }

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const groq = new Groq({ apiKey });

  let completion;
  try {
    completion = await groq.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `You are an ICU voice intent detector. Return strict JSON with fields: intent, patientId, language, emotion, asksForSummary.
Use intents only from: ${SUPPORTED_INTENTS.join(", ")}.
Supported language codes: ${SUPPORTED_LANGUAGES.join(", ")}.
Emotion labels allowed: ${SUPPORTED_EMOTIONS.join(", ")}.
Rules:
- If user asks patient specific details, choose PATIENT_STATUS.
- If user asks overall unit/ward/ICU counts or summary, choose ICU_SUMMARY.
- If user asks to change language, choose LANGUAGE_SWITCH.
- If user asks about Rapid AI features, website usage, API docs, API key, developer usage, hospital integration, WhatsApp alerts, or uniqueness in market, choose PLATFORM_GUIDE.
- For greetings, free talk, motivation, complaints, or mixed queries, choose GENERAL_QUERY.
- Extract patientId even from "pid 202" style mentions when possible.
- If unclear, keep patientId null but do not force ICU_SUMMARY for unrelated questions.`,
        },
        {
          role: "user",
          content: `Command: ${cleanedCommandText}\nSchema: ${JSON.stringify(INTENT_SCHEMA)}`,
        },
      ],
    });
  } catch {
    return detectIntentHeuristic(cleanedCommandText);
  }

  const raw = completion.choices?.[0]?.message?.content || "{}";
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {
      intent: "GENERAL_QUERY",
      patientId: null,
      language: null,
      emotion: detectEmotionHeuristic(cleanedCommandText),
      asksForSummary: false,
    };
  }

  let intent = SUPPORTED_INTENTS.includes(parsed.intent)
    ? parsed.intent
    : "GENERAL_QUERY";

  const language = parsed.language ? normalizeLanguage(parsed.language) : null;
  const emotion = SUPPORTED_EMOTIONS.includes(parsed.emotion)
    ? parsed.emotion
    : detectEmotionHeuristic(commandText);

  let patientId = sanitizePatientId(parsed.patientId);
  if (!patientId) {
    patientId = extractPatientIdFromText(cleanedCommandText);
  }

  if (intent === "PATIENT_STATUS" && !patientId && WELLBEING_QUERY_PATTERN.test(cleanedCommandText)) {
    intent = "GENERAL_QUERY";
  }

  if (isPlatformGuideQuery(cleanedCommandText) && intent !== "LANGUAGE_SWITCH") {
    intent = "PLATFORM_GUIDE";
    patientId = null;
  }

  return {
    intent,
    patientId,
    language: language && SUPPORTED_LANGUAGES.includes(language) ? language : null,
    emotion,
    asksForSummary: Boolean(parsed.asksForSummary),
  };
}

async function generateContextualReply({
  transcript,
  responseLanguage,
  intent,
  emotion,
  patient,
  summary,
  sessionHistory,
  platformGuide,
}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const groq = new Groq({ apiKey });
  const normalizedLanguage = normalizeLanguage(responseLanguage || "en");
  const languageLabel = LANGUAGE_LABELS[normalizedLanguage] || "English";

  const safeHistory = Array.isArray(sessionHistory)
    ? sessionHistory.slice(-6).map((entry) => ({
        role: entry.role,
        text: entry.text,
        intent: entry.intent,
        emotion: entry.emotion,
      }))
    : [];

  const contextPayload = {
    intent,
    emotion,
    patient: patient
      ? {
          patientId: patient.patientId,
          patientName: patient.patientName,
          age: patient.age,
          sex: patient.sex,
          diagnosis: patient.diagnosis,
          heartRate: patient.heartRate,
          spo2: patient.spo2,
          temperature: patient.temperature,
          bloodPressure: patient.bloodPressure,
          respiratoryRate: patient.respiratoryRate,
          map: patient.map,
          lactate: patient.lactate,
          urineOutputMlHr: patient.urineOutputMlHr,
          ventilatorMode: patient.ventilatorMode,
          fio2: patient.fio2,
          trend: patient.trend,
          riskLevel: patient.riskLevel,
          recommendedAction: patient.recommendedAction,
          wardBed: patient.wardBed,
          lastUpdated: patient.lastUpdated,
        }
      : null,
    summary: summary || null,
    platformGuide: platformGuide || null,
    sessionHistory: safeHistory,
  };

  const completion = await groq.chat.completions.create({
    model,
    temperature: 0.25,
    messages: [
      {
        role: "system",
        content:
          `You are Rapid AI, an empathetic ICU voice assistant.
Always answer strictly in ${languageLabel} (${normalizedLanguage}) using native script where applicable.
If user sounds distressed/anxious, acknowledge emotion briefly, then give clear actionable response.
If question is non-ICU or casual, still answer politely and helpfully.
If intent is PLATFORM_GUIDE, answer only from provided platformGuide context and explain requested topic clearly.
If platformGuide.knowledgeBase.snippets are present, prioritize those snippets and concrete route names from that context.
If platformGuide.topic is SHORT_INTRO, respond in 1-2 short sentences.
If platformGuide.topic is LONG_INTRO or FEATURES_WORKFLOW, provide a richer 4-7 sentence explanation with flow (ingestion -> risk -> forecast -> voice/alerts -> timeline).
If platformGuide.topic is PATIENT_DEMO, include demo patient IDs clearly.
Never invent patient vitals. Use provided context only.
Do not claim integrations or features that are not present in context.
Keep response concise, natural, and spoken-style (2-7 short sentences depending on request depth). No markdown.`,
      },
      {
        role: "user",
        content:
          `User transcript: ${String(transcript || "").trim() || "(empty)"}\n` +
          `Structured context: ${JSON.stringify(contextPayload)}`,
      },
    ],
  });

  const text = String(completion.choices?.[0]?.message?.content || "").trim();
  return text || null;
}

module.exports = {
  detectIntent,
  generateContextualReply,
};
