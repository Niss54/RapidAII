"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { queryVoice, toDataUrl, VoiceLanguage, VoiceQueryResponse } from "@/lib/api";
import VoiceCallPostConnectUI, {
  type VoicePostConnectLanguage,
  type VoicePostConnectStatus,
} from "@/components/chat/VoiceCallPostConnectUI";

const SERVER_BASE = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
const SESSION_STORAGE_KEY = "rapidai-chat-sessions-v3";
const MAX_SAVED_SESSIONS = 120;
const RAPID_LOGO_SRC = "/assets/rapid.png?v=20260409";

type UiLanguage = VoicePostConnectLanguage;

const LANGUAGE_OPTIONS: Array<{ code: UiLanguage; label: string }> = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "mr", label: "Marathi" },
  { code: "gu", label: "Gujarati" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "pa", label: "Punjabi" },
  { code: "ur", label: "Urdu" },
  { code: "or", label: "Odia" },
  { code: "as", label: "Assamese" },
  { code: "ne", label: "Nepali" },
];

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  meta?: string;
  createdAt: string;
};

type ChatSession = {
  id: string;
  title: string;
  language: UiLanguage;
  updatedAt: string;
  messages: ChatMessage[];
};

type UiCopy = {
  subtitle: string;
  placeholder: string;
  patientChat: string;
  startVoiceCall: string;
  endVoiceCall: string;
  home: string;
  newChat: string;
  searchChats: string;
  searchPlaceholder: string;
  recents: string;
  noChatsFound: string;
  send: string;
  thinking: string;
  voiceLabel: string;
  voiceCallStarted: string;
  voiceCallEnded: string;
  voiceCallStoppedNewChat: string;
  voiceCallStoppedChatChanged: string;
  voiceCallPausedOffline: string;
};

