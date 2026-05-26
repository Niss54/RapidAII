const { transcribeAudio } = require("./sttService");
const { detectIntent, generateContextualReply } = require("./llmService");
const { synthesizeSpeech } = require("./ttsService");
const { broadcastVoiceMessage } = require("./livekitService");
const {
  getLanguage,
  setLanguage,
  normalizeLanguage,
  shouldSpeakIntroduction,
  getAlertMode,
  clearAlertMode,
  appendConversationTurn,
  getConversationHistory,
} = require("./sessionState");
const Patient = require("../models/Patient");
const { logVoiceInteraction } = require("../models/EventLog");
const { listTimeline } = require("../models/EventLog");
const platformGuideKnowledge = require("./platformGuideKnowledge");
const { getTrainedPatientProfile, listTrainedPatientIds } = require("./trainedPatientProfiles");

const DUMMY_PATIENTS = {
  "201": {
    patientId: "201",
    patientName: "Aarav Sharma",
    heartRate: 97,
    spo2: 98,
    temperature: 98.4,
    bloodPressure: "118/76",
    riskLevel: "STABLE",
  },
  "202": {
    patientId: "202",
    patientName: "Meera Singh",
    heartRate: 116,
    spo2: 92,
    temperature: 99.2,
    bloodPressure: "126/84",
    riskLevel: "MODERATE",
  },
  "203": {
    patientId: "203",
    patientName: "Kabir Patel",
    heartRate: 124,
    spo2: 86,
    temperature: 101.1,
    bloodPressure: "132/90",
    riskLevel: "CRITICAL",
  },
  "204": {
    patientId: "204",
    patientName: "Ananya Rao",
    heartRate: 108,
    spo2: 94,
    temperature: 99.0,
    bloodPressure: "121/82",
    riskLevel: "WARNING",
  },
};

const TIMEOUTS = {
  sttMs: Number(process.env.VOICE_STT_TIMEOUT_MS || 12000),
  intentMs: Number(process.env.VOICE_INTENT_TIMEOUT_MS || 7000),
  ttsMs: Number(process.env.VOICE_TTS_TIMEOUT_MS || 10000),
  dbMs: Number(process.env.VOICE_DB_TIMEOUT_MS || 3500),
  summaryMs: Number(process.env.VOICE_SUMMARY_TIMEOUT_MS || 4000),
  replyMs: Number(process.env.VOICE_REPLY_TIMEOUT_MS || 9000),
  livekitMs: Number(process.env.VOICE_LIVEKIT_TIMEOUT_MS || 2500),
  logMs: Number(process.env.VOICE_LOG_TIMEOUT_MS || 2500),
};

const LANGUAGE_FALLBACK_ALIAS = Object.freeze({
  as: "bn",
  ne: "hi",
});

const STRICT_LANGUAGE_NAME_MAP = Object.freeze({
  en: "en",
  english: "en",
  hi: "hi",
  hindi: "hi",
  bn: "bn",
  bengali: "bn",
  bangla: "bn",
  ta: "ta",
  tamil: "ta",
  te: "te",
  telugu: "te",
  mr: "mr",
  marathi: "mr",
  gu: "gu",
  gujarati: "gu",
  kn: "kn",
  kannada: "kn",
  ml: "ml",
  malayalam: "ml",
  pa: "pa",
  punjabi: "pa",
  ur: "ur",
  urdu: "ur",
  or: "or",
  odia: "or",
  oriya: "or",
  as: "as",
  assamese: "as",
  ne: "ne",
  nepali: "ne",
});

