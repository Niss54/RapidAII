"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import Orb from "@/components/chat/Orb";

export type VoicePostConnectLanguage =
  | "en"
  | "hi"
  | "bn"
  | "ta"
  | "te"
  | "mr"
  | "gu"
  | "kn"
  | "ml"
  | "pa"
  | "ur"
  | "or"
  | "as"
  | "ne";

export type VoicePostConnectStatus = "idle" | "connecting" | "listening" | "processing" | "speaking" | "muted";

export type VoiceTranscriptLine = {
  id: string;
  from: "ai" | "user";
  text: string;
};

type VoiceCallPostConnectUIProps = {
  language: VoicePostConnectLanguage;
  status: VoicePostConnectStatus;
  isMicMuted: boolean;
  isChatOpen: boolean;
  transcriptLines: VoiceTranscriptLine[];
  agentName?: string;
  onToggleMic: () => void;
  onToggleChat: () => void;
  onEndCall: () => void;
};

type LocalizedStatusCopy = {
  heading: string;
  listening: string;
  thinking: string;
  speaking: string;
  muted: string;
  ended: string;
  mutedHint: string;
  speakingChip: string;
  liveTranscript: string;
  muteLabel: string;
  unmuteLabel: string;
  endLabel: string;
};

const COPY_BY_LANGUAGE: Record<VoicePostConnectLanguage, LocalizedStatusCopy> = {
  en: {
    heading: "How can I help you?",
    listening: "Listening... Please speak",
    thinking: "Thinking...",
    speaking: "Speaking...",
    muted: "Microphone is muted",
    ended: "Call ended",
    mutedHint: "You muted the mic. I will wait for you.",
    speakingChip: "AI is speaking",
    liveTranscript: "Live Transcript",
    muteLabel: "Mute",
    unmuteLabel: "Unmute",
    endLabel: "END CALL",
  },
  hi: {
    heading: "मैं आपकी कैसे मदद कर सकता हूं?",
    listening: "सुन रहा हूं... बोलिए",
    thinking: "सोच रहा हूं...",
    speaking: "बोल रहा हूं...",
    muted: "माइक म्यूट है",
    ended: "कॉल समाप्त",
    mutedHint: "आपने माइक म्यूट किया है, मैं प्रतीक्षा कर रहा हूं।",
    speakingChip: "AI बोल रही है",
    liveTranscript: "लाइव ट्रांसक्रिप्ट",
    muteLabel: "म्यूट",
    unmuteLabel: "अनम्यूट",
    endLabel: "कॉल समाप्त",
  },
  bn: {
    heading: "আমি কীভাবে সাহায্য করতে পারি?",
    listening: "শুনছি... বলুন",
    thinking: "ভাবছি...",
    speaking: "বলছি...",
    muted: "মাইক মিউট আছে",
    ended: "কল শেষ",
    mutedHint: "আপনি মাইক মিউট করেছেন, আমি অপেক্ষা করছি।",
    speakingChip: "AI বলছে",
    liveTranscript: "লাইভ ট্রান্সক্রিপ্ট",
    muteLabel: "মিউট",
    unmuteLabel: "আনমিউট",
    endLabel: "কল শেষ",
  },
  ta: {
    heading: "நான் எப்படி உதவலாம்?",
    listening: "கேட்கிறேன்... சொல்லுங்கள்",
    thinking: "யோசிக்கிறேன்...",
    speaking: "பேசுகிறேன்...",
    muted: "மைக் மியூட் செய்யப்பட்டுள்ளது",
    ended: "அழைப்பு முடிந்தது",
    mutedHint: "நீங்கள் மைக் மியூட் செய்துள்ளீர்கள், நான் காத்திருக்கிறேன்.",
    speakingChip: "AI பேசுகிறது",
    liveTranscript: "நேரடி உரை",
    muteLabel: "மியூட்",
    unmuteLabel: "அன்மியூட்",
    endLabel: "அழைப்பை முடி",
  },
  te: {
    heading: "నేను ఎలా సహాయం చేయగలను?",
    listening: "వింటున్నాను... చెప్పండి",
    thinking: "ఆలోచిస్తున్నాను...",
    speaking: "మాట్లాడుతున్నాను...",
    muted: "మైక్ మ్యూట్‌లో ఉంది",
    ended: "కాల్ ముగిసింది",
    mutedHint: "మీరు మైక్ మ్యూట్ చేశారు, నేను వేచి ఉంటాను.",
    speakingChip: "AI మాట్లాడుతోంది",
    liveTranscript: "లైవ్ ట్రాన్స్క్రిప్ట్",
    muteLabel: "మ్యూట్",
    unmuteLabel: "అన్‌మ్యూట్",
    endLabel: "కాల్ ముగించు",
  },
  mr: {
    heading: "मी कशी मदत करू?",
    listening: "ऐकत आहे... बोला",
    thinking: "विचार करत आहे...",
    speaking: "बोलत आहे...",
    muted: "माइक म्यूट आहे",
    ended: "कॉल संपला",
    mutedHint: "तुम्ही माइक म्यूट केला आहे, मी प्रतीक्षा करते आहे.",
    speakingChip: "AI बोलत आहे",
    liveTranscript: "लाईव्ह ट्रान्सक्रिप्ट",
    muteLabel: "म्यूट",
    unmuteLabel: "अनम्यूट",
    endLabel: "कॉल समाप्त",
  },
  gu: {
    heading: "હું કેવી રીતે મદદ કરી શકું?",
    listening: "સાંભળી રહ્યો છું... કહો",
    thinking: "વિચારી રહ્યો છું...",
    speaking: "બોલી રહ્યો છું...",
    muted: "માઈક મ્યૂટ છે",
    ended: "કૉલ પૂર્ણ",
    mutedHint: "તમે માઇક મ્યૂટ કર્યો છે, હું રાહ જોઈ રહ્યો છું.",
    speakingChip: "AI બોલી રહ્યું છે",
    liveTranscript: "લાઈવ ટ્રાન્સક્રિપ્ટ",
    muteLabel: "મ્યૂટ",
    unmuteLabel: "અનમ્યૂટ",
    endLabel: "કૉલ પૂર્ણ",
  },
  kn: {
    heading: "ನಾನು ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
    listening: "ಕೆಳಗಿದ್ದೇನೆ... ಹೇಳಿ",
    thinking: "ಯೋಚಿಸುತ್ತಿದ್ದೇನೆ...",
    speaking: "ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ...",
    muted: "ಮೈಕ್ ಮ್ಯೂಟ್ ಆಗಿದೆ",
    ended: "ಕಾಲ್ ಮುಗಿದಿದೆ",
    mutedHint: "ನೀವು ಮೈಕ್ ಮ್ಯೂಟ್ ಮಾಡಿದ್ದಾರೆ, ನಾನು ಕಾಯುತ್ತಿದ್ದೇನೆ.",
    speakingChip: "AI ಮಾತನಾಡುತ್ತಿದೆ",
    liveTranscript: "ಲೈವ್ ಟ್ರಾನ್ಸ್‌ಕ್ರಿಪ್ಟ್",
    muteLabel: "ಮ್ಯೂಟ್",
    unmuteLabel: "ಅನ್‌ಮ್ಯೂಟ್",
    endLabel: "ಕಾಲ್ ಮುಗಿಸಿ",
  },
  ml: {
    heading: "ഞാൻ എങ്ങനെ സഹായിക്കാം?",
    listening: "കേൾക്കുന്നു... പറയൂ",
    thinking: "ചിന്തിക്കുന്നു...",
    speaking: "സംസാരിക്കുന്നു...",
    muted: "മൈക്ക് മ്യൂട്ട് ആണ്",
    ended: "കോൾ അവസാനിച്ചു",
    mutedHint: "നിങ്ങൾ മൈക്ക് മ്യൂട്ട് ചെയ്തു, ഞാൻ കാത്തിരിക്കുന്നു.",
    speakingChip: "AI സംസാരിക്കുന്നു",
    liveTranscript: "ലൈവ് ട്രാൻസ്ക്രിപ്റ്റ്",
    muteLabel: "മ്യൂട്ട്",
    unmuteLabel: "അൺമ്യൂട്ട്",
    endLabel: "കോൾ അവസാനിപ്പിക്കുക",
  },
  pa: {
    heading: "ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?",
    listening: "ਸੁਣ ਰਿਹਾ ਹਾਂ... ਦੱਸੋ",
    thinking: "ਸੋਚ ਰਿਹਾ ਹਾਂ...",
    speaking: "ਬੋਲ ਰਿਹਾ ਹਾਂ...",
    muted: "ਮਾਈਕ ਮਿਊਟ ਹੈ",
    ended: "ਕਾਲ ਖਤਮ",
    mutedHint: "ਤੁਸੀਂ ਮਾਈਕ ਮਿਊਟ ਕੀਤਾ ਹੈ, ਮੈਂ ਉਡੀਕ ਕਰ ਰਿਹਾ ਹਾਂ।",
    speakingChip: "AI ਬੋਲ ਰਹੀ ਹੈ",
    liveTranscript: "ਲਾਈਵ ਟ੍ਰਾਂਸਕ੍ਰਿਪਟ",
    muteLabel: "ਮਿਊਟ",
    unmuteLabel: "ਅਨਮਿਊਟ",
    endLabel: "ਕਾਲ ਖਤਮ",
  },
  ur: {
    heading: "میں کیسے مدد کر سکتی ہوں؟",
    listening: "سن رہا ہوں... بولیے",
    thinking: "سوچ رہا ہوں...",
    speaking: "بول رہا ہوں...",
    muted: "مائیک میوٹ ہے",
    ended: "کال ختم",
    mutedHint: "آپ نے مائیک میوٹ کیا ہے، میں انتظار کر رہی ہوں۔",
    speakingChip: "AI بول رہی ہے",
    liveTranscript: "لائیو ٹرانسکرپٹ",
    muteLabel: "میوٹ",
    unmuteLabel: "ان میوٹ",
    endLabel: "کال ختم",
  },
  or: {
    heading: "ମୁଁ କିପରି ସହାଯ୍ୟ କରିପାରିବି?",
    listening: "ଶୁଣୁଛି... କହନ୍ତୁ",
    thinking: "ଭାବୁଛି...",
    speaking: "କହୁଛି...",
    muted: "ମାଇକ୍ ମ୍ୟୁଟ୍ ଅଛି",
    ended: "କଲ୍ ସମାପ୍ତ",
    mutedHint: "ଆପଣ ମାଇକ୍ ମ୍ୟୁଟ୍ କରିଛନ୍ତି, ମୁଁ ଅପେକ୍ଷା କରୁଛି।",
    speakingChip: "AI କହୁଛି",
    liveTranscript: "ଲାଇଭ୍ ଟ୍ରାନ୍ସକ୍ରିପ୍ଟ",
    muteLabel: "ମ୍ୟୁଟ୍",
    unmuteLabel: "ଅନ୍ମ୍ୟୁଟ୍",
    endLabel: "କଲ୍ ସମାପ୍ତ",
  },
  as: {
    heading: "মই কেনেকৈ সহায় কৰিব পাৰোঁ?",
    listening: "শুনিছোঁ... কওক",
    thinking: "ভাবিছোঁ...",
    speaking: "ক'ছোঁ...",
    muted: "মাইক মিউট আছে",
    ended: "কল শেষ",
    mutedHint: "আপুনি মাইক মিউট কৰিছে, মই অপেক্ষা কৰি আছোঁ।",
    speakingChip: "AI ক'ছে",
    liveTranscript: "লাইভ ট্রান্সক্রিপ্ট",
    muteLabel: "মিউট",
    unmuteLabel: "আনমিউট",
    endLabel: "কল শেষ",
  },
  ne: {
    heading: "म तपाईंलाई कसरी सहयोग गर्न सक्छु?",
    listening: "सुनिरहेको छु... भन्नुहोस्",
    thinking: "सोचिरहेको छु...",
    speaking: "बोलिरहेको छु...",
    muted: "माइक म्युट छ",
    ended: "कल समाप्त",
    mutedHint: "तपाईंले माइक म्युट गर्नुभएको छ, म पर्खिरहेको छु।",
    speakingChip: "AI बोलिरहेको छ",
    liveTranscript: "लाइभ ट्रान्सक्रिप्ट",
    muteLabel: "म्युट",
    unmuteLabel: "अनम्युट",
    endLabel: "कल समाप्त",
  },
};