const UI_COPY_BY_LANGUAGE: Record<UiLanguage, UiCopy> = {
  en: {
    subtitle:
      "Rapid AI can help with patient status, ICU summaries, trend-based risk explanations, escalation guidance, and quick voice-assisted next steps for bedside care teams.",
    placeholder: "Ask anything",
    patientChat: "Patient Chat",
    startVoiceCall: "Start Voice Call",
    endVoiceCall: "End Voice Call",
    home: "Home",
    newChat: "New chat",
    searchChats: "Search chats",
    searchPlaceholder: "Search chats",
    recents: "Recents",
    noChatsFound: "No chats found.",
    send: "Send",
    thinking: "Rapid AI is thinking...",
    voiceLabel: "Voice",
    voiceCallStarted: "Voice call started.",
    voiceCallEnded: "Voice call ended.",
    voiceCallStoppedNewChat: "Voice call stopped because a new chat was created.",
    voiceCallStoppedChatChanged: "Voice call stopped because the chat was changed.",
    voiceCallPausedOffline: "Voice call paused because backend is offline.",
  },
  hi: {
    subtitle: "Rapid AI मरीज की स्थिति, ICU सारांश, जोखिम विश्लेषण और एस्केलेशन मार्गदर्शन में मदद करता है।",
    placeholder: "कुछ भी पूछें",
    patientChat: "पेशेंट चैट",
    startVoiceCall: "वॉइस कॉल शुरू करें",
    endVoiceCall: "वॉइस कॉल बंद करें",
    home: "होम",
    newChat: "नई चैट",
    searchChats: "चैट खोजें",
    searchPlaceholder: "चैट खोजें",
    recents: "हाल की चैट",
    noChatsFound: "कोई चैट नहीं मिली।",
    send: "भेजें",
    thinking: "Rapid AI सोच रहा है...",
    voiceLabel: "वॉइस",
    voiceCallStarted: "वॉइस कॉल शुरू हुई।",
    voiceCallEnded: "वॉइस कॉल समाप्त हुई।",
    voiceCallStoppedNewChat: "नई चैट बनाने पर वॉइस कॉल बंद कर दी गई।",
    voiceCallStoppedChatChanged: "चैट बदलने पर वॉइस कॉल बंद कर दी गई।",
    voiceCallPausedOffline: "बैकएंड ऑफलाइन होने के कारण वॉइस कॉल रोक दी गई।",
  },
  bn: {
    subtitle: "Rapid AI রোগীর অবস্থা, ICU সারাংশ, ঝুঁকি বিশ্লেষণ এবং এসকেলেশন নির্দেশনায় সহায়তা করে।",
    placeholder: "যেকোনো প্রশ্ন করুন",
    patientChat: "পেশেন্ট চ্যাট",
    startVoiceCall: "ভয়েস কল শুরু করুন",
    endVoiceCall: "ভয়েস কল বন্ধ করুন",
    home: "হোম",
    newChat: "নতুন চ্যাট",
    searchChats: "চ্যাট খুঁজুন",
    searchPlaceholder: "চ্যাট খুঁজুন",
    recents: "সাম্প্রতিক",
    noChatsFound: "কোনো চ্যাট পাওয়া যায়নি।",
    send: "পাঠান",
    thinking: "Rapid AI চিন্তা করছে...",
    voiceLabel: "ভয়েস",
    voiceCallStarted: "ভয়েস কল শুরু হয়েছে।",
    voiceCallEnded: "ভয়েস কল শেষ হয়েছে।",
    voiceCallStoppedNewChat: "নতুন চ্যাট খোলায় ভয়েস কল বন্ধ করা হয়েছে।",
    voiceCallStoppedChatChanged: "চ্যাট বদলানোর কারণে ভয়েস কল বন্ধ করা হয়েছে।",
    voiceCallPausedOffline: "ব্যাকএন্ড অফলাইন থাকায় ভয়েস কল থামানো হয়েছে।",
  },
  ta: {
    subtitle: "Rapid AI நோயாளி நிலை, ICU சுருக்கம், ஆபத்து பகுப்பாய்வு மற்றும் உயர்த்தல் வழிகாட்டலில் உதவுகிறது.",
    placeholder: "ஏதாவது கேளுங்கள்",
    patientChat: "நோயாளர் உரையாடல்",
    startVoiceCall: "குரல் அழைப்பு தொடங்கு",
    endVoiceCall: "குரல் அழைப்பு நிறுத்து",
    home: "முகப்பு",
    newChat: "புதிய உரையாடல்",
    searchChats: "உரையாடல் தேடுக",
    searchPlaceholder: "உரையாடல் தேடுக",
    recents: "சமீபத்தியவை",
    noChatsFound: "உரையாடல் எதுவும் இல்லை.",
    send: "அனுப்பு",
    thinking: "Rapid AI யோசித்து கொண்டிருக்கிறது...",
    voiceLabel: "குரல்",
    voiceCallStarted: "குரல் அழைப்பு தொடங்கியது.",
    voiceCallEnded: "குரல் அழைப்பு முடிந்தது.",
    voiceCallStoppedNewChat: "புதிய உரையாடல் தொடங்கியதால் குரல் அழைப்பு நிறுத்தப்பட்டது.",
    voiceCallStoppedChatChanged: "உரையாடல் மாற்றப்பட்டதால் குரல் அழைப்பு நிறுத்தப்பட்டது.",
    voiceCallPausedOffline: "பின்புல சேவை ஆஃப்லைன் என்பதால் குரல் அழைப்பு நிறுத்தப்பட்டது.",
  },
  te: {
    subtitle: "Rapid AI రోగి స్థితి, ICU సారాంశం, ప్రమాద విశ్లేషణ మరియు ఎస్కలేషన్ మార్గదర్శకంలో సహాయపడుతుంది.",
    placeholder: "ఏదైనా అడగండి",
    patientChat: "పేషెంట్ చాట్",
    startVoiceCall: "వాయిస్ కాల్ ప్రారంభించండి",
    endVoiceCall: "వాయిస్ కాల్ ముగించండి",
    home: "హోమ్",
    newChat: "కొత్త చాట్",
    searchChats: "చాట్ వెతకండి",
    searchPlaceholder: "చాట్ వెతకండి",
    recents: "ఇటీవలి",
    noChatsFound: "చాట్‌లు కనబడలేదు.",
    send: "పంపండి",
    thinking: "Rapid AI ఆలోచిస్తోంది...",
    voiceLabel: "వాయిస్",
    voiceCallStarted: "వాయిస్ కాల్ ప్రారంభమైంది.",
    voiceCallEnded: "వాయిస్ కాల్ ముగిసింది.",
    voiceCallStoppedNewChat: "కొత్త చాట్ ప్రారంభించడంతో వాయిస్ కాల్ నిలిపివేయబడింది.",
    voiceCallStoppedChatChanged: "చాట్ మార్పు కారణంగా వాయిస్ కాల్ నిలిపివేయబడింది.",
    voiceCallPausedOffline: "బ్యాకెండ్ ఆఫ్‌లైన్‌లో ఉండడంతో వాయిస్ కాల్ నిలిపివేయబడింది.",
  },
  mr: {
    subtitle: "Rapid AI रुग्ण स्थिती, ICU सारांश, जोखीम विश्लेषण आणि एस्कलेशन मार्गदर्शनात मदत करते.",
    placeholder: "काहीही विचारा",
    patientChat: "रुग्ण चॅट",
    startVoiceCall: "व्हॉइस कॉल सुरू करा",
    endVoiceCall: "व्हॉइस कॉल थांबवा",
    home: "मुख्यपृष्ठ",
    newChat: "नवीन चॅट",
    searchChats: "चॅट शोधा",
    searchPlaceholder: "चॅट शोधा",
    recents: "अलीकडील",
    noChatsFound: "चॅट सापडल्या नाहीत.",
    send: "पाठवा",
    thinking: "Rapid AI विचार करत आहे...",
    voiceLabel: "व्हॉइस",
    voiceCallStarted: "व्हॉइस कॉल सुरू झाला.",
    voiceCallEnded: "व्हॉइस कॉल संपला.",
    voiceCallStoppedNewChat: "नवीन चॅट सुरू केल्यामुळे व्हॉइस कॉल थांबवला गेला.",
    voiceCallStoppedChatChanged: "चॅट बदलल्यामुळे व्हॉइस कॉल थांबवला गेला.",
    voiceCallPausedOffline: "बॅकएंड ऑफलाइन असल्यामुळे व्हॉइस कॉल थांबवला गेला.",
  },
  gu: {
    subtitle: "Rapid AI દર્દીની સ્થિતિ, ICU સારાંશ, જોખમ વિશ્લેષણ અને એસ્કેલેશન માર્ગદર્શનમાં મદદ કરે છે.",
    placeholder: "કંઈપણ પૂછો",
    patientChat: "પેશન્ટ ચેટ",
    startVoiceCall: "વોઇસ કોલ શરૂ કરો",
    endVoiceCall: "વોઇસ કોલ બંધ કરો",
    home: "હોમ",
    newChat: "નવી ચેટ",
    searchChats: "ચેટ શોધો",
    searchPlaceholder: "ચેટ શોધો",
    recents: "તાજેતરની",
    noChatsFound: "કોઈ ચેટ મળી નથી.",
    send: "મોકલો",
    thinking: "Rapid AI વિચારી રહ્યું છે...",
    voiceLabel: "વોઇસ",
    voiceCallStarted: "વોઇસ કોલ શરૂ થયો.",
    voiceCallEnded: "વોઇસ કોલ પૂર્ણ થયો.",
    voiceCallStoppedNewChat: "નવી ચેટ શરૂ થતા વોઇસ કોલ બંધ કરવામાં આવ્યો.",
    voiceCallStoppedChatChanged: "ચેટ બદલાતા વોઇસ કોલ બંધ કરવામાં આવ્યો.",
    voiceCallPausedOffline: "બેકએન્ડ ઓફલાઇન હોવાથી વોઇસ કોલ રોકવામાં આવ્યો.",
  },
  kn: {
    subtitle: "Rapid AI ರೋಗಿಯ ಸ್ಥಿತಿ, ICU ಸಾರಾಂಶ, ಅಪಾಯ ವಿಶ್ಲೇಷಣೆ ಮತ್ತು ಎಸ್ಕಲೇಷನ್ ಮಾರ್ಗದರ್ಶನದಲ್ಲಿ ಸಹಾಯ ಮಾಡುತ್ತದೆ.",
    placeholder: "ಏನಾದರೂ ಕೇಳಿ",
    patientChat: "ರೋಗಿ ಚಾಟ್",
    startVoiceCall: "ವಾಯ್ಸ್ ಕಾಲ್ ಪ್ರಾರಂಭಿಸಿ",
    endVoiceCall: "ವಾಯ್ಸ್ ಕಾಲ್ ನಿಲ್ಲಿಸಿ",
    home: "ಮುಖಪುಟ",
    newChat: "ಹೊಸ ಚಾಟ್",
    searchChats: "ಚಾಟ್ ಹುಡುಕಿ",
    searchPlaceholder: "ಚಾಟ್ ಹುಡುಕಿ",
    recents: "ಇತ್ತೀಚಿನ",
    noChatsFound: "ಯಾವುದೇ ಚಾಟ್ ಸಿಗಲಿಲ್ಲ.",
    send: "ಕಳುಹಿಸಿ",
    thinking: "Rapid AI ಯೋಚಿಸುತ್ತಿದೆ...",
    voiceLabel: "ವಾಯ್ಸ್",
    voiceCallStarted: "ವಾಯ್ಸ್ ಕಾಲ್ ಆರಂಭವಾಗಿದೆ.",
    voiceCallEnded: "ವಾಯ್ಸ್ ಕಾಲ್ ಮುಗಿದಿದೆ.",
    voiceCallStoppedNewChat: "ಹೊಸ ಚಾಟ್ ಆರಂಭವಾದ್ದರಿಂದ ವಾಯ್ಸ್ ಕಾಲ್ ನಿಲ್ಲಿಸಲಾಗಿದೆ.",
    voiceCallStoppedChatChanged: "ಚಾಟ್ ಬದಲಾದ್ದರಿಂದ ವಾಯ್ಸ್ ಕಾಲ್ ನಿಲ್ಲಿಸಲಾಗಿದೆ.",
    voiceCallPausedOffline: "ಬ್ಯಾಕ್ಎಂಡ್ ಆಫ್‌ಲೈನ್ ಇರುವುದರಿಂದ ವಾಯ್ಸ್ ಕಾಲ್ ನಿಲ್ಲಿಸಲಾಗಿದೆ.",
  },
  ml: {
    subtitle: "Rapid AI രോഗിയുടെ നില, ICU സംഗ്രഹം, റിസ്ക് വിശകലനം, എസ്കലേഷൻ മാർഗ്ഗനിർദ്ദേശം എന്നിവയിൽ സഹായിക്കുന്നു.",
    placeholder: "എന്തും ചോദിക്കൂ",
    patientChat: "പേഷ്യന്റ് ചാറ്റ്",
    startVoiceCall: "വോയ്സ് കോൾ ആരംഭിക്കുക",
    endVoiceCall: "വോയ്സ് കോൾ അവസാനിപ്പിക്കുക",
    home: "ഹോം",
    newChat: "പുതിയ ചാറ്റ്",
    searchChats: "ചാറ്റുകൾ തിരയുക",
    searchPlaceholder: "ചാറ്റുകൾ തിരയുക",
    recents: "സമീപകാലം",
    noChatsFound: "ചാറ്റുകൾ കണ്ടെത്തിയില്ല.",
    send: "അയക്കുക",
    thinking: "Rapid AI ചിന്തിക്കുകയാണ്...",
    voiceLabel: "വോയ്സ്",
    voiceCallStarted: "വോയ്സ് കോൾ ആരംഭിച്ചു.",
    voiceCallEnded: "വോയ്സ് കോൾ അവസാനിച്ചു.",
    voiceCallStoppedNewChat: "പുതിയ ചാറ്റ് ആരംഭിച്ചതിനാൽ വോയ്സ് കോൾ നിർത്തി.",
    voiceCallStoppedChatChanged: "ചാറ്റ് മാറിയതിനാൽ വോയ്സ് കോൾ നിർത്തി.",
    voiceCallPausedOffline: "ബാക്ക്എൻഡ് ഓഫ്‌ലൈൻ ആയതിനാൽ വോയ്സ് കോൾ നിർത്തി.",
  },
  pa: {
    subtitle: "Rapid AI ਮਰੀਜ਼ ਦੀ ਸਥਿਤੀ, ICU ਸਾਰ, ਜੋਖਿਮ ਵਿਸ਼ਲੇਸ਼ਣ ਅਤੇ ਐਸਕਲੇਸ਼ਨ ਮਾਰਗਦਰਸ਼ਨ ਵਿੱਚ ਮਦਦ ਕਰਦਾ ਹੈ।",
    placeholder: "ਕੁਝ ਵੀ ਪੁੱਛੋ",
    patientChat: "ਪੇਸ਼ੈਂਟ ਚੈਟ",
    startVoiceCall: "ਵੋਇਸ ਕਾਲ ਸ਼ੁਰੂ ਕਰੋ",
    endVoiceCall: "ਵੋਇਸ ਕਾਲ ਖਤਮ ਕਰੋ",
    home: "ਹੋਮ",
    newChat: "ਨਵੀਂ ਚੈਟ",
    searchChats: "ਚੈਟ ਖੋਜੋ",
    searchPlaceholder: "ਚੈਟ ਖੋਜੋ",
    recents: "ਹਾਲੀਆ",
    noChatsFound: "ਕੋਈ ਚੈਟ ਨਹੀਂ ਮਿਲੀ।",
    send: "ਭੇਜੋ",
    thinking: "Rapid AI ਸੋਚ ਰਿਹਾ ਹੈ...",
    voiceLabel: "ਵੋਇਸ",
    voiceCallStarted: "ਵੋਇਸ ਕਾਲ ਸ਼ੁਰੂ ਹੋ ਗਈ ਹੈ।",
    voiceCallEnded: "ਵੋਇਸ ਕਾਲ ਖਤਮ ਹੋ ਗਈ ਹੈ।",
    voiceCallStoppedNewChat: "ਨਵੀਂ ਚੈਟ ਬਣਾਉਣ ਕਾਰਨ ਵੋਇਸ ਕਾਲ ਰੋਕ ਦਿੱਤੀ ਗਈ ਹੈ।",
    voiceCallStoppedChatChanged: "ਚੈਟ ਬਦਲਣ ਕਾਰਨ ਵੋਇਸ ਕਾਲ ਰੋਕ ਦਿੱਤੀ ਗਈ ਹੈ।",
    voiceCallPausedOffline: "ਬੈਕਐਂਡ ਆਫਲਾਈਨ ਹੋਣ ਕਾਰਨ ਵੋਇਸ ਕਾਲ ਰੋਕ ਦਿੱਤੀ ਗਈ ਹੈ।",
  },
  ur: {
    subtitle: "Rapid AI مریض کی حالت، ICU خلاصہ، رسک تجزیہ اور ایسکیلیشن رہنمائی میں مدد کرتا ہے۔",
    placeholder: "کچھ بھی پوچھیں",
    patientChat: "مریض چیٹ",
    startVoiceCall: "وائس کال شروع کریں",
    endVoiceCall: "وائس کال بند کریں",
    home: "ہوم",
    newChat: "نئی چیٹ",
    searchChats: "چیٹ تلاش کریں",
    searchPlaceholder: "چیٹ تلاش کریں",
    recents: "حالیہ",
    noChatsFound: "کوئی چیٹ نہیں ملی۔",
    send: "بھیجیں",
    thinking: "Rapid AI سوچ رہا ہے...",
    voiceLabel: "وائس",
    voiceCallStarted: "وائس کال شروع ہو گئی ہے۔",
    voiceCallEnded: "وائس کال ختم ہو گئی ہے۔",
    voiceCallStoppedNewChat: "نئی چیٹ بنانے کی وجہ سے وائس کال بند کر دی گئی ہے۔",
    voiceCallStoppedChatChanged: "چیٹ تبدیل ہونے کی وجہ سے وائس کال بند کر دی گئی ہے۔",
    voiceCallPausedOffline: "بیک اینڈ آف لائن ہونے کی وجہ سے وائس کال روک دی گئی ہے۔",
  },
  or: {
    subtitle: "Rapid AI ରୋଗୀର ସ୍ଥିତି, ICU ସାରାଂଶ, ଝୁମ୍ପ ବିଶ୍ଳେଷଣ ଓ ଏସ୍କେଲେସନ ମାର୍ଗଦର୍ଶନରେ ସାହାଯ୍ୟ କରେ।",
    placeholder: "ଯେକୌଣସି ପ୍ରଶ୍ନ ପଚାରନ୍ତୁ",
    patientChat: "ରୋଗୀ ଚାଟ୍",
    startVoiceCall: "ଭୋଇସ୍ କଲ୍ ଆରମ୍ଭ କରନ୍ତୁ",
    endVoiceCall: "ଭୋଇସ୍ କଲ୍ ବନ୍ଦ କରନ୍ତୁ",
    home: "ହୋମ୍",
    newChat: "ନୂଆ ଚାଟ୍",
    searchChats: "ଚାଟ୍ ଖୋଜନ୍ତୁ",
    searchPlaceholder: "ଚାଟ୍ ଖୋଜନ୍ତୁ",
    recents: "ସମ୍ପ୍ରତି",
    noChatsFound: "କୌଣସି ଚାଟ୍ ମିଳିଲା ନାହିଁ।",
    send: "ପଠାନ୍ତୁ",
    thinking: "Rapid AI ଭାବୁଛି...",
    voiceLabel: "ଭୋଇସ୍",
    voiceCallStarted: "ଭୋଇସ୍ କଲ୍ ଆରମ୍ଭ ହୋଇଛି।",
    voiceCallEnded: "ଭୋଇସ୍ କଲ୍ ସମାପ୍ତ ହୋଇଛି।",
    voiceCallStoppedNewChat: "ନୂଆ ଚାଟ୍ ତିଆରି ହେବାରୁ ଭୋଇସ୍ କଲ୍ ବନ୍ଦ ହେଲା।",
    voiceCallStoppedChatChanged: "ଚାଟ୍ ପରିବର୍ତ୍ତନ ହେବାରୁ ଭୋଇସ୍ କଲ୍ ବନ୍ଦ ହେଲା।",
    voiceCallPausedOffline: "ବ୍ୟାକଏଣ୍ଡ ଅଫଲାଇନ ଥିବାରୁ ଭୋଇସ୍ କଲ୍ ବନ୍ଦ ହେଲା।",
  },
  as: {
    subtitle: "Rapid AI ৰোগীৰ অৱস্থা, ICU summary, risk analysis আৰু escalation guidance ত সহায় কৰে।",
    placeholder: "যিকোনো প্ৰশ্ন সোধক",
    patientChat: "ৰোগী চেট",
    startVoiceCall: "ভইচ কল আৰম্ভ কৰক",
    endVoiceCall: "ভইচ কল বন্ধ কৰক",
    home: "হোম",
    newChat: "নতুন চেট",
    searchChats: "চেট সন্ধান কৰক",
    searchPlaceholder: "চেট সন্ধান কৰক",
    recents: "শেহতীয়া",
    noChatsFound: "কোনো চেট পোৱা নগ'ল।",
    send: "পঠিয়াওক",
    thinking: "Rapid AI ভাবি আছে...",
    voiceLabel: "ভইচ",
    voiceCallStarted: "ভইচ কল আৰম্ভ হৈছে।",
    voiceCallEnded: "ভইচ কল শেষ হৈছে।",
    voiceCallStoppedNewChat: "নতুন চেট খোলাৰ বাবে ভইচ কল বন্ধ কৰা হৈছে।",
    voiceCallStoppedChatChanged: "চেট সলনি হোৱাৰ বাবে ভইচ কল বন্ধ কৰা হৈছে।",
    voiceCallPausedOffline: "backend offline হোৱাৰ বাবে ভইচ কল ৰখা হৈছে।",
  },
  ne: {
    subtitle: "Rapid AI ले बिरामीको अवस्था, ICU सारांश, जोखिम विश्लेषण र escalation guidance मा सहयोग गर्छ।",
    placeholder: "जे पनि सोध्नुहोस्",
    patientChat: "बिरामी च्याट",
    startVoiceCall: "भ्वाइस कल सुरु गर्नुहोस्",
    endVoiceCall: "भ्वाइस कल बन्द गर्नुहोस्",
    home: "होम",
    newChat: "नयाँ च्याट",
    searchChats: "च्याट खोज्नुहोस्",
    searchPlaceholder: "च्याट खोज्नुहोस्",
    recents: "हालसालै",
    noChatsFound: "कुनै च्याट भेटिएन।",
    send: "पठाउनुहोस्",
    thinking: "Rapid AI सोच्दैछ...",
    voiceLabel: "भ्वाइस",
    voiceCallStarted: "भ्वाइस कल सुरु भयो।",
    voiceCallEnded: "भ्वाइस कल समाप्त भयो।",
    voiceCallStoppedNewChat: "नयाँ च्याट सुरु भएकाले भ्वाइस कल रोकियो।",
    voiceCallStoppedChatChanged: "च्याट परिवर्तन भएकाले भ्वाइस कल रोकियो।",
    voiceCallPausedOffline: "backend offline भएकाले भ्वाइस कल रोकियो।",
  },
};

