const axios = require("axios");
const { getSarvamLanguageCandidates } = require("./sessionState");

const SARVAM_LANGUAGE_MAP = {
  en: "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
  ta: "ta-IN",
  te: "te-IN",
  mr: "mr-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  pa: "pa-IN",
  ur: "ur-IN",
  or: "or-IN",
  as: "as-IN",
  ne: "ne-NP",
};

function getVoiceCandidates() {
  const femalePreferred = String(process.env.SARVAM_VOICE_FEMALE || "").trim();
  const configured = String(process.env.SARVAM_VOICE || "").trim();
  const forceFemale = String(process.env.SARVAM_FORCE_FEMALE || "true").trim().toLowerCase() !== "false";

  const femaleCandidates = [
    femalePreferred,
    configured,
    "anushka",
  ].filter(Boolean);

  if (forceFemale) {
    return Array.from(new Set(femaleCandidates.length > 0 ? femaleCandidates : ["anushka"]));
  }

  return Array.from(
    new Set([
      femalePreferred,
      "anushka",
      configured,
    ].filter(Boolean))
  );
}

function toTargetLanguageCode(language) {
  const normalized = String(language || "en").trim().toLowerCase();
  return SARVAM_LANGUAGE_MAP[normalized] || "en-IN";
}

function parseJsonBufferForAudio(value) {
  if (!Buffer.isBuffer(value) || value.length === 0) {
    return null;
  }

  const text = value.toString("utf8").trim();
  if (!text.startsWith("{") || !text.includes("audios")) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return toAudioBuffer(parsed);
  } catch {
    return null;
  }
}

function toAudioBuffer(data) {
  if (!data) {
    return null;
  }

  if (Buffer.isBuffer(data)) {
    const extracted = parseJsonBufferForAudio(data);
    if (extracted) {
      return extracted;
    }

    return data;
  }

  if (data instanceof ArrayBuffer) {
    const raw = Buffer.from(data);
    const extracted = parseJsonBufferForAudio(raw);
    if (extracted) {
      return extracted;
    }

    return raw;
  }

  if (typeof data === "string" && data.length > 0) {
    if (data.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(data);
        const extracted = toAudioBuffer(parsed);
        if (extracted) {
          return extracted;
        }
      } catch {
        // If JSON parsing fails, continue with base64 decode.
      }
    }

    return Buffer.from(data, "base64");
  }

  if (typeof data === "object") {
    const audioValue = data.audio || data.audio_base64 || data.output_audio;
    if (typeof audioValue === "string" && audioValue.length > 0) {
      return Buffer.from(audioValue, "base64");
    }

    if (Array.isArray(data.audios) && data.audios[0]) {
      return Buffer.from(String(data.audios[0]), "base64");
    }
  }

  return null;
}

function buildModernPayload(text, language, voice) {
  return {
    text,
    language,
    target_language_code: toTargetLanguageCode(language),
    model: process.env.SARVAM_TTS_MODEL || "bulbul:v3",
    speaker: voice,
    voice,
    format: "mp3",
  };
}

async function requestAudioBuffer({ endpoint, apiKey, payload, responseType = "json" }) {
  const { data } = await axios.post(endpoint, payload, {
    responseType,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  return toAudioBuffer(data);
}

async function synthesizeSpeech(text, language = "en") {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return Buffer.alloc(0);
  }

  const endpoint = process.env.SARVAM_TTS_URL || "https://api.sarvam.ai/text-to-speech";
  const candidates = getSarvamLanguageCandidates(language);
  const voiceCandidates = getVoiceCandidates();
  let lastError = null;

  for (const lang of candidates) {
    for (const voice of voiceCandidates) {
      try {
        const audioBuffer = await requestAudioBuffer({
          endpoint,
          apiKey,
          payload: buildModernPayload(text, lang, voice),
          responseType: "json",
        });
        if (audioBuffer && audioBuffer.length > 0) {
          return audioBuffer;
        }
      } catch (error) {
        lastError = error;

        try {
          const legacyBuffer = await requestAudioBuffer({
            endpoint,
            apiKey,
            payload: {
              text,
              language: lang,
              voice,
              format: "mp3",
            },
            responseType: "arraybuffer",
          });

          if (legacyBuffer && legacyBuffer.length > 0) {
            return legacyBuffer;
          }
        } catch (legacyError) {
          lastError = legacyError;
        }
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("TTS request failed for all language fallbacks");
}

module.exports = {
  synthesizeSpeech,
};