function callVisualMode(status: VoicePostConnectStatus, muted: boolean): "listening" | "thinking" | "speaking" | "muted" {
  if (muted || status === "muted") {
    return "muted";
  }

  if (status === "processing" || status === "connecting") {
    return "thinking";
  }

  if (status === "speaking") {
    return "speaking";
  }

  return "listening";
}

function statusText(mode: "listening" | "thinking" | "speaking" | "muted", copy: LocalizedStatusCopy): string {
  if (mode === "thinking") {
    return copy.thinking;
  }

  if (mode === "speaking") {
    return copy.speaking;
  }

  if (mode === "muted") {
    return copy.muted;
  }

  return copy.listening;
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="voice-post-icon-svg">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M6 11a6 6 0 1 0 12 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 17.2V21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="voice-post-icon-svg">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M6 11a6 6 0 1 0 12 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 17.2V21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 4l16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="voice-post-icon-svg">
      <path
        d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5.2l-3.8 3v-3H6.5a2 2 0 0 1-2-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8 9.4h8M8 12.2h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="voice-post-icon-svg">
      <path
        d="M7.2 4.8l2.1 3.4-1.7 1.7a12.4 12.4 0 0 0 6.4 6.4l1.7-1.7 3.4 2.1-1.5 2.9a2 2 0 0 1-2 1.1C8.6 20.2 3.8 15.4 3.2 9.2a2 2 0 0 1 1.1-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M4 4l16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="voice-post-icon-svg">
      <path d="M4 10h4l5-4v12l-5-4H4z" fill="currentColor" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 6.8a7.2 7.2 0 0 1 0 10.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function VoiceCallPostConnectUI({
  language,
  status,
  isMicMuted,
  isChatOpen,
  transcriptLines,
  agentName = "Rapid AI",
  onToggleMic,
  onToggleChat,
  onEndCall,
}: VoiceCallPostConnectUIProps) {
  const [orbFallback, setOrbFallback] = useState(false);
  const copy = COPY_BY_LANGUAGE[language] ?? COPY_BY_LANGUAGE.en;
  const mode = callVisualMode(status, isMicMuted);
  const speaking = mode === "speaking";

  const handleOrbReady = useCallback(() => {
    setOrbFallback(false);
  }, []);

  const handleOrbError = useCallback(() => {
    setOrbFallback(true);
  }, []);

  return (
    <section className="voice-post-screen">
      <div className="voice-post-bg voice-post-bg-gradient" />
      <div className="voice-post-bg voice-post-bg-grid" />
      <div className="voice-post-bg voice-post-bg-glow" />

      <div className="voice-post-content">
        <div className="voice-post-orb-shell">
          <div
            className={`voice-post-orb-canvas voice-post-mode-${mode} ${orbFallback ? "voice-post-orb-canvas-hidden" : ""}`}
          >
            <Orb
              hoverIntensity={2}
              rotateOnHover
              hue={0}
              forceHoverState={speaking}
              enableHover={false}
              backgroundColor="#000000"
              baseRotationSpeed={0.22}
              hoverRotationBoost={0.38}
              onReady={handleOrbReady}
              onError={handleOrbError}
            />
          </div>

          {orbFallback ? <div className={`voice-post-fallback-ring voice-post-fallback-ring-${mode}`} /> : null}

          <div className="voice-post-core-overlay">
            <Image
              src="/assets/rapid.png?v=20260409"
              alt="Rapid AI"
              width={62}
              height={62}
              className="voice-post-logo"
              unoptimized
              priority
            />
            <h2 className="voice-post-agent-name">{agentName}</h2>
            <p className={`voice-post-status voice-post-status-${mode}`}>{statusText(mode, copy)}</p>
            {mode === "muted" ? <p className="voice-post-muted-help">{copy.mutedHint}</p> : null}
          </div>
        </div>

        {speaking ? (
          <div className="voice-post-speaking-pill">
            <VolumeIcon />
            <span>{copy.speakingChip}</span>
          </div>
        ) : null}

        <div className="voice-post-controls">
          <button
            type="button"
            className={`voice-post-control-btn ${isMicMuted ? "voice-post-control-btn-muted" : ""}`}
            onClick={onToggleMic}
            aria-label={isMicMuted ? copy.unmuteLabel : copy.muteLabel}
          >
            {isMicMuted ? <MicOffIcon /> : <MicIcon />}
          </button>

          <button
            type="button"
            className={`voice-post-control-btn ${isChatOpen ? "voice-post-control-btn-chat-open" : ""}`}
            onClick={onToggleChat}
            aria-label={copy.liveTranscript}
          >
            <ChatIcon />
          </button>

          <button type="button" className="voice-post-end-btn" onClick={onEndCall}>
            <PhoneOffIcon />
            <span>{copy.endLabel}</span>
          </button>
        </div>
      </div>

      {isChatOpen ? (
        <div className="voice-post-popup-backdrop" onClick={onToggleChat}>
          <div className="voice-post-popup" onClick={(event) => event.stopPropagation()}>
            <div className="voice-post-popup-head">
              <p>{copy.liveTranscript}</p>
              <button type="button" className="voice-post-popup-close" onClick={onToggleChat} aria-label="Close transcript">
                x
              </button>
            </div>

            <div className="voice-post-popup-body">
              {(transcriptLines.length > 0 ? transcriptLines : [{ id: "empty", from: "ai", text: "..." }]).map((line) => (
                <div
                  key={line.id}
                  className={`voice-post-transcript-line ${line.from === "ai" ? "voice-post-line-ai" : "voice-post-line-user"}`}
                >
                  {line.text}
                </div>
              ))}
            </div>

            <div className="voice-post-popup-actions">
              <button type="button" className="voice-post-popup-action-btn" onClick={onToggleMic}>
                {isMicMuted ? copy.unmuteLabel : copy.muteLabel}
              </button>
              <button type="button" className="voice-post-popup-action-btn voice-post-popup-action-danger" onClick={onEndCall}>
                {copy.endLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