const LANGUAGE_CODES = new Set(LANGUAGE_OPTIONS.map((option) => option.code));
const BACKEND_UNAVAILABLE_TEXT = "Backend is not reachable on port 4000. Start the stack and try again.";

const LANGUAGE_LABEL_BY_CODE: Record<UiLanguage, string> = LANGUAGE_OPTIONS.reduce(
  (acc, option) => ({
    ...acc,
    [option.code]: option.label,
  }),
  {} as Record<UiLanguage, string>
);

const MUTED_REMINDER_BY_LANGUAGE: Record<UiLanguage, string> = {
  en: "You muted the microphone. No problem, I am waiting.",
  hi: "लगता है आपने म्यूट कर दिया है, कोई बात नहीं, मैं प्रतीक्षा कर रही हूं।",
  bn: "আপনি মাইক মিউট করেছেন, সমস্যা নেই, আমি অপেক্ষা করছি।",
  ta: "நீங்கள் மைக் மியூட் செய்துள்ளீர்கள், பிரச்சனை இல்லை, நான் காத்திருக்கிறேன்.",
  te: "మీరు మైక్ మ్యూట్ చేశారు, పరవాలేదు, నేను వేచి ఉంటాను.",
  mr: "तुम्ही माइक म्यूट केला आहे, काही हरकत नाही, मी प्रतीक्षा करते आहे.",
  gu: "તમે માઇક મ્યૂટ કર્યો છે, કોઈ વાંધો નહીં, હું રાહ જોઈ રહી છું.",
  kn: "ನೀವು ಮೈಕ್ ಮ್ಯೂಟ್ ಮಾಡಿದ್ದಾರೆ, ಪರವಾಗಿಲ್ಲ, ನಾನು ಕಾಯುತ್ತಿದ್ದೇನೆ.",
  ml: "നിങ്ങൾ മൈക്ക് മ്യൂട്ട് ചെയ്തിരിക്കുന്നു, പ്രശ്നമില്ല, ഞാൻ കാത്തിരിക്കുന്നു.",
  pa: "ਤੁਸੀਂ ਮਾਈਕ ਮਿਊਟ ਕੀਤਾ ਹੈ, ਕੋਈ ਗੱਲ ਨਹੀਂ, ਮੈਂ ਉਡੀਕ ਕਰ ਰਹੀ ਹਾਂ।",
  ur: "آپ نے مائیک میوٹ کر دیا ہے، کوئی بات نہیں، میں انتظار کر رہی ہوں۔",
  or: "ଆପଣ ମାଇକ୍ ମ୍ୟୁଟ୍ କରିଛନ୍ତି, କିଛି ନୁହେଁ, ମୁଁ ଅପେକ୍ଷା କରୁଛି।",
  as: "আপুনি মাইক মিউট কৰিছে, কোনো সমস্যা নাই, মই অপেক্ষা কৰি আছোঁ।",
  ne: "तपाईंले माइक म्युट गर्नुभएको छ, समस्या छैन, म पर्खिरहेको छु।",
};