function parseTimeout(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function withTimeout(promise, timeoutMs, label) {
  const ms = parseTimeout(timeoutMs, 5000);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label || "operation"} timed out after ${ms}ms`));
    }, ms);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function runInBackground(task) {
  Promise.resolve()
    .then(task)
    .catch(() => {
      // Keep voice responses fast even if async side effects fail.
    });
}

function stripSystemInstruction(text) {
  return String(text || "")
    .replace(/\[\s*system\s+instruction\s*:[\s\S]*?\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractStrictLanguageFromInstruction(text) {
  const raw = String(text || "");
  const match = raw.match(
    /\[\s*system\s+instruction\s*:\s*reply\s+strictly\s+in\s+([a-zA-Z\u0900-\u097f\u0980-\u09ff\u0a00-\u0a7f\u0a80-\u0aff\u0b00-\u0b7f\u0b80-\u0bff\u0c00-\u0c7f\u0c80-\u0cff\u0d00-\u0d7f\u0600-\u06ff\s-]+?)\s+language/iu
  );

  if (!match || !match[1]) {
    return null;
  }

  const normalized = String(match[1]).trim().toLowerCase().replace(/\s+/g, " ");
  return STRICT_LANGUAGE_NAME_MAP[normalized] || null;
}

function localizedText(language, dictionary, fallback) {
  const lang = normalizeLanguage(language);
  if (dictionary[lang]) {
    return dictionary[lang];
  }

  const alias = LANGUAGE_FALLBACK_ALIAS[lang];
  if (alias && dictionary[alias]) {
    return dictionary[alias];
  }

  return fallback;
}

async function synthesizeSpeechBase64(responseText, responseLanguage) {
  try {
    const speechBuffer = await withTimeout(
      synthesizeSpeech(responseText, responseLanguage),
      TIMEOUTS.ttsMs,
      "speech synthesis"
    );

    if (speechBuffer.length > 0) {
      return speechBuffer.toString("base64");
    }
  } catch {
    return null;
  }

  return null;
}

function greetingText(language) {
  return localizedText(
    language,
    {
      en: "Hello, I am Rapid AI.",
      hi: "नमस्ते, मैं रैपिड एआई हूं।",
      bn: "হ্যালো, আমি র‍্যাপিড এআই।",
      ta: "வணக்கம், நான் ரேபிட் ஏஐ.",
      te: "హలో, నేను రాపిడ్ ఏఐ.",
      mr: "नमस्कार, मी रॅपिड एआय आहे.",
      gu: "નમસ્તે, હું રેપિડ એઆઈ છું.",
      kn: "ನಮಸ್ಕಾರ, ನಾನು ರಾಪಿಡ್ ಎಐ.",
      ml: "ഹലോ, ഞാൻ റാപിഡ് എഐ ആണ്.",
      pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ ਰੈਪਿਡ ਏਆਈ ਹਾਂ।",
      ur: "ہیلو، میں ریپڈ اے آئی ہوں۔",
      or: "ନମସ୍କାର, ମୁଁ ର୍ୟାପିଡ ଏଆଇ।",
    },
    "Hello, I am Rapid AI."
  );
}

function languageSwitchText(language) {
  return localizedText(
    language,
    {
      en: "Language switched to English.",
      hi: "भाषा हिंदी में बदल दी गई है।",
      bn: "ভাষা বাংলায় পরিবর্তন করা হয়েছে।",
      ta: "மொழி தமிழாக மாற்றப்பட்டது.",
      te: "భాష తెలుగులోకి మార్చబడింది.",
      mr: "भाषा मराठीत बदलली आहे.",
      gu: "ભાષા ગુજરાતી માં બદલી દેવામાં આવી છે.",
      kn: "ಭಾಷೆಯನ್ನು ಕನ್ನಡಕ್ಕೆ ಬದಲಿಸಲಾಗಿದೆ.",
      ml: "ഭാഷ മലയാളത്തിലേക്ക് മാറ്റി.",
      pa: "ਭਾਸ਼ਾ ਪੰਜਾਬੀ ਵਿੱਚ ਬਦਲ ਦਿੱਤੀ ਗਈ ਹੈ।",
      ur: "زبان اردو میں تبدیل کر دی گئی ہے۔",
      or: "ଭାଷା ଓଡ଼ିଆକୁ ପରିବର୍ତ୍ତନ କରାଗଲା।",
    },
    "Language switched to English."
  );
}

function askPatientIdentityText(language) {
  return localizedText(
    language,
    {
      en: "Please share patient name and patient number. Example: patient 203, name Ananya.",
      hi: "कृपया रोगी का नाम और रोगी नंबर बताइए। उदाहरण: patient 203, name Ananya.",
      bn: "দয়া করে রোগীর নাম ও নম্বর বলুন। উদাহরণ: patient 203, name Ananya.",
      ta: "தயவுசெய்து நோயாளியின் பெயரும் எண்ணும் சொல்லுங்கள். உதாரணம்: patient 203, name Ananya.",
      te: "దయచేసి పేషెంట్ పేరు, నంబర్ చెప్పండి. ఉదాహరణ: patient 203, name Ananya.",
      mr: "कृपया रुग्णाचे नाव आणि क्रमांक सांगा. उदाहरण: patient 203, name Ananya.",
      gu: "કૃપા કરીને દર્દીનું નામ અને નંબર કહો. ઉદાહરણ: patient 203, name Ananya.",
      kn: "ದಯವಿಟ್ಟು ರೋಗಿಯ ಹೆಸರು ಮತ್ತು ಸಂಖ್ಯೆ ತಿಳಿಸಿ. ಉದಾಹರಣೆ: patient 203, name Ananya.",
      ml: "ദയവായി രോഗിയുടെ പേരും നമ്പറും പറയുക. ഉദാഹരണം: patient 203, name Ananya.",
      pa: "ਕਿਰਪਾ ਕਰਕੇ ਮਰੀਜ਼ ਦਾ ਨਾਮ ਤੇ ਨੰਬਰ ਦੱਸੋ। ਉਦਾਹਰਨ: patient 203, name Ananya.",
      ur: "براہ کرم مریض کا نام اور نمبر بتائیں۔ مثال: patient 203, name Ananya.",
      or: "ଦୟାକରି ରୋଗୀର ନାମ ଓ ନମ୍ବର କହନ୍ତୁ। ଉଦାହରଣ: patient 203, name Ananya.",
    },
    "Please share patient name and patient number. Example: patient 203, name Ananya."
  );
}

function sttRetryText(language) {
  return localizedText(
    language,
    {
      en: "I could not understand the audio clearly. Please repeat your question.",
      hi: "मैं ऑडियो ठीक से समझ नहीं पाया। कृपया अपना प्रश्न दोबारा, थोड़ा स्पष्ट बोलें।",
      bn: "আমি অডিও পরিষ্কারভাবে বুঝতে পারিনি। অনুগ্রহ করে আবার বলুন।",
      ta: "ஆடியோ தெளிவாக புரியவில்லை. தயவு செய்து மீண்டும் சொல்லுங்கள்.",
      te: "ఆడియో స్పష్టంగా వినిపించలేదు. దయచేసి మళ్లీ చెప్పండి.",
      mr: "ऑडिओ स्पष्ट ऐकू आला नाही. कृपया पुन्हा सांगा.",
      gu: "ઓડિયો સ્પષ્ટ રીતે સમજાયો નથી. કૃપા કરીને ફરી કહો.",
      kn: "ಆಡಿಯೋ ಸ್ಪಷ್ಟವಾಗಿ ಅರ್ಥವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಹೇಳಿ.",
      ml: "ഓഡിയോ വ്യക്തമല്ല. ദയവായി വീണ്ടും പറയൂ.",
      pa: "ਆਡੀਓ ਸਪੱਸ਼ਟ ਨਹੀਂ ਸੀ। ਕਿਰਪਾ ਕਰਕੇ ਫਿਰ ਦੱਸੋ।",
      ur: "آڈیو واضح طور پر سمجھ نہیں آیا۔ براہ کرم دوبارہ بولیں۔",
      or: "ଅଡିଓ ସ୍ପଷ୍ଟ ଭାବରେ ବୁଝି ପାରିଲି ନାହିଁ। ଦୟାକରି ପୁଣି କହନ୍ତୁ।",
    },
    "I could not understand the audio clearly. Please repeat your question."
  );
}

function alertLockText(alertState, language) {
  const patientPart = alertState?.patientId ? ` ${alertState.patientId}` : "";

  const fallback = `Critical alert mode is active${patientPart ? ` for patient ${patientPart.trim()}` : ""}. Rapid AI is broadcasting emergency alert only. Please wait.`;

  return localizedText(
    language,
    {
      en: fallback,
      hi: `क्रिटिकल अलर्ट सक्रिय है${patientPart ? `, रोगी ${patientPart.trim()}` : ""}। अभी रैपिड एआई केवल अलर्ट प्रसारित करेगा, कृपया कुछ क्षण प्रतीक्षा करें।`,
      bn: `ক্রিটিক্যাল অ্যালার্ট সক্রিয়${patientPart ? `, রোগী ${patientPart.trim()}` : ""}। এখন Rapid AI শুধু জরুরি অ্যালার্ট সম্প্রচার করবে, অনুগ্রহ করে অপেক্ষা করুন।`,
      ta: `கிரிட்டிக்கல் அலர்ட் செயல்பாட்டில் உள்ளது${patientPart ? `, நோயாளர் ${patientPart.trim()}` : ""}. இப்போது Rapid AI அவசர அலர்ட் மட்டுமே ஒலிபரப்பும், தயவு செய்து காத்திருக்கவும்.`,
      te: `క్రిటికల్ అలర్ట్ యాక్టివ్‌లో ఉంది${patientPart ? `, పేషెంట్ ${patientPart.trim()}` : ""}. ఇప్పుడు Rapid AI అత్యవసర అలర్ట్ మాత్రమే ప్రసారం చేస్తుంది, దయచేసి వేచి ఉండండి.`,
      mr: `क्रिटिकल अलर्ट सुरू आहे${patientPart ? `, रुग्ण ${patientPart.trim()}` : ""}. आत्ता Rapid AI फक्त आपत्कालीन अलर्ट प्रसारित करेल, कृपया थोडी प्रतीक्षा करा.`,
      gu: `ક્રિટિકલ એલર્ટ સક્રિય છે${patientPart ? `, દર્દી ${patientPart.trim()}` : ""}. હાલમાં Rapid AI ફક્ત ઇમરજન્સી એલર્ટ જ પ્રસારિત કરશે, કૃપા કરીને રાહ જુઓ.`,
      kn: `ಕ್ರಿಟಿಕಲ್ ಅಲರ್ಟ್ ಸಕ್ರಿಯವಾಗಿದೆ${patientPart ? `, ರೋಗಿ ${patientPart.trim()}` : ""}. ಈಗ Rapid AI ತುರ್ತು ಅಲರ್ಟ್ ಮಾತ್ರ ಪ್ರಸಾರ ಮಾಡುತ್ತದೆ, ದಯವಿಟ್ಟು ಕಾಯಿರಿ.`,
      ml: `ക്രിറ്റിക്കൽ അലർട്ട് സജീവമാണ്${patientPart ? `, രോഗി ${patientPart.trim()}` : ""}. ഇപ്പോള്‍ Rapid AI അടിയന്തര അലർട്ട് മാത്രം പ്രക്ഷേപണം ചെയ്യും, ദയവായി കാത്തിരിക്കുക.`,
      pa: `ਕ੍ਰਿਟਿਕਲ ਅਲਰਟ ਐਕਟਿਵ ਹੈ${patientPart ? `, ਮਰੀਜ਼ ${patientPart.trim()}` : ""}। ਇਸ ਵੇਲੇ Rapid AI ਸਿਰਫ਼ ਐਮਰਜੈਂਸੀ ਅਲਰਟ ਹੀ ਬ੍ਰਾਡਕਾਸਟ ਕਰੇਗਾ, ਕਿਰਪਾ ਕਰਕੇ ਉਡੀਕ ਕਰੋ।`,
      ur: `کریٹیکل الرٹ فعال ہے${patientPart ? `، مریض ${patientPart.trim()}` : ""}۔ اس وقت Rapid AI صرف ایمرجنسی الرٹ ہی نشر کرے گا، براہ کرم انتظار کریں۔`,
      or: `କ୍ରିଟିକାଲ ଆଲର୍ଟ ସକ୍ରିୟ ଅଛି${patientPart ? `, ରୋଗୀ ${patientPart.trim()}` : ""}। ଏବେ Rapid AI କେବଳ ଜରୁରୀ ଆଲର୍ଟ ପ୍ରସାରଣ କରିବ, ଦୟାକରି ଅପେକ୍ଷା କରନ୍ତୁ।`,
    },
    fallback
  );
}

const ALERT_LOCK_NON_QUERY_PATTERN =
  /^(?:\[?input-blocked-during-alert\]?|voice\s+call\s+started\.?|voice\s+call\s+ended\.?|start\s+voice\s+call|stop\s+voice\s+call)$/i;

const ALERT_LOCK_EXIT_PATTERN =
  /^(?:stop\s+voice\s+call|voice\s+call\s+ended\.?|end\s+alert|clear\s+alert|cancel\s+alert|alert\s+cleared)$/i;

function shouldBypassAlertLockForText(text) {
  if (!text || typeof text !== "string") {
    return false;
  }

  const normalized = text
    .replace(/\[System instruction:[\s\S]*$/i, "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return false;
  }

  if (ALERT_LOCK_NON_QUERY_PATTERN.test(normalized)) {
    return false;
  }

  return true;
}

const PATIENT_ID_STOPWORDS = new Set([
  "ka",
  "ke",
  "ki",
  "hai",
  "ho",
  "hu",
  "haan",
  "nahi",
  "the",
  "this",
  "that",
  "and",
  "for",
  "with",
  "please",
]);

const WELLBEING_QUERY_PATTERN =
  /motivat|anxious|stress|tense|panic|help me|what should i do|tips|calm|cope|burnout|overwhelmed|pareshan|pressan|tension|ghabra|rote|cry|helpless|how to stay calm/i;

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

function isWellbeingQuery(text) {
  return WELLBEING_QUERY_PATTERN.test(String(text || ""));
}

function isPlatformGuideQuery(text) {
  return platformGuideKnowledge.isPlatformGuideQuery(text);
}

function resolvePlatformGuideTopic(transcript) {
  const text = String(transcript || "").toLowerCase();

  if (/everything|a2z|all\s+features|all\s+about|complete|full\s+overview|overview|saare/.test(text)) {
    return "OVERVIEW";
  }

  if (/api key|x-api-key|my-key|regenerate|usage limit|quota|expiry|expire|plan/.test(text)) {
    return "API_KEY";
  }

  if (/developer|integration|curl|sdk|docs|documentation|endpoint|api\s*doc|reference/.test(text)) {
    return "DEVELOPER";
  }

  if (/hospital|icu team|workflow|onboard|deployment|hl7|serial|monitor/.test(text)) {
    return "HOSPITAL";
  }

  if (/whatsapp|escalation|critical alert|remote alert/.test(text)) {
    return "WHATSAPP";
  }

  if (/unique|uniqueness|market|difference|why better|competitive|not available/.test(text)) {
    return "UNIQUENESS";
  }

  return "OVERVIEW";
}

function buildPlatformGuideContext(options = {}) {
  return platformGuideKnowledge.buildPlatformGuideContext(options);
}

function platformGuideText(transcript, language, context) {
  return platformGuideKnowledge.buildPlatformGuideReply({
    transcript,
    language,
    normalizeLanguageFn: normalizeLanguage,
    context,
  });
}

function extractPatientIdFromText(text) {
  const normalized = String(text || "").toLowerCase();

  const numericMatch = normalized.match(
    /(?:patient|pt|mrn|pid|id|मरीज|रोगी)\s*(?:number|num|no\.?)?\s*[:#-]?\s*([0-9]{2,8})\b/i
  );
  if (numericMatch) {
    return sanitizePatientId(numericMatch[1]);
  }

  const genericMatch = normalized.match(
    /(?:patient|pt|mrn|pid|id|मरीज|रोगी)\s*(?:number|num|no\.?)?\s*[:#-]?\s*([a-z0-9_-]{2,20})\b/i
  );

  return genericMatch ? sanitizePatientId(genericMatch[1]) : null;
}

function sanitizeExtractedName(rawName) {
  if (!rawName) {
    return null;
  }

  const cleaned = String(rawName)
    .replace(/\b(status|condition|risk|detail|details|summary|report|oxygen|spo2|heart|bp|temperature)\b.*$/i, "")
    .replace(/[\s,;:.]+$/g, "")
    .trim();

  return cleaned || null;
}

function extractPatientNameFromText(text) {
  const normalized = String(text || "");

  const english = normalized.match(/(?:name\s*(?:is)?\s*)([a-z][a-z\s'-]{1,40})/i);
  if (english) {
    return sanitizeExtractedName(english[1]);
  }

  const hindi = normalized.match(/(?:नाम\s*)([\u0900-\u097fa-zA-Z\s'-]{1,40})/i);
  if (hindi) {
    return sanitizeExtractedName(hindi[1]);
  }

  return null;
}

function extractRecentPatientIdFromHistory(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return null;
  }

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    const candidate = extractPatientIdFromText(entry?.text || "");
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function withIntroIfNeeded(responseText, language, userId) {
  if (!shouldSpeakIntroduction(userId)) {
    return responseText;
  }

  return `${greetingText(language)} ${responseText}`;
}

function toDisplayValue(value, fallback = "N/A") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return String(Math.round(numeric * 100) / 100);
  }

  const text = String(value).trim();
  return text || fallback;
}

function patientDetailsTailText(patient, language) {
  const hasExtended =
    patient?.diagnosis ||
    Number.isFinite(Number(patient?.respiratoryRate)) ||
    Number.isFinite(Number(patient?.map)) ||
    Number.isFinite(Number(patient?.lactate)) ||
    Number.isFinite(Number(patient?.urineOutputMlHr)) ||
    patient?.ventilatorMode ||
    Number.isFinite(Number(patient?.fio2)) ||
    patient?.trend ||
    patient?.recommendedAction ||
    patient?.wardBed;

  if (!hasExtended) {
    return "";
  }

  const diagnosis = toDisplayValue(patient?.diagnosis);
  const respiratoryRate = toDisplayValue(patient?.respiratoryRate);
  const map = toDisplayValue(patient?.map);
  const lactate = toDisplayValue(patient?.lactate);
  const urine = toDisplayValue(patient?.urineOutputMlHr);
  const ventilator = toDisplayValue(patient?.ventilatorMode);
  const fio2 = toDisplayValue(patient?.fio2);
  const trend = toDisplayValue(patient?.trend);
  const wardBed = toDisplayValue(patient?.wardBed);
  const action = toDisplayValue(patient?.recommendedAction);

  return localizedText(
    language,
    {
      en: ` Detailed condition: diagnosis ${diagnosis}, respiratory rate ${respiratoryRate}, MAP ${map}, lactate ${lactate}, urine output ${urine} ml/hr, ventilator ${ventilator}, FiO2 ${fio2}, bed ${wardBed}, trend ${trend}. Recommended action: ${action}`,
      hi: ` विस्तृत स्थिति: diagnosis ${diagnosis}, respiratory rate ${respiratoryRate}, MAP ${map}, lactate ${lactate}, urine output ${urine} ml/hr, ventilator ${ventilator}, FiO2 ${fio2}, bed ${wardBed}, trend ${trend}. Recommended action: ${action}`,
      mr: ` सविस्तर स्थिती: diagnosis ${diagnosis}, respiratory rate ${respiratoryRate}, MAP ${map}, lactate ${lactate}, urine output ${urine} ml/hr, ventilator ${ventilator}, FiO2 ${fio2}, bed ${wardBed}, trend ${trend}. Recommended action: ${action}`,
    },
    ` Detailed condition: diagnosis ${diagnosis}, respiratory rate ${respiratoryRate}, MAP ${map}, lactate ${lactate}, urine output ${urine} ml/hr, ventilator ${ventilator}, FiO2 ${fio2}, bed ${wardBed}, trend ${trend}. Recommended action: ${action}`
  );
}

function patientStatusText(patient, language, explicitName) {
  if (!patient) {
    return askPatientIdentityText(language);
  }

  const patientName = explicitName || patient.patientName || "Unknown";

  return localizedText(
    language,
    {
      en: `Patient ${patient.patientId}, name ${patientName}: oxygen ${patient.spo2}, heart rate ${patient.heartRate}, temperature ${patient.temperature}, blood pressure ${patient.bloodPressure}, risk ${patient.riskLevel}.`,
      hi: `रोगी ${patient.patientId}, नाम ${patientName}: ऑक्सीजन ${patient.spo2}, हार्ट रेट ${patient.heartRate}, तापमान ${patient.temperature}, ब्लड प्रेशर ${patient.bloodPressure}, जोखिम स्तर ${patient.riskLevel} है।`,
      bn: `রোগী ${patient.patientId}, নাম ${patientName}: অক্সিজেন ${patient.spo2}, হার্ট রেট ${patient.heartRate}, তাপমাত্রা ${patient.temperature}, রক্তচাপ ${patient.bloodPressure}, ঝুঁকি স্তর ${patient.riskLevel}।`,
      ta: `நோயாளர் ${patient.patientId}, பெயர் ${patientName}: ஆக்சிஜன் ${patient.spo2}, இதய துடிப்பு ${patient.heartRate}, வெப்பநிலை ${patient.temperature}, இரத்த அழுத்தம் ${patient.bloodPressure}, அபாய நிலை ${patient.riskLevel}.`,
      te: `పేషెంట్ ${patient.patientId}, పేరు ${patientName}: ఆక్సిజన్ ${patient.spo2}, హార్ట్ రేట్ ${patient.heartRate}, ఉష్ణోగ్రత ${patient.temperature}, రక్తపోటు ${patient.bloodPressure}, రిస్క్ స్థాయి ${patient.riskLevel}.`,
      mr: `रुग्ण ${patient.patientId}, नाव ${patientName}: ऑक्सिजन ${patient.spo2}, हृदयगती ${patient.heartRate}, तापमान ${patient.temperature}, रक्तदाब ${patient.bloodPressure}, जोखीम स्तर ${patient.riskLevel}.`,
      gu: `દર્દી ${patient.patientId}, નામ ${patientName}: ઓક્સિજન ${patient.spo2}, હાર્ટ રેટ ${patient.heartRate}, તાપમાન ${patient.temperature}, બ્લડ પ્રેશર ${patient.bloodPressure}, જોખમ સ્તર ${patient.riskLevel}.`,
      kn: `ರೋಗಿ ${patient.patientId}, ಹೆಸರು ${patientName}: ಆಮ್ಲಜನಕ ${patient.spo2}, ಹೃದಯ ಮಿಡಿತ ${patient.heartRate}, ತಾಪಮಾನ ${patient.temperature}, ರಕ್ತದೊತ್ತಡ ${patient.bloodPressure}, ಅಪಾಯ ಮಟ್ಟ ${patient.riskLevel}.`,
      ml: `രോഗി ${patient.patientId}, പേര് ${patientName}: ഓക്സിജൻ ${patient.spo2}, ഹൃദയമിടിപ്പ് ${patient.heartRate}, താപനില ${patient.temperature}, രക്തസമ്മർദ്ദം ${patient.bloodPressure}, അപകടനില ${patient.riskLevel}.`,
      pa: `ਮਰੀਜ਼ ${patient.patientId}, ਨਾਮ ${patientName}: ਆਕਸੀਜਨ ${patient.spo2}, ਹਾਰਟ ਰੇਟ ${patient.heartRate}, ਤਾਪਮਾਨ ${patient.temperature}, ਬਲੱਡ ਪ੍ਰੈਸ਼ਰ ${patient.bloodPressure}, ਖਤਰੇ ਦਾ ਪੱਧਰ ${patient.riskLevel}।`,
      ur: `مریض ${patient.patientId}، نام ${patientName}: آکسیجن ${patient.spo2}، دل کی دھڑکن ${patient.heartRate}، درجہ حرارت ${patient.temperature}، بلڈ پریشر ${patient.bloodPressure}، خطرے کی سطح ${patient.riskLevel}۔`,
      or: `ରୋଗୀ ${patient.patientId}, ନାମ ${patientName}: ଅକ୍ସିଜେନ ${patient.spo2}, ହୃଦ୍‌ଗତି ${patient.heartRate}, ତାପମାତ୍ରା ${patient.temperature}, ରକ୍ତଚାପ ${patient.bloodPressure}, ଝୁମ୍ପ ସ୍ତର ${patient.riskLevel}।`,
    },
    `Patient ${patient.patientId}, name ${patientName}: oxygen ${patient.spo2}, heart rate ${patient.heartRate}, temperature ${patient.temperature}, blood pressure ${patient.bloodPressure}, risk ${patient.riskLevel}.`
  ) + patientDetailsTailText(patient, language);
}

function summaryText(summary, language, source = "live") {
  const tag = source === "dummy" ? " (demo training data)" : "";

  return localizedText(
    language,
    {
      en: `ICU summary${tag}: ${summary.critical} critical, ${summary.moderate} moderate, ${summary.warning} warning, ${summary.stable} stable, total ${summary.total} patients.`,
      hi: `आईसीयू सारांश${source === "dummy" ? " (डेमो डेटा)" : ""}: गंभीर ${summary.critical}, मॉडरेट ${summary.moderate}, चेतावनी ${summary.warning}, स्थिर ${summary.stable}, कुल ${summary.total} रोगी।`,
      bn: `আইসিইউ সারাংশ${source === "dummy" ? " (ডেমো ডেটা)" : ""}: সংকটজনক ${summary.critical}, মাঝারি ${summary.moderate}, সতর্কতা ${summary.warning}, স্থিতিশীল ${summary.stable}, মোট ${summary.total} রোগী।`,
      ta: `ஐசியு சுருக்கம்${source === "dummy" ? " (டெமோ தரவு)" : ""}: மோசமான நிலை ${summary.critical}, மிதமான ${summary.moderate}, எச்சரிக்கை ${summary.warning}, நிலைதடுமாறாத ${summary.stable}, மொத்தம் ${summary.total} நோயாளிகள்.`,
      te: `ఐసీయూ సారాంశం${source === "dummy" ? " (డెమో డేటా)" : ""}: తీవ్రమైనవి ${summary.critical}, మోస్తరు ${summary.moderate}, హెచ్చరిక ${summary.warning}, స్థిరం ${summary.stable}, మొత్తం ${summary.total} మంది పేషెంట్లు.`,
      mr: `आयसीयू सारांश${source === "dummy" ? " (डेमो डेटा)" : ""}: गंभीर ${summary.critical}, मॉडरेट ${summary.moderate}, वॉर्निंग ${summary.warning}, स्थिर ${summary.stable}, एकूण ${summary.total} रुग्ण.`,
      gu: `ICU સારાંશ${source === "dummy" ? " (ડેમો ડેટા)" : ""}: ગંભીર ${summary.critical}, મધ્યમ ${summary.moderate}, ચેતવણી ${summary.warning}, સ્થિર ${summary.stable}, કુલ ${summary.total} દર્દીઓ.`,
      kn: `ICU ಸಾರಾಂಶ${source === "dummy" ? " (ಡೆಮೊ ಡೇಟಾ)" : ""}: ಗಂಭೀರ ${summary.critical}, ಮಧ್ಯಮ ${summary.moderate}, ಎಚ್ಚರಿಕೆ ${summary.warning}, ಸ್ಥಿರ ${summary.stable}, ಒಟ್ಟು ${summary.total} ರೋಗಿಗಳು.`,
      ml: `ICU സംഗ്രഹം${source === "dummy" ? " (ഡെമോ ഡാറ്റ)" : ""}: ഗുരുതരം ${summary.critical}, മിതം ${summary.moderate}, മുന്നറിയിപ്പ് ${summary.warning}, സ്ഥിരം ${summary.stable}, ആകെ ${summary.total} രോഗികൾ.`,
      pa: `ICU ਸੰਖੇਪ${source === "dummy" ? " (ਡੈਮੋ ਡਾਟਾ)" : ""}: ਗੰਭੀਰ ${summary.critical}, ਮੱਧਮ ${summary.moderate}, ਚੇਤਾਵਨੀ ${summary.warning}, ਸਥਿਰ ${summary.stable}, ਕੁੱਲ ${summary.total} ਮਰੀਜ਼।`,
      ur: `آئی سی یو خلاصہ${source === "dummy" ? " (ڈیمو ڈیٹا)" : ""}: شدید ${summary.critical}, درمیانی ${summary.moderate}, وارننگ ${summary.warning}, مستحکم ${summary.stable}, کل ${summary.total} مریض۔`,
      or: `ICU ସାରାଂଶ${source === "dummy" ? " (ଡେମୋ ଡାଟା)" : ""}: ଗୁରୁତର ${summary.critical}, ମଧ୍ୟମ ${summary.moderate}, ସତର୍କ ${summary.warning}, ସ୍ଥିର ${summary.stable}, ମୋଟ ${summary.total} ରୋଗୀ।`,
    },
    `ICU summary${tag}: ${summary.critical} critical, ${summary.moderate} moderate, ${summary.warning} warning, ${summary.stable} stable, total ${summary.total} patients.`
  );
}

function fallbackGeneralReply(language, emotion) {
  const tonePrefix = emotion === "DISTRESSED" || emotion === "ANXIOUS"
    ? localizedText(
        language,
        {
          en: "I understand this feels stressful. ",
          hi: "मैं समझ सकता हूं कि आप तनाव में हैं। ",
          bn: "আমি বুঝতে পারছি আপনি চাপের মধ্যে আছেন। ",
          ta: "நீங்கள் பதற்றத்தில் இருப்பதை நான் புரிகிறேன். ",
          te: "మీరు ఒత్తిడిలో ఉన్నారని నాకు అర్థమవుతోంది. ",
          mr: "तुम्ही तणावात आहात हे मला समजते. ",
          gu: "મને સમજાય છે કે તમે તણાવમાં છો. ",
          kn: "ನೀವು ಒತ್ತಡದಲ್ಲಿದ್ದೀರಿ ಎಂಬುದು ನನಗೆ ಅರ್ಥವಾಗಿದೆ. ",
          ml: "നിങ്ങൾ സമ്മർദ്ദത്തിലാണെന്ന് ഞാൻ മനസ്സിലാക്കുന്നു. ",
          pa: "ਮੈਨੂੰ ਸਮਝ ਆਉਂਦੀ ਹੈ ਕਿ ਤੁਸੀਂ ਤਣਾਅ ਵਿੱਚ ਹੋ। ",
          ur: "میں سمجھ سکتا ہوں کہ آپ دباؤ میں ہیں۔ ",
          or: "ଆପଣ ଚାପରେ ଅଛନ୍ତି ବୋଲି ମୁଁ ବୁଝୁଛି। ",
        },
        "I understand this feels stressful. "
      )
    : "";

  const body = localizedText(
    language,
    {
      en: "I can help with patient status, ICU summary, and your general questions. You can ask naturally and I will understand context.",
      hi: "मैं रोगी की स्थिति, ICU सारांश और आपके सामान्य प्रश्नों में मदद कर सकता हूं। आप सामान्य तरीके से पूछिए, मैं संदर्भ समझकर जवाब दूंगा।",
      bn: "আমি রোগীর অবস্থা, ICU সারাংশ এবং সাধারণ প্রশ্নে সাহায্য করতে পারি। স্বাভাবিকভাবে জিজ্ঞেস করুন, আমি প্রসঙ্গ বুঝে উত্তর দেব।",
      ta: "நோயாளி நிலை, ICU சுருக்கம் மற்றும் பொதுவான கேள்விகளில் நான் உதவ முடியும். இயல்பாக கேளுங்கள், நான் சூழலைப் புரிந்து பதிலளிப்பேன்.",
      te: "పేషెంట్ స్థితి, ICU సారాంశం మరియు సాధారణ ప్రశ్నల్లో నేను సహాయం చేయగలను. సహజంగా అడగండి, నేను సందర్భం అర్థం చేసుకొని సమాధానం ఇస్తాను.",
      mr: "रुग्ण स्थिती, ICU सारांश आणि सामान्य प्रश्नांमध्ये मी मदत करू शकतो. नैसर्गिक पद्धतीने विचारा, मी संदर्भ समजून उत्तर देईन.",
      gu: "દર્દીની સ્થિતિ, ICU સારાંશ અને સામાન્ય પ્રશ્નોમાં હું મદદ કરી શકું છું. સામાન્ય રીતે પૂછો, હું સંદર્ભ સમજીને જવાબ આપીશ.",
      kn: "ರೋಗಿಯ ಸ್ಥಿತಿ, ICU ಸಾರಾಂಶ ಮತ್ತು ಸಾಮಾನ್ಯ ಪ್ರಶ್ನೆಗಳಲ್ಲಿ ನಾನು ಸಹಾಯ ಮಾಡಬಹುದು. ಸಹಜವಾಗಿ ಕೇಳಿ, ನಾನು ಸಂದರ್ಭ ಅರ್ಥಮಾಡಿಕೊಂಡು ಉತ್ತರಿಸುತ್ತೇನೆ.",
      ml: "രോഗിയുടെ സ്ഥിതി, ICU സംഗ്രഹം, സാധാരണ ചോദ്യങ്ങൾ എന്നിവയിൽ ഞാൻ സഹായിക്കാം. സ്വാഭാവികമായി ചോദിക്കൂ, ഞാൻ സാഹചര്യത്തിൽ നിന്ന് മറുപടി നൽകും.",
      pa: "ਮੈਂ ਮਰੀਜ਼ ਦੀ ਸਥਿਤੀ, ICU ਸਾਰ ਅਤੇ ਆਮ ਸਵਾਲਾਂ ਵਿੱਚ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ। ਤੁਸੀਂ ਕੁਦਰਤੀ ਤਰੀਕੇ ਨਾਲ ਪੁੱਛੋ, ਮੈਂ ਸੰਦਰਭ ਸਮਝ ਕੇ ਜਵਾਬ ਦਿਆਂਗਾ।",
      ur: "میں مریض کی حالت، ICU خلاصہ اور عام سوالات میں مدد کر سکتا ہوں۔ آپ فطری انداز میں پوچھیں، میں سیاق سمجھ کر جواب دوں گا۔",
      or: "ରୋଗୀର ସ୍ଥିତି, ICU ସାରାଂଶ ଏବଂ ସାଧାରଣ ପ୍ରଶ୍ନରେ ମୁଁ ସାହାଯ୍ୟ କରିପାରିବି। ସ୍ୱାଭାବିକ ଭାବେ ପଚାରନ୍ତୁ, ମୁଁ ପରିପ୍ରେକ୍ଷ୍ୟ ବୁଝି ଉତ୍ତର ଦେବି।",
    },
    "I can help with patient status, ICU summary, and your general questions. You can ask naturally and I will understand context."
  );

  return `${tonePrefix}${body}`;
}

function getDummySummary() {
  const patients = Object.values(DUMMY_PATIENTS);
  const summary = {
    critical: 0,
    moderate: 0,
    warning: 0,
    stable: 0,
    total: patients.length,
  };

  for (const patient of patients) {
    const risk = String(patient.riskLevel || "STABLE").toUpperCase();
    if (risk === "CRITICAL") {
      summary.critical += 1;
    } else if (risk === "MODERATE") {
      summary.moderate += 1;
    } else if (risk === "WARNING") {
      summary.warning += 1;
    } else {
      summary.stable += 1;
    }
  }

  return { summary, patients };
}

async function resolvePatientProfile(patientId, nameHint) {
  const normalizedId = String(patientId);
  const dummy = DUMMY_PATIENTS[normalizedId];
  const trained = getTrainedPatientProfile(normalizedId);
  let realPatient = null;

  if (!dummy) {
    try {
      realPatient = await withTimeout(
        Patient.getPatientById(normalizedId),
        TIMEOUTS.dbMs,
        "patient lookup"
      );
    } catch {
      realPatient = null;
    }
  }

  if (!realPatient && !dummy && !trained) {
    return null;
  }

  const base = realPatient
    ? { ...(trained || {}), ...realPatient }
    : dummy
      ? { ...dummy }
      : { ...trained };

  base.patientId = normalizedId;
  base.patientName = nameHint || base.patientName || dummy?.patientName || trained?.patientName || "Unknown";
  return base;
}

async function processVoiceQuery({ audioBuffer, text, language, userId }) {
  const sessionId = userId || "default-user";
  const rawText = text && String(text).trim().length > 0 ? String(text).trim() : "";
  const strictLanguage = extractStrictLanguageFromInstruction(rawText);
  const cleanedText = stripSystemInstruction(rawText);
  const activeLanguage = normalizeLanguage(strictLanguage || language || getLanguage(sessionId) || "en");

  if (strictLanguage) {
    setLanguage(strictLanguage, sessionId);
  }

  const sessionHistory = getConversationHistory(sessionId, 8);
  const alertState = getAlertMode();

  if (alertState.active && ALERT_LOCK_EXIT_PATTERN.test(cleanedText || rawText)) {
    clearAlertMode();
    const responseLanguage = normalizeLanguage(alertState.language || activeLanguage);
    const responseText = localizedText(
      responseLanguage,
      {
        en: "Alert mode cleared. You can continue normal conversation now.",
        hi: "अलर्ट मोड बंद कर दिया गया है। अब आप सामान्य बातचीत जारी रख सकते हैं।",
        bn: "অ্যালার্ট মোড ক্লিয়ার করা হয়েছে। এখন আপনি স্বাভাবিক কথোপকথন চালিয়ে যেতে পারেন।",
        ta: "அலர்ட் முறை முடிக்கப்பட்டுள்ளது. நீங்கள் தற்போது சாதாரண உரையாடலை தொடரலாம்.",
        te: "అలర్ట్ మోడ్ క్లియర్ చేయబడింది. ఇప్పుడు మీరు సాధారణ సంభాషణ కొనసాగించవచ్చు.",
        mr: "अलर्ट मोड बंद केला गेला आहे. आता तुम्ही सामान्य संभाषण सुरू ठेवू शकता.",
        gu: "એલર્ટ મોડ દૂર કરવામાં આવ્યો છે. હવે તમે સામાન્ય વાતચીત ચાલુ રાખી શકો છો.",
        kn: "ಅಲರ್ಟ್ ಮೋಡ್ ತೆಗೆದುಹಾಕಲಾಗಿದೆ. ಈಗ ನೀವು ಸಾಮಾನ್ಯ ಸಂಭಾಷಣೆಯನ್ನು ಮುಂದುವರೆಸಬಹುದು.",
        ml: "അലർട്ട് മോഡ് നീക്കം ചെയ്‌ત્તു. ഇപ്പോൾ നിങ്ങൾ സാധാരണ സംഭാഷണം തുടരാം.",
        pa: "ਅਲਰਟ ਮੋਡ ਮੁਕੰਮਲ ਹੋ ਚੁੱਕਿਆ ਹੈ। ਹੁਣ ਤੁਸੀਂ ਆਮ ਗੱਲਬਾਤ ਜਾਰੀ ਰੱਖ ਸਕਦੇ ਹੋ।",
        ur: "الرٹ موڈ ختم کر دیا گیا ہے۔ اب آپ معمول کی گفتگو جاری رکھ سکتے ہیں۔",
        or: "ଆଲର୍ଟ ମୋଡ୍ କ୍ଲିୟର୍ ହୋଇଛି। ଏବେ ଆପଣ ସାଧାରଣ ଆଲୋଚନା চালାଇପାରିବେ।",
      },
      "Alert mode cleared. You can continue normal conversation now."
    );

    appendConversationTurn(sessionId, {
      role: "assistant",
      text: responseText,
      intent: "ALERT_LOCK",
      language: responseLanguage,
    });

    const audioBase64 = await synthesizeSpeechBase64(responseText, responseLanguage);

    return {
      transcript: cleanedText || rawText,
      intent: "ALERT_LOCK",
      patientId: alertState.patientId || null,
      language: responseLanguage,
      responseText,
      audioBase64,
    };
  }

  if (alertState.active && !shouldBypassAlertLockForText(cleanedText || rawText)) {
    const responseLanguage = normalizeLanguage(alertState.language || activeLanguage);
    const transcript = cleanedText || "[input-blocked-during-alert]";
    const responseText = alertLockText(alertState, responseLanguage);

    appendConversationTurn(sessionId, {
      role: "user",
      text: transcript,
      intent: "ALERT_LOCK",
      language: responseLanguage,
    });

    appendConversationTurn(sessionId, {
      role: "assistant",
      text: responseText,
      intent: "ALERT_LOCK",
      language: responseLanguage,
    });

    const audioBase64 = await synthesizeSpeechBase64(responseText, responseLanguage);

    runInBackground(async () => {
      await withTimeout(
        broadcastVoiceMessage({
          text: responseText,
          language: responseLanguage,
          audioBase64,
          eventType: "critical-alert",
        }),
        TIMEOUTS.livekitMs,
        "LiveKit alert broadcast"
      );
    });

    runInBackground(async () => {
      await withTimeout(
        logVoiceInteraction({
          transcript,
          intent: "ALERT_LOCK",
          patientId: alertState.patientId || null,
          language: responseLanguage,
          responseText,
          source: rawText ? "text" : "audio",
        }),
        TIMEOUTS.logMs,
        "voice log"
      );
    });

    return {
      transcript,
      intent: "ALERT_LOCK",
      patientId: alertState.patientId || null,
      language: responseLanguage,
      responseText,
      audioBase64,
    };
  }

  let transcript = cleanedText;

  if (!transcript) {
    try {
      transcript = await withTimeout(
        transcribeAudio(audioBuffer, activeLanguage),
        TIMEOUTS.sttMs,
        "speech-to-text"
      );
    } catch {
      const responseLanguage = normalizeLanguage(getLanguage(sessionId) || "en");
      const responseText = withIntroIfNeeded(sttRetryText(responseLanguage), responseLanguage, sessionId);
      const audioBase64 = await synthesizeSpeechBase64(responseText, responseLanguage);

      appendConversationTurn(sessionId, {
        role: "assistant",
        text: responseText,
        intent: "GENERAL_QUERY",
        language: responseLanguage,
      });

      runInBackground(async () => {
        await withTimeout(
          logVoiceInteraction({
            transcript: "",
            intent: "GENERAL_QUERY",
            patientId: null,
            language: responseLanguage,
            responseText,
            source: "audio",
          }),
          TIMEOUTS.logMs,
          "voice log"
        );
      });

      return {
        transcript: "",
        intent: "GENERAL_QUERY",
        patientId: null,
        language: responseLanguage,
        responseText,
        audioBase64,
      };
    }
  }

  if (!transcript) {
    const responseLanguage = normalizeLanguage(getLanguage(sessionId) || "en");
    const responseText = withIntroIfNeeded(sttRetryText(responseLanguage), responseLanguage, sessionId);
    const audioBase64 = await synthesizeSpeechBase64(responseText, responseLanguage);

    appendConversationTurn(sessionId, {
      role: "assistant",
      text: responseText,
      intent: "GENERAL_QUERY",
      language: responseLanguage,
    });

    return {
      transcript: "",
      intent: "GENERAL_QUERY",
      patientId: null,
      language: responseLanguage,
      responseText,
      audioBase64,
    };
  }

  appendConversationTurn(sessionId, {
    role: "user",
    text: transcript,
    language: activeLanguage,
  });

  let intentResult;
  try {
    intentResult = await withTimeout(detectIntent(transcript), TIMEOUTS.intentMs, "intent detection");
  } catch {
    const fallbackPatientId = extractPatientIdFromText(transcript);
    intentResult = {
      intent: fallbackPatientId ? "PATIENT_STATUS" : "GENERAL_QUERY",
      patientId: fallbackPatientId,
      language: null,
      emotion: "NEUTRAL",
      asksForSummary: false,
    };
  }

  if (isPlatformGuideQuery(transcript) && intentResult.intent !== "LANGUAGE_SWITCH") {
    intentResult = {
      ...intentResult,
      intent: "PLATFORM_GUIDE",
      patientId: null,
      asksForSummary: false,
    };
  }

  let responseLanguage = normalizeLanguage(activeLanguage || getLanguage(sessionId) || "en");
  let responseText = "";
  let resolvedPatientId =
    sanitizePatientId(intentResult.patientId) ||
    extractPatientIdFromText(transcript) ||
    extractRecentPatientIdFromHistory(sessionHistory);
  let resolvedIntent = intentResult.intent || "GENERAL_QUERY";
  let resolvedEmotion = intentResult.emotion || "NEUTRAL";

  if (resolvedIntent === "PLATFORM_GUIDE") {
    resolvedPatientId = null;
  }

  if (intentResult.intent === "LANGUAGE_SWITCH") {
    responseLanguage = setLanguage(intentResult.language || responseLanguage, sessionId);
    resolvedPatientId = null;
    responseText = languageSwitchText(responseLanguage);
  } else {
    const asksPatientSpecific = /status|condition|risk|detail|details|summary|report|oxygen|spo2|heart|bp|temperature|vitals|patient|pid|मरीज|रोगी|स्थिति|हाल/i.test(
      transcript
    );

    if (resolvedIntent === "PATIENT_STATUS" && !resolvedPatientId && isWellbeingQuery(transcript)) {
      resolvedIntent = "GENERAL_QUERY";
    }

    if (resolvedIntent === "ICU_SUMMARY" && resolvedPatientId && asksPatientSpecific) {
      resolvedIntent = "PATIENT_STATUS";
    }

    const inferredPatientName = extractPatientNameFromText(transcript);
    let patient = null;

    if (resolvedPatientId) {
      patient = await resolvePatientProfile(resolvedPatientId, inferredPatientName);
      if (!patient && resolvedIntent === "PATIENT_STATUS") {
        resolvedIntent = "GENERAL_QUERY";
      }
    }

    let summaryData = null;
    const shouldLoadSummary =
      resolvedIntent === "ICU_SUMMARY" ||
      resolvedIntent === "GENERAL_QUERY" ||
      resolvedIntent === "PLATFORM_GUIDE" ||
      Boolean(intentResult.asksForSummary);

    if (shouldLoadSummary) {
      try {
        summaryData = await withTimeout(Patient.summarizePatients(), TIMEOUTS.summaryMs, "patient summary");
      } catch {
        summaryData = null;
      }
    }

    const liveSummary = summaryData?.summary || null;
    const livePatients = Array.isArray(summaryData?.patients) ? summaryData.patients : null;
    const fallbackData = !livePatients || livePatients.length === 0 ? getDummySummary() : null;
    const summary = liveSummary || fallbackData?.summary || null;
    const patientsForContext =
      livePatients && livePatients.length > 0
        ? livePatients
        : Array.isArray(fallbackData?.patients)
          ? fallbackData.patients
          : [];

    let llmReply = null;
    const platformGuide =
      resolvedIntent === "PLATFORM_GUIDE"
        ? buildPlatformGuideContext({
            transcript,
            summary,
            patients: patientsForContext,
          })
        : null;

    try {
      llmReply = await withTimeout(
        generateContextualReply({
          transcript,
          responseLanguage,
          intent: resolvedIntent,
          emotion: resolvedEmotion,
          patient,
          summary,
          sessionHistory,
          platformGuide,
        }),
        TIMEOUTS.replyMs,
        "reply generation"
      );
    } catch {
      llmReply = null;
    }

    if (llmReply && String(llmReply).trim().length > 0) {
      responseText = String(llmReply).trim();

      if (resolvedIntent === "PLATFORM_GUIDE" && platformGuide?.topic === "SHORT_INTRO") {
        responseText = platformGuideText(transcript, responseLanguage, platformGuide);
      }

      if (resolvedIntent === "PLATFORM_GUIDE" && platformGuide?.topic === "PATIENT_DEMO") {
        const requiredPids = listTrainedPatientIds();
        const missing = requiredPids.filter((pid) => !responseText.includes(pid));
        if (missing.length > 0) {
          responseText = `${responseText} Demo PIDs: ${requiredPids.join(", ")}.`.trim();
        }
      }
    } else if (resolvedIntent === "PLATFORM_GUIDE") {
      responseText = platformGuideText(transcript, responseLanguage, platformGuide);
    } else if (resolvedIntent === "PATIENT_STATUS") {
      if (!resolvedPatientId) {
        responseText = askPatientIdentityText(responseLanguage);
      } else {
        responseText = patientStatusText(patient, responseLanguage, inferredPatientName);
        if (patient && !inferredPatientName) {
          responseText += localizedText(
            responseLanguage,
            {
              en: " Please also confirm patient name so records can be matched.",
              hi: " कृपया रोगी का नाम भी बताएं ताकि रिकॉर्ड मैच हो सके।",
              bn: " রেকর্ড মেলাতে রোগীর নামটিও নিশ্চিত করুন।",
              ta: " பதிவுகள் பொருந்த நோயாளியின் பெயரையும் உறுதிப்படுத்தவும்.",
              te: " రికార్డులు సరిపోలడానికి పేషెంట్ పేరును కూడా నిర్ధారించండి.",
              mr: " कृपया रेकॉर्ड जुळण्यासाठी रुग्णाचे नावही पुष्टी करा.",
              gu: " રેકોર્ડ મેળાવવા કૃપા કરીને દર્દીનું નામ પણ ખાતરી કરો.",
              kn: " ದಾಖಲೆಗಳನ್ನು ಹೊಂದಿಸಲು ರೋಗಿಯ ಹೆಸರನ್ನೂ ದೃಢಪಡಿಸಿ.",
              ml: " രേഖകൾ പൊരുത്തപ്പെടുത്താൻ രോഗിയുടെ പേരും സ്ഥിരീകരിക്കുക.",
              pa: " ਰਿਕਾਰਡ ਮੇਲ ਕਰਨ ਲਈ ਮਰੀਜ਼ ਦਾ ਨਾਮ ਵੀ ਪੁਸ਼ਟੀ ਕਰੋ।",
              ur: " ریکارڈ میچ کرنے کے لیے مریض کا نام بھی تصدیق کریں۔",
              or: " ରେକର୍ଡ ମେଳାଇବା ପାଇଁ ରୋଗୀର ନାମ ମଧ୍ୟ ନିଶ୍ଚିତ କରନ୍ତୁ।",
            },
            " Please also confirm patient name so records can be matched."
          );
        }
      }
    } else if (resolvedIntent === "ICU_SUMMARY") {
      if (fallbackData?.summary) {
        responseText = summaryText(fallbackData.summary, responseLanguage, "dummy");
      } else if (summary) {
        responseText = summaryText(summary, responseLanguage, "live");
      } else {
        responseText = fallbackGeneralReply(responseLanguage, resolvedEmotion);
      }
    } else {
      responseText = fallbackGeneralReply(responseLanguage, resolvedEmotion);
    }
  }

  if (resolvedIntent !== "PLATFORM_GUIDE") {
    responseText = withIntroIfNeeded(responseText, responseLanguage, sessionId);
  }

  const audioBase64 = await synthesizeSpeechBase64(responseText, responseLanguage);

  appendConversationTurn(sessionId, {
    role: "assistant",
    text: responseText,
    intent: resolvedIntent,
    emotion: resolvedEmotion,
    language: responseLanguage,
  });

  runInBackground(async () => {
    await withTimeout(
      broadcastVoiceMessage({
        text: responseText,
        language: responseLanguage,
        audioBase64,
        eventType: "doctor-response",
      }),
      TIMEOUTS.livekitMs,
      "LiveKit doctor-response broadcast"
    );
  });

  runInBackground(async () => {
    await withTimeout(
      logVoiceInteraction({
        transcript,
        intent: resolvedIntent,
        patientId: resolvedPatientId,
        language: responseLanguage,
        responseText,
        source: rawText ? "text" : "audio",
      }),
      TIMEOUTS.logMs,
      "voice log"
    );
  });

  return {
    transcript,
    intent: resolvedIntent,
    patientId: resolvedPatientId,
    language: responseLanguage,
    responseText,
    audioBase64,
  };
}

module.exports = {
  processVoiceQuery,
};