function mapUiLanguageToBackendLanguage(language: UiLanguage): VoiceLanguage {
  if (language === "as") {
    return "bn";
  }

  if (language === "ne") {
    return "hi";
  }

  return language;
}

function strictLanguageInstruction(language: UiLanguage): string {
  const label = LANGUAGE_LABEL_BY_CODE[language] || "English";
  return `\n\n[System instruction: Reply strictly in ${label} language only, using native script. Do not use Hinglish, transliteration, or mixed language.]`;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function truncate(text: string, length = 54): string {
  const trimmed = String(text || "").trim();
  if (trimmed.length <= length) {
    return trimmed;
  }

  return `${trimmed.slice(0, length - 1)}...`;
}

function titleFromMessages(messages: ChatMessage[], fallback = "New chat"): string {
  const firstUser = messages.find((message) => message.role === "user" && message.text.trim().length > 0);
  if (!firstUser) {
    return fallback;
  }

  return truncate(firstUser.text);
}

function createSession(language: UiLanguage): ChatSession {
  return {
    id: makeId(),
    title: "New chat",
    language,
    updatedAt: nowIso(),
    messages: [],
  };
}

function readStoredSessions(): ChatSession[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const restored: ChatSession[] = [];

    for (const item of parsed as Array<Record<string, unknown>>) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const id = typeof item.id === "string" && item.id.length > 0 ? item.id : makeId();
      const title = typeof item.title === "string" && item.title.trim().length > 0 ? item.title.trim() : "Saved chat";
      const updatedAt = typeof item.updatedAt === "string" ? item.updatedAt : nowIso();
      const languageRaw = typeof item.language === "string" ? item.language : "en";
      const language = LANGUAGE_CODES.has(languageRaw as UiLanguage)
        ? (languageRaw as UiLanguage)
        : "en";

      const rawMessages = Array.isArray(item.messages) ? (item.messages as Array<Record<string, unknown>>) : [];
      const messages: ChatMessage[] = rawMessages
        .map((message) => {
          const text = typeof message.text === "string" ? message.text.trim() : "";
          if (!text) {
            return null;
          }

          return {
            id: typeof message.id === "string" && message.id.length > 0 ? message.id : makeId(),
            role: message.role === "user" ? "user" : "assistant",
            text,
            meta: typeof message.meta === "string" ? message.meta : undefined,
            createdAt: typeof message.createdAt === "string" ? message.createdAt : nowIso(),
          } as ChatMessage;
        })
        .filter((value): value is ChatMessage => Boolean(value));

      restored.push({
        id,
        title,
        language,
        updatedAt,
        messages,
      });
    }

    return restored
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, MAX_SAVED_SESSIONS);
  } catch {
    return [];
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function mapSpeechLanguage(language: UiLanguage): string {
  const languageMap: Record<UiLanguage, string> = {
    en: "en-US",
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

  return languageMap[language] || "en-US";
}

const FEMALE_VOICE_HINTS = [
  "female",
  "woman",
  "ananya",
  "anushka",
  "zira",
  "aria",
  "salli",
  "neural2-f",
  "wavenet-f",
  "f-",
];

function voiceMatchesLanguage(voice: SpeechSynthesisVoice, targetLang: string): boolean {
  const normalizedVoiceLang = String(voice.lang || "").toLowerCase();
  const normalizedTarget = String(targetLang || "en-US").toLowerCase();

  if (normalizedVoiceLang === normalizedTarget) {
    return true;
  }

  return normalizedVoiceLang.split("-")[0] === normalizedTarget.split("-")[0];
}

function scoreBrowserVoice(voice: SpeechSynthesisVoice, targetLang: string): number {
  const signature = `${voice.name || ""} ${voice.voiceURI || ""}`.toLowerCase();
  let score = 0;

  if (voiceMatchesLanguage(voice, targetLang)) {
    score += 5;
  }

  if (voice.default) {
    score += 1;
  }

  if (FEMALE_VOICE_HINTS.some((hint) => signature.includes(hint))) {
    score += 8;
  }

  if (signature.includes("male")) {
    score -= 6;
  }

  return score;
}

function pickPreferredBrowserVoice(voices: SpeechSynthesisVoice[], language: UiLanguage): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) {
    return null;
  }

  const targetLang = mapSpeechLanguage(language);
  const scored = voices
    .map((voice) => ({ voice, score: scoreBrowserVoice(voice, targetLang) }))
    .sort((left, right) => right.score - left.score);

  return scored[0]?.voice || null;
}

function waitForSpeechVoices(timeoutMs = 800): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve([]);
  }

  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    const synth = window.speechSynthesis;

    const finalize = () => {
      synth.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(synth.getVoices());
    };

    const onVoicesChanged = () => {
      finalize();
    };

    synth.addEventListener("voiceschanged", onVoicesChanged);
    window.setTimeout(finalize, timeoutMs);
  });
}

async function playAudio(base64: string): Promise<boolean> {
  try {
    const audio = new Audio(toDataUrl(base64));
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Audio playback failed"));
      audio.play().catch(reject);
    });
    return true;
  } catch {
    return false;
  }
}

function speakWithBrowser(text: string, language: UiLanguage): Promise<boolean> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve(false);
  }

  const spokenText = String(text || "").trim();
  if (!spokenText) {
    return Promise.resolve(false);
  }

  return new Promise(async (resolve) => {
    try {
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.lang = mapSpeechLanguage(language);

      const voices = await waitForSpeechVoices();
      const preferredVoice = pickPreferredBrowserVoice(voices, language);
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.pitch = preferredVoice ? 1.05 : 1.12;
      utterance.rate = 0.98;
      utterance.onend = () => resolve(true);
      utterance.onerror = () => resolve(false);

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      resolve(false);
    }
  });
}

async function playVoiceResponse(result: VoiceQueryResponse): Promise<void> {
  const hasServerAudio = Boolean(result.audioBase64 && result.audioBase64.length > 0);

  if (hasServerAudio) {
    const played = await playAudio(result.audioBase64 as string);
    if (played) {
      return;
    }
  }

  await speakWithBrowser(result.responseText, result.language);
}

function assistantMessageFromResponse(result: VoiceQueryResponse): ChatMessage {
  return {
    id: makeId(),
    role: "assistant",
    text: result.responseText,
    meta: `intent: ${result.intent}${result.patientId ? ` | patient: ${result.patientId}` : ""}`,
    createdAt: nowIso(),
  };
}

function transcriptMessage(text: string): ChatMessage {
  return {
    id: makeId(),
    role: "user",
    text,
    createdAt: nowIso(),
  };
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="gpt-composer-mic-svg">
      <rect x="4.5" y="10" width="2.4" height="4" rx="1.2" fill="currentColor" />
      <rect x="8.6" y="8" width="2.4" height="8" rx="1.2" fill="currentColor" />
      <rect x="12.7" y="6.6" width="2.4" height="10.8" rx="1.2" fill="currentColor" />
      <rect x="16.8" y="9.2" width="2.4" height="5.6" rx="1.2" fill="currentColor" />
    </svg>
  );
}

function DeleteChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="gpt-recent-delete-icon">
      <path
        d="M9 4.5h6m-8 3h10m-8.3 0-.3 11a1.5 1.5 0 0 0 1.5 1.5h4.2a1.5 1.5 0 0 0 1.5-1.5l-.3-11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 10.5v6m3-6v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const INITIAL_SESSION = createSession("en");

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([INITIAL_SESSION]);
  const [activeSessionId, setActiveSessionId] = useState<string>(INITIAL_SESSION.id);
  const [language, setLanguage] = useState<UiLanguage>(INITIAL_SESSION.language);
  const [input, setInput] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deleteRevealSessionId, setDeleteRevealSessionId] = useState<string | null>(null);

  const [callActive, setCallActive] = useState(false);
  const [callMuted, setCallMuted] = useState(false);
  const [callStatus, setCallStatus] = useState<"idle" | "connecting" | "listening" | "processing" | "speaking" | "muted">("idle");
  const [voiceTranscriptOpen, setVoiceTranscriptOpen] = useState(false);

  const callActiveRef = useRef(false);
  const callMutedRef = useRef(false);
  const languageRef = useRef<UiLanguage>(language);
  const mutedReminderLastSpokenAtRef = useRef(0);
  const consecutiveCallErrorsRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current === null) {
      return;
    }

    if (typeof window !== "undefined") {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = null;
  }, []);

  useEffect(() => {
    const restored = readStoredSessions();
    if (restored.length === 0) {
      return;
    }

    setSessions(restored);
    setActiveSessionId(restored[0].id);
    setLanguage(restored[0].language);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SAVED_SESSIONS)));
    } catch {
      // Ignore storage errors.
    }
  }, [sessions]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    callActiveRef.current = callActive;
  }, [callActive]);

  useEffect(() => {
    callMutedRef.current = callMuted;
    if (callActive) {
      setCallStatus(callMuted ? "muted" : "listening");
    }
  }, [callMuted, callActive]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".gpt-recent-item")) {
        return;
      }

      setDeleteRevealSessionId(null);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null,
    [sessions, activeSessionId]
  );

  const sortedSessions = useMemo(
    () => [...sessions].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [sessions]
  );

  const filteredSessions = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) {
      return sortedSessions;
    }

    return sortedSessions.filter((session) => {
      if (session.title.toLowerCase().includes(needle)) {
        return true;
      }

      return session.messages.some((message) => message.text.toLowerCase().includes(needle));
    });
  }, [sortedSessions, searchQuery]);

  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession]);
  const hasUserMessages = useMemo(() => messages.some((message) => message.role === "user"), [messages]);
  const uiCopy = useMemo(() => UI_COPY_BY_LANGUAGE[language] ?? UI_COPY_BY_LANGUAGE.en, [language]);
  const voiceTranscriptMessages = useMemo(
    () =>
      messages.slice(-10).map((message) => ({
        id: message.id,
        from: message.role === "assistant" ? ("ai" as const) : ("user" as const),
        text: message.text,
      })),
    [messages]
  );

  useEffect(() => {
    if (!hasUserMessages) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, hasUserMessages]);

  useEffect(() => {
    if (!callActive || !callMuted) {
      mutedReminderLastSpokenAtRef.current = 0;
      return;
    }

    const speakReminder = async () => {
      if (!callActiveRef.current || !callMutedRef.current) {
        return;
      }

      const now = Date.now();
      if (now - mutedReminderLastSpokenAtRef.current < 9800) {
        return;
      }

      mutedReminderLastSpokenAtRef.current = now;
      const reminder = MUTED_REMINDER_BY_LANGUAGE[languageRef.current] ?? MUTED_REMINDER_BY_LANGUAGE.en;
      await speakWithBrowser(reminder, languageRef.current);
    };

    void speakReminder();
    const intervalId = window.setInterval(() => {
      void speakReminder();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [callActive, callMuted]);

  const updateActiveSession = useCallback(
    (updater: (session: ChatSession) => ChatSession) => {
      setSessions((previous) => {
        const index = previous.findIndex((session) => session.id === activeSessionId);
        if (index === -1) {
          return previous;
        }

        const current = previous[index];
        const draft = updater(current);
        const title = titleFromMessages(draft.messages, draft.title || current.title || "New chat");

        const updated: ChatSession = {
          ...draft,
          title,
          updatedAt: nowIso(),
        };

        const merged = [...previous];
        merged[index] = updated;

        return merged
          .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
          .slice(0, MAX_SAVED_SESSIONS);
      });
    },
    [activeSessionId]
  );

  const appendMessage = useCallback(
    (message: ChatMessage) => {
      updateActiveSession((session) => ({
        ...session,
        messages: [...session.messages, message],
      }));
    },
    [updateActiveSession]
  );

  const setSessionLanguage = useCallback(
    (nextLanguage: UiLanguage) => {
      setLanguage(nextLanguage);
      setSessions((previous) =>
        previous.map((session) =>
          session.id === activeSessionId
            ? {
                ...session,
                language: nextLanguage,
              }
            : session
        )
      );
    },
    [activeSessionId]
  );

  const checkBackendAvailability = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") {
      return false;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);

    try {
      const response = await fetch(`${SERVER_BASE}/health`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      return response.ok;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  async function captureVoiceChunk(durationMs = 4200): Promise<string | null> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    return new Promise((resolve, reject) => {
      try {
        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        } catch {
          recorder = new MediaRecorder(stream);
        }

        const chunks: BlobPart[] = [];

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onerror = () => {
          stream.getTracks().forEach((track) => track.stop());
          reject(new Error("Voice recording failed"));
        };

        recorder.onstop = async () => {
          try {
            const blob = new Blob(chunks, { type: "audio/webm" });
            if (blob.size === 0) {
              resolve(null);
              return;
            }

            const base64 = arrayBufferToBase64(await blob.arrayBuffer());
            resolve(base64);
          } catch (error) {
            reject(error instanceof Error ? error : new Error("Failed to parse voice chunk"));
          } finally {
            stream.getTracks().forEach((track) => track.stop());
          }
        };

        recorder.start();
        window.setTimeout(() => {
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        }, durationMs);
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        reject(error instanceof Error ? error : new Error("Could not initialize recorder"));
      }
    });
  }

  function stopVoiceCall(reasonText?: string) {
    if (!callActiveRef.current) {
      return;
    }

    callActiveRef.current = false;
    setCallActive(false);
    setCallStatus("idle");
    setVoiceTranscriptOpen(false);
    mutedReminderLastSpokenAtRef.current = 0;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (reasonText) {
      appendMessage({
        id: makeId(),
        role: "assistant",
        text: reasonText,
        meta: "voice call",
        createdAt: nowIso(),
      });

      if (reasonText === uiCopy.voiceCallEnded) {
        void (async () => {
          try {
            const result = await queryVoice({
              text: reasonText,
              language: mapUiLanguageToBackendLanguage(languageRef.current),
              userId: activeSessionId,
            });

            if (result.transcript && result.transcript.trim().length > 0) {
              appendMessage(transcriptMessage(result.transcript.trim()));
            }
            appendMessage(assistantMessageFromResponse(result));
          } catch {
            // Ignore backend notification failures here.
          }
        })();
      }
    }

    consecutiveCallErrorsRef.current = 0;
  }

  async function runVoiceCallLoop(): Promise<void> {
    if (!callActiveRef.current) {
      return;
    }

    if (callMutedRef.current) {
      setCallStatus("muted");
      window.setTimeout(() => {
        void runVoiceCallLoop();
      }, 600);
      return;
    }

    setCallStatus("listening");

    let audioBase64: string | null = null;
    try {
      audioBase64 = await captureVoiceChunk();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access failed");
      if (callActiveRef.current) {
        window.setTimeout(() => {
          void runVoiceCallLoop();
        }, 900);
      }
      return;
    }

    if (!callActiveRef.current) {
      return;
    }

    if (!audioBase64) {
      window.setTimeout(() => {
        void runVoiceCallLoop();
      }, 350);
      return;
    }

    setCallStatus("processing");

    try {
      const result = await queryVoice({
        audioBase64,
        language: mapUiLanguageToBackendLanguage(languageRef.current),
        userId: activeSessionId,
      });

      consecutiveCallErrorsRef.current = 0;
      if (
        result.intent === "LANGUAGE_SWITCH" &&
        result.language !== mapUiLanguageToBackendLanguage(languageRef.current)
      ) {
        setSessionLanguage(result.language);
      }

      if (result.transcript && result.transcript.trim().length > 0) {
        appendMessage(transcriptMessage(result.transcript.trim()));
      }

      appendMessage(assistantMessageFromResponse(result));
      setCallStatus("speaking");
      await playVoiceResponse(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Voice processing failed";
      const ignorable = /recognize|no speech|timeout|could not recognize/i.test(message);
      const networkIssue = /failed to fetch|connection|refused|network|internal server error/i.test(message.toLowerCase());

      if (!ignorable && !networkIssue) {
        setError(message || "Voice processing failed");
      }

      if (networkIssue) {
        consecutiveCallErrorsRef.current += 1;
      }

      if (consecutiveCallErrorsRef.current >= 2) {
        setError(BACKEND_UNAVAILABLE_TEXT);
        stopVoiceCall(uiCopy.voiceCallPausedOffline);
        return;
      }
    }

    if (callActiveRef.current) {
      window.setTimeout(() => {
        void runVoiceCallLoop();
      }, 300);
    }
  }

  async function startVoiceCall() {
    if (callActiveRef.current) {
      return;
    }

    const backendReady = await checkBackendAvailability();
    if (!backendReady) {
      setError(BACKEND_UNAVAILABLE_TEXT);
      return;
    }

    setError("");
    setCallMuted(false);
    setVoiceTranscriptOpen(false);
    callMutedRef.current = false;
    consecutiveCallErrorsRef.current = 0;
    mutedReminderLastSpokenAtRef.current = 0;

    setCallActive(true);
    callActiveRef.current = true;
    setCallStatus("connecting");

    appendMessage({
      id: makeId(),
      role: "assistant",
      text: uiCopy.voiceCallStarted,
      meta: "voice call",
      createdAt: nowIso(),
    });

    window.setTimeout(() => {
      if (callActiveRef.current) {
        void runVoiceCallLoop();
      }
    }, 220);
  }

  function createNewConversation() {
    if (callActiveRef.current) {
      stopVoiceCall(uiCopy.voiceCallStoppedNewChat);
    }

    const session = createSession(language);
    session.title = uiCopy.newChat;

    setSessions((previous) => [session, ...previous].slice(0, MAX_SAVED_SESSIONS));
    setActiveSessionId(session.id);
    setLanguage(session.language);
    setInput("");
    setError("");
  }

  function selectConversation(sessionId: string) {
    const selected = sessions.find((session) => session.id === sessionId);
    if (!selected) {
      return;
    }

    if (callActiveRef.current) {
      stopVoiceCall(uiCopy.voiceCallStoppedChatChanged);
    }

    setActiveSessionId(selected.id);
    setLanguage(selected.language);
    setError("");
    setInput("");
    setDeleteRevealSessionId(null);
  }

  function revealDeleteForSession(sessionId: string) {
    setDeleteRevealSessionId(sessionId);
  }

  function startDeleteLongPress(sessionId: string) {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      revealDeleteForSession(sessionId);
      longPressTriggeredRef.current = true;
      longPressTimerRef.current = null;
    }, 520);
  }

  function deleteConversation(sessionId: string) {
    if (callActiveRef.current && sessionId === activeSessionId) {
      stopVoiceCall(uiCopy.voiceCallStoppedChatChanged);
    }

    const remaining = sessions
      .filter((session) => session.id !== sessionId)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, MAX_SAVED_SESSIONS);

    if (remaining.length === 0) {
      const fallbackSession = createSession(languageRef.current);
      fallbackSession.title = UI_COPY_BY_LANGUAGE[fallbackSession.language]?.newChat ?? fallbackSession.title;

      setSessions([fallbackSession]);
      setActiveSessionId(fallbackSession.id);
      setLanguage(fallbackSession.language);
      setDeleteRevealSessionId(null);
      setInput("");
      setError("");
      return;
    }

    let nextActiveSessionId = activeSessionId;
    let nextLanguage = language;

    if (sessionId === activeSessionId) {
      nextActiveSessionId = remaining[0].id;
      nextLanguage = remaining[0].language;
      setInput("");
      setError("");
    }

    setSessions(remaining);
    setActiveSessionId(nextActiveSessionId);
    setLanguage(nextLanguage);
    setDeleteRevealSessionId(null);
  }

  async function sendText(text: string) {
    const command = text.trim();
    if (!command || !activeSession) {
      return;
    }

    setError("");
    setSubmitting(true);

    appendMessage({
      id: makeId(),
      role: "user",
      text: command,
      createdAt: nowIso(),
    });

    try {
      const result = await queryVoice({
        text: `${command}${strictLanguageInstruction(languageRef.current)}`,
        language: mapUiLanguageToBackendLanguage(languageRef.current),
        userId: activeSession.id,
      });

      if (
        result.intent === "LANGUAGE_SWITCH" &&
        result.language !== mapUiLanguageToBackendLanguage(languageRef.current)
      ) {
        setSessionLanguage(result.language);
      }
      appendMessage(assistantMessageFromResponse(result));
      void playVoiceResponse(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to process message";
      const networkIssue = /failed to fetch|connection|refused|network|internal server error/i.test(message.toLowerCase());
      setError(networkIssue ? BACKEND_UNAVAILABLE_TEXT : message);
    } finally {
      setSubmitting(false);
    }
  }

  function submitInput() {
    const command = input.trim();
    if (!command || submitting) {
      return;
    }

    setInput("");
    void sendText(command);
  }

  function toggleSearch() {
    setSearchOpen((previous) => {
      const next = !previous;
      if (!next) {
        setSearchQuery("");
      }
      return next;
    });
  }

  const renderComposer = (className?: string) => (
    <div className={`gpt-composer ${className ?? ""}`.trim()}>
      <button
        type="button"
        className="gpt-composer-icon gpt-composer-plus-btn"
        onClick={createNewConversation}
        aria-label={uiCopy.newChat}
      >
        +
      </button>

      <input
        className="gpt-composer-input"
        placeholder={uiCopy.placeholder}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitInput();
          }
        }}
      />

      <button
        type="button"
        className={`gpt-composer-icon gpt-composer-mic-btn ${callActive ? "gpt-composer-icon-active" : ""}`}
        onClick={() => {
          if (callActive) {
            stopVoiceCall(uiCopy.voiceCallEnded);
            return;
          }

          void startVoiceCall();
        }}
        aria-label={uiCopy.voiceLabel}
      >
        <MicIcon />
      </button>

      <button type="button" className="gpt-send-btn" onClick={submitInput} disabled={submitting}>
        {submitting ? "..." : uiCopy.send}
      </button>
    </div>
  );

  if (callActive) {
    return (
      <VoiceCallPostConnectUI
        language={language}
        status={callStatus as VoicePostConnectStatus}
        isMicMuted={callMuted}
        isChatOpen={voiceTranscriptOpen}
        transcriptLines={voiceTranscriptMessages}
        agentName="Rapid AI"
        onToggleMic={() => setCallMuted((previous) => !previous)}
        onToggleChat={() => setVoiceTranscriptOpen((previous) => !previous)}
        onEndCall={() => stopVoiceCall(uiCopy.voiceCallEnded)}
      />
    );
  }

  return (
    <div className="page-shell gpt-chat-page">
      <main className="gpt-chat-shell">
        <aside className="gpt-sidebar">
          <div className="gpt-sidebar-brand">
            <Image
              src={RAPID_LOGO_SRC}
              alt="Rapid AI logo"
              width={34}
              height={34}
              className="rounded-md object-cover"
              style={{ width: "34px", height: "34px" }}
              unoptimized
              priority
            />
            <div>
              <p className="gpt-brand-title">Rapid AI</p>
              <p className="gpt-brand-subtitle">Care Copilot</p>
            </div>
          </div>

          <button type="button" className="gpt-sidebar-btn" onClick={createNewConversation}>
            + {uiCopy.newChat}
          </button>

          <button type="button" className="gpt-sidebar-btn" onClick={toggleSearch}>
            {uiCopy.searchChats}
          </button>

          {searchOpen ? (
            <input
              ref={searchInputRef}
              className="gpt-sidebar-search"
              placeholder={uiCopy.searchPlaceholder}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          ) : null}

          <p className="gpt-sidebar-label">{uiCopy.recents}</p>

          <div className="gpt-recents-wrap">
            {filteredSessions.length === 0 ? <p className="gpt-recents-empty">{uiCopy.noChatsFound}</p> : null}

            {filteredSessions.map((session) => (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                className={`gpt-recent-item ${session.id === activeSessionId ? "gpt-recent-item-active" : ""} ${
                  deleteRevealSessionId === session.id ? "gpt-recent-item-delete-visible" : ""
                }`}
                onClick={() => {
                  if (longPressTriggeredRef.current) {
                    longPressTriggeredRef.current = false;
                    return;
                  }

                  selectConversation(session.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectConversation(session.id);
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  revealDeleteForSession(session.id);
                }}
                onTouchStart={() => startDeleteLongPress(session.id)}
                onTouchEnd={() => {
                  clearLongPressTimer();
                }}
                onTouchCancel={() => {
                  clearLongPressTimer();
                  longPressTriggeredRef.current = false;
                }}
                onTouchMove={() => {
                  clearLongPressTimer();
                }}
              >
                <div className="gpt-recent-title-row">
                  <span className="gpt-recent-title">
                    {session.messages.length === 0 ? UI_COPY_BY_LANGUAGE[session.language]?.newChat ?? session.title : session.title}
                  </span>

                  <button
                    type="button"
                    className="gpt-recent-delete-btn"
                    aria-label="Delete chat"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteConversation(session.id);
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <DeleteChatIcon />
                  </button>
                </div>

                <span className="gpt-recent-time">{new Date(session.updatedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </aside>

        <section className="gpt-main">
          <header className="gpt-main-top">
            <div>
              <p className="gpt-main-heading">{uiCopy.patientChat}</p>
              {callActive ? <p className="gpt-call-pill">{uiCopy.voiceLabel}</p> : null}
            </div>

            <div className="gpt-main-actions">
              <button
                type="button"
                className="gpt-top-btn gpt-top-btn-ghost"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.location.href = "/";
                  }
                }}
              >
                {uiCopy.home}
              </button>

              <button
                type="button"
                className={`gpt-top-btn ${callActive ? "gpt-top-btn-danger" : "gpt-top-btn-green"}`}
                onClick={() => {
                  if (callActive) {
                    stopVoiceCall(uiCopy.voiceCallEnded);
                    return;
                  }

                  void startVoiceCall();
                }}
              >
                {callActive ? uiCopy.endVoiceCall : uiCopy.startVoiceCall}
              </button>

              <select
                className="gpt-lang-select"
                value={language}
                onChange={(event) => setSessionLanguage(event.target.value as UiLanguage)}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </header>

          {error ? <p className="gpt-error-banner">{error}</p> : null}

          <div className={`gpt-thread ${hasUserMessages ? "gpt-thread-started" : "gpt-thread-empty"}`}>
            {!hasUserMessages ? (
              <div className="gpt-empty-state">
                <Image
                  src={RAPID_LOGO_SRC}
                  alt="Rapid AI"
                  width={88}
                  height={88}
                  className="gpt-empty-logo"
                  style={{ width: "88px", height: "88px" }}
                  unoptimized
                />
                <p className="gpt-empty-subtitle">{uiCopy.subtitle}</p>
                {renderComposer("gpt-composer-center")}
              </div>
            ) : (
              <>
                <div className="gpt-messages">
                  {messages.map((message) =>
                    message.role === "user" ? (
                      <article key={message.id} className="gpt-msg-user-row">
                        <div className="gpt-msg-user">{message.text}</div>
                      </article>
                    ) : (
                      <article key={message.id} className="gpt-msg-ai-row">
                        <p className="gpt-msg-ai">{message.text}</p>
                        {message.meta ? <p className="gpt-msg-ai-meta">{message.meta}</p> : null}
                      </article>
                    )
                  )}

                  {submitting ? <p className="gpt-thinking">{uiCopy.thinking}</p> : null}
                  <div ref={messagesEndRef} />
                </div>

                <div className="gpt-composer-dock">{renderComposer("gpt-composer-bottom")}</div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
