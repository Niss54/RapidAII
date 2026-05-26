const { getVoiceKnowledgeContext } = require("./voiceKnowledgeService");
const { listTrainedPatientProfiles } = require("./trainedPatientProfiles");

const PLATFORM_GUIDE_QUERY_PATTERN =
  /rapid\s*ai|rapidai|feature|features|how to use|kaise use|website|dashboard|api\s*doc|api\s*reference|endpoint|api key|x-api-key|developer|hospital|integration|hl7|serial|whatsapp|escalation|unique|uniqueness|market|difference|a2z|everything|demo|judge|overview|readme|presentation|short|long|detail|realtime|real-time|\bpid\b|patient data|kaise work|how it works|workflow/i;

const LANGUAGE_FALLBACK_ALIAS = Object.freeze({
  as: "bn",
  ne: "hi",
});

const DYNAMIC_GUIDE_COPY = Object.freeze({
  en: {
    shortIntro: "Rapid AI is a real-time ICU copilot for risk detection and fast clinical response.",
    realtimeSentence: "Rapid AI works in real time for telemetry, risk updates, alerts, and voice responses.",
    featuresWorkflowPrefix: "How it works end-to-end: telemetry ingestion, decoder normalization, identity resolution, risk scoring, near-term forecast, voice/alert escalation, and timeline persistence.",
    patientDemoPrefix: "Trained demo patient PIDs are",
    patientDemoHowToAsk: "Ask: status of patient 901, 902, or 903 for detailed condition.",
  },
  hi: {
    shortIntro: "Rapid AI एक रियल-टाइम ICU copilot है जो deterioration risk जल्दी पकड़ता है और तुरंत response देता है।",
    realtimeSentence: "Rapid AI रियल-टाइम में काम करता है और telemetry, risk, alerts और voice response तुरंत अपडेट करता है।",
    featuresWorkflowPrefix: "एंड-टू-एंड workflow: telemetry ingestion, decoder normalization, identity resolution, risk scoring, next-step forecast, voice/alert escalation, और timeline persistence.",
    patientDemoPrefix: "ट्रेंड डेमो patient PID हैं",
    patientDemoHowToAsk: "पूछें: status of patient 901, 902, या 903, तब पूरी condition detail मिलेगी।",
  },
  mr: {
    shortIntro: "Rapid AI हे रिअल-टाइम ICU copilot आहे जे deterioration risk लवकर ओळखते आणि त्वरित response देते.",
    realtimeSentence: "Rapid AI रिअल-टाइममध्ये काम करते आणि telemetry, risk, alerts आणि voice response सतत अपडेट करते.",
    featuresWorkflowPrefix: "एंड-टू-एंड workflow: telemetry ingestion, decoder normalization, identity resolution, risk scoring, near-term forecast, voice/alert escalation आणि timeline persistence.",
    patientDemoPrefix: "ट्रेंड डेमो patient PID आहेत",
    patientDemoHowToAsk: "विचारा: status of patient 901, 902 किंवा 903, म्हणजे पूर्ण condition detail मिळेल.",
  },
});

const README_ALIGNED_CONTEXT = Object.freeze({
  sourceOfTruth: {
    primaryDocument: "README.md",
    scope: "SECTION 1 to SECTION 22",
    alignmentRule: "Prefer README-aligned implemented facts over assumptions.",
  },
  productSummary:
    "Rapid AI is a real-time ICU telemetry intelligence platform that decodes telemetry, resolves patient identity, computes risk, predicts near-term deterioration, and escalates critical alerts via dashboard, voice, and optional WhatsApp.",
  coreFeatures: [
    "Structured and hex telemetry ingestion with decoder warnings",
    "Identity collision resolver with deterministic fallback IDs",
    "Risk engine with STABLE, WARNING, MODERATE, CRITICAL bands",
    "5-minute risk forecasting with ML and deterministic fallback",
    "Voice pipeline with STT, intent, contextual reply, TTS, and LiveKit broadcast",
    "Timeline persistence for telemetry, alerts, and voice interactions",
    "API key platform with generation, regeneration, expiry, and daily quota enforcement",
    "HL7 TCP and serial bridge adapters for ICU monitor connectivity",
  ],
  websiteUsageFlow: [
    "Use /dashboard for ICU summary, alert timeline, forecast panels, and integration status",
    "Use /chat and voice query for patient status, ICU summary, and operational help",
    "Use /docs/api for endpoint examples and quickstart references",
    "Use /dashboard/api-access to manage API keys by user ID",
  ],
  apiKeyFlow: [
    "GET /api-key/my-key with x-user-id returns metadata and auto-creates a key when needed",
    "POST /api-key/regenerate with x-user-id rotates the key and returns raw api_key once",
    "POST /api-key/upgrade enables paid premium plans (premium_monthly or premium_yearly)",
    "Billing demo endpoints /billing/plans, /billing/checkout, and /billing/confirm use Razorpay test mode",
    "Protected endpoints require x-api-key, including /telemetry, /voice, /icu, and /integration",
    "Free developer tier in docs UI: 1000 requests and 30-day expiry; premium plans: $5/month or $60/year",
  ],
  developerUsage: [
    "Core routes: /telemetry/update, /voice/query, /icu/summary, /icu/timeline, /integration/status",
    "Analytics routes: /api/v1/forecast/next and /api/v1/alerts",
    "Auth failures return 401 with x-api-key validation errors",
    "Daily usage is tracked and limited by plan",
  ],
  hospitalWorkflow: [
    "Ingest monitor streams via HL7 listener or serial bridge",
    "Track risk transitions and forecast trend before deterioration",
    "Critical cases trigger dashboard stream, voice broadcast, and optional WhatsApp escalation",
    "Timeline and drilldown support clinical handoff and audit history",
  ],
  whatsappEscalation: [
    "WhatsApp integration is optional and can be active or inactive",
    "GET /integration/whatsapp-status returns configuration state",
    "GET /integration/test-whatsapp-alert simulates critical alert escalation",
    "Webhook /whatsapp/webhook is active when VERIFY_TOKEN is configured",
  ],
  uniqueness:
    "Rapid AI integrates telemetry decode, identity resolution, risk + forecast intelligence, multilingual voice interaction, real-time broadcast, external escalation, and API governance in one ICU workflow.",
});

const PLATFORM_GUIDE_REPLIES = Object.freeze({
  en: {
    OVERVIEW:
      "Rapid AI is a real-time ICU telemetry intelligence platform. To start, generate an API key from /dashboard/api-access or /api-key/my-key, send telemetry to /telemetry/update, monitor /icu/summary and /icu/timeline, and use /voice/query for natural-language updates. API docs are available at /docs/api.",
    API_KEY:
      "For API access, use /dashboard/api-access or call GET /api-key/my-key with x-user-id. Rotate with POST /api-key/regenerate. Paid upgrades use POST /api-key/upgrade or the demo billing flow at /billing/checkout plus /billing/confirm (Razorpay test mode). Use x-api-key on protected routes such as /telemetry, /voice, /icu, and /integration. Free tier is 1000 requests with 30-day expiry, and premium plans are $5/month or $60/year.",
    DEVELOPER:
      "Developers can start from /docs/api. Core routes include /telemetry/update, /voice/query, /icu/summary, /icu/timeline, and /integration/status. Analytics routes include /api/v1/forecast/next and /api/v1/alerts. Protected calls require x-api-key.",
    HOSPITAL:
      "Hospital workflow uses HL7 listener and serial bridge for telemetry ingestion. Rapid AI computes risk and 5-minute forecast, then shows transitions on dashboard timelines. Critical deterioration can trigger dashboard stream, voice broadcast, and optional WhatsApp escalation.",
    WHATSAPP:
      "WhatsApp alerts are optional. Check status via /integration/whatsapp-status and test flow with /integration/test-whatsapp-alert. Webhook verification uses /whatsapp/webhook when VERIFY_TOKEN is configured. If credentials are missing, integration remains safely inactive.",
    UNIQUENESS:
      "Rapid AI is unique because it combines telemetry decode, identity resolution, risk plus forecasting intelligence, multilingual voice, real-time broadcast, optional WhatsApp escalation, and API-key governance in one deployable ICU workflow.",
  },
  hi: {
    OVERVIEW:
      "रैपिड एआई एक रियल-टाइम ICU टेलीमेट्री इंटेलिजेंस प्लेटफॉर्म है। शुरुआत के लिए /dashboard/api-access या /api-key/my-key से API key लें, /telemetry/update पर डेटा भेजें, /icu/summary और /icu/timeline मॉनिटर करें, और /voice/query से नैचुरल-लैंग्वेज अपडेट लें। API docs /docs/api पर उपलब्ध हैं।",
    API_KEY:
      "API key के लिए /dashboard/api-access इस्तेमाल करें या x-user-id के साथ GET /api-key/my-key कॉल करें। key rotate करने के लिए POST /api-key/regenerate है। /telemetry, /voice, /icu और /integration जैसे protected routes पर x-api-key अनिवार्य है। docs के free tier में 1000 requests और 30-day expiry है।",
    DEVELOPER:
      "डेवलपर्स /docs/api से शुरू कर सकते हैं। मुख्य routes हैं /telemetry/update, /voice/query, /icu/summary, /icu/timeline और /integration/status। analytics routes में /api/v1/forecast/next और /api/v1/alerts हैं। protected calls में x-api-key देना जरूरी है।",
    HOSPITAL:
      "हॉस्पिटल workflow में HL7 listener और serial bridge से telemetry ingestion होती है। Rapid AI risk score और 5-minute forecast निकालता है, फिर dashboard timeline में transitions दिखाता है। critical deterioration पर dashboard stream, voice broadcast और optional WhatsApp escalation trigger हो सकती है।",
    WHATSAPP:
      "WhatsApp alerts optional integration है। status के लिए /integration/whatsapp-status देखें और test के लिए /integration/test-whatsapp-alert चलाएं। VERIFY_TOKEN configured होने पर /whatsapp/webhook verification active होता है। credentials missing होने पर integration safe inactive mode में रहता है।",
    UNIQUENESS:
      "Rapid AI की uniqueness यह है कि telemetry decode, identity resolution, risk + forecasting intelligence, multilingual voice, real-time broadcast, optional WhatsApp escalation और API-key governance एक ही deployable ICU workflow में integrated हैं।",
  },
  bn: {
    OVERVIEW:
      "র‍্যাপিড এআই একটি রিয়েল-টাইম ICU টেলিমেট্রি ইন্টেলিজেন্স প্ল্যাটফর্ম। শুরু করতে /dashboard/api-access বা /api-key/my-key থেকে API key নিন, /telemetry/update এ ডেটা পাঠান, /icu/summary ও /icu/timeline মনিটর করুন, এবং /voice/query ব্যবহার করুন। API docs আছে /docs/api এ।",
    API_KEY:
      "API key পেতে /dashboard/api-access ব্যবহার করুন বা x-user-id সহ GET /api-key/my-key কল করুন। rotate করতে POST /api-key/regenerate ব্যবহার করুন। /telemetry, /voice, /icu এবং /integration এর মতো protected route-এ x-api-key বাধ্যতামূলক।",
    DEVELOPER:
      "ডেভেলপাররা /docs/api থেকে শুরু করতে পারেন। মূল route: /telemetry/update, /voice/query, /icu/summary, /icu/timeline, /integration/status। analytics route: /api/v1/forecast/next এবং /api/v1/alerts। protected call-এ x-api-key লাগবে।",
    HOSPITAL:
      "হাসপাতাল workflow-এ HL7 listener এবং serial bridge দিয়ে telemetry ingest হয়। Rapid AI risk score ও 5-minute forecast তৈরি করে এবং dashboard timeline-এ transition দেখায়। critical deterioration হলে dashboard stream, voice broadcast এবং optional WhatsApp escalation চালু হতে পারে।",
    WHATSAPP:
      "WhatsApp alert optional integration। status দেখতে /integration/whatsapp-status এবং test করতে /integration/test-whatsapp-alert ব্যবহার করুন। VERIFY_TOKEN configured থাকলে /whatsapp/webhook verification active হয়। credentials না থাকলে integration নিরাপদভাবে inactive থাকে।",
    UNIQUENESS:
      "Rapid AI আলাদা কারণ এটি telemetry decode, identity resolution, risk + forecasting intelligence, multilingual voice, real-time broadcast, optional WhatsApp escalation এবং API-key governance এক ICU workflow-এ একসাথে দেয়।",
  },
  ta: {
    OVERVIEW:
      "Rapid AI என்பது real-time ICU telemetry intelligence platform. தொடங்க /dashboard/api-access அல்லது /api-key/my-key மூலம் API key பெறுங்கள், /telemetry/update க்கு data அனுப்புங்கள், /icu/summary மற்றும் /icu/timeline ஐ கண்காணிக்கவும், /voice/query மூலம் இயல்பான கேள்விகள் கேட்கவும். API docs /docs/api இல் உள்ளது.",
    API_KEY:
      "API key பெற /dashboard/api-access பயன்படுத்துங்கள் அல்லது x-user-id உடன் GET /api-key/my-key அழைக்கவும். rotate செய்ய POST /api-key/regenerate பயன்படுத்தவும். /telemetry, /voice, /icu, /integration போன்ற protected routes-க்கு x-api-key அவசியம்.",
    DEVELOPER:
      "Developers /docs/api இலிருந்து தொடங்கலாம். முக்கிய routes: /telemetry/update, /voice/query, /icu/summary, /icu/timeline, /integration/status. analytics routes: /api/v1/forecast/next மற்றும் /api/v1/alerts. protected calls-க்கு x-api-key தேவை.",
    HOSPITAL:
      "Hospital workflow இல் HL7 listener மற்றும் serial bridge மூலம் telemetry ingest செய்யப்படுகிறது. Rapid AI risk score மற்றும் 5-minute forecast கணக்கிடுகிறது, பின்னர் dashboard timeline-ல் transitions காட்டுகிறது. critical deterioration ஏற்பட்டால் dashboard stream, voice broadcast, optional WhatsApp escalation இயங்கும்.",
    WHATSAPP:
      "WhatsApp alerts optional integration. நிலையை பார்க்க /integration/whatsapp-status, flow test செய்ய /integration/test-whatsapp-alert பயன்படுத்தவும். VERIFY_TOKEN configured இருந்தால் /whatsapp/webhook verification active ஆகும். credentials இல்லை என்றால் integration பாதுகாப்பாக inactive ஆகும்.",
    UNIQUENESS:
      "Rapid AI-யின் uniqueness என்பது telemetry decode, identity resolution, risk + forecasting intelligence, multilingual voice, real-time broadcast, optional WhatsApp escalation, API-key governance ஆகியவற்றை ஒரே deployable ICU workflow-இல் இணைப்பதாகும்.",
  },
  te: {
    OVERVIEW:
      "Rapid AI ఒక real-time ICU telemetry intelligence platform. ప్రారంభానికి /dashboard/api-access లేదా /api-key/my-key ద్వారా API key తీసుకోండి, /telemetry/update కి data పంపండి, /icu/summary మరియు /icu/timeline ని మానిటర్ చేయండి, /voice/query తో సహజ భాషలో అడగండి. API docs /docs/api లో ఉన్నాయి.",
    API_KEY:
      "API key కోసం /dashboard/api-access వాడండి లేదా x-user-id తో GET /api-key/my-key call చేయండి. rotate కోసం POST /api-key/regenerate వాడాలి. /telemetry, /voice, /icu, /integration వంటి protected routes కి x-api-key తప్పనిసరి.",
    DEVELOPER:
      "Developers /docs/api నుండి ప్రారంభించవచ్చు. core routes: /telemetry/update, /voice/query, /icu/summary, /icu/timeline, /integration/status. analytics routes: /api/v1/forecast/next మరియు /api/v1/alerts. protected calls కి x-api-key అవసరం.",
    HOSPITAL:
      "Hospital workflow లో HL7 listener మరియు serial bridge ద్వారా telemetry ingest అవుతుంది. Rapid AI risk score మరియు 5-minute forecast ఇస్తుంది, dashboard timeline లో transitions చూపిస్తుంది. critical deterioration అయితే dashboard stream, voice broadcast, optional WhatsApp escalation ప్రారంభమవుతుంది.",
    WHATSAPP:
      "WhatsApp alerts optional integration. status కోసం /integration/whatsapp-status, test కోసం /integration/test-whatsapp-alert వాడండి. VERIFY_TOKEN configured ఉంటే /whatsapp/webhook verification active అవుతుంది. credentials లేకపోతే integration safe inactive mode లో ఉంటుంది.",
    UNIQUENESS:
      "Rapid AI ప్రత్యేకత ఏమిటంటే telemetry decode, identity resolution, risk + forecasting intelligence, multilingual voice, real-time broadcast, optional WhatsApp escalation, API-key governance అన్నీ ఒకే deployable ICU workflow లో కలిపి అందిస్తుంది.",
  },
  mr: {
    OVERVIEW:
      "Rapid AI हा real-time ICU telemetry intelligence platform आहे. सुरुवातीसाठी /dashboard/api-access किंवा /api-key/my-key मधून API key घ्या, /telemetry/update वर डेटा पाठवा, /icu/summary आणि /icu/timeline मॉनिटर करा, आणि /voice/query वापरा. API docs /docs/api वर उपलब्ध आहेत.",
    API_KEY:
      "API key साठी /dashboard/api-access वापरा किंवा x-user-id सह GET /api-key/my-key कॉल करा. key rotate करण्यासाठी POST /api-key/regenerate वापरा. /telemetry, /voice, /icu, /integration सारख्या protected routes साठी x-api-key आवश्यक आहे.",
    DEVELOPER:
      "Developers /docs/api पासून सुरू करू शकतात. मुख्य routes: /telemetry/update, /voice/query, /icu/summary, /icu/timeline, /integration/status. analytics routes: /api/v1/forecast/next आणि /api/v1/alerts. protected calls ला x-api-key लागतो.",
    HOSPITAL:
      "Hospital workflow मध्ये HL7 listener आणि serial bridge मधून telemetry ingest होते. Rapid AI risk score आणि 5-minute forecast काढते आणि dashboard timeline वर transitions दाखवते. critical deterioration झाल्यास dashboard stream, voice broadcast आणि optional WhatsApp escalation ट्रिगर होते.",
    WHATSAPP:
      "WhatsApp alerts हे optional integration आहे. status पाहण्यासाठी /integration/whatsapp-status आणि test साठी /integration/test-whatsapp-alert वापरा. VERIFY_TOKEN configured असल्यास /whatsapp/webhook verification active होते. credentials नसल्यास integration सुरक्षित inactive राहते.",
    UNIQUENESS:
      "Rapid AI चे वैशिष्ट्य म्हणजे telemetry decode, identity resolution, risk + forecasting intelligence, multilingual voice, real-time broadcast, optional WhatsApp escalation आणि API-key governance हे सर्व एका deployable ICU workflow मध्ये एकत्र देते.",
  },
  gu: {
    OVERVIEW:
      "Rapid AI એક real-time ICU telemetry intelligence platform છે. શરૂઆત માટે /dashboard/api-access અથવા /api-key/my-key થી API key મેળવો, /telemetry/update પર data મોકલો, /icu/summary અને /icu/timeline મોનિટર કરો, અને /voice/query નો ઉપયોગ કરો. API docs /docs/api પર છે.",
    API_KEY:
      "API key માટે /dashboard/api-access વાપરો અથવા x-user-id સાથે GET /api-key/my-key call કરો. rotate માટે POST /api-key/regenerate વાપરો. /telemetry, /voice, /icu, /integration જેવા protected routes માટે x-api-key ફરજિયાત છે.",
    DEVELOPER:
      "Developers /docs/api થી શરૂ કરી શકે છે. core routes: /telemetry/update, /voice/query, /icu/summary, /icu/timeline, /integration/status. analytics routes: /api/v1/forecast/next અને /api/v1/alerts. protected calls માટે x-api-key જરૂરી છે.",
    HOSPITAL:
      "Hospital workflow માં HL7 listener અને serial bridge દ્વારા telemetry ingest થાય છે. Rapid AI risk score અને 5-minute forecast આપે છે અને dashboard timeline માં transitions બતાવે છે. critical deterioration સમયે dashboard stream, voice broadcast અને optional WhatsApp escalation થાય છે.",
    WHATSAPP:
      "WhatsApp alerts optional integration છે. status માટે /integration/whatsapp-status અને test માટે /integration/test-whatsapp-alert વાપરો. VERIFY_TOKEN configured હોય તો /whatsapp/webhook verification active થાય છે. credentials ના હોય તો integration safe inactive રહે છે.",
    UNIQUENESS:
      "Rapid AI ની uniqueness એ છે કે telemetry decode, identity resolution, risk + forecasting intelligence, multilingual voice, real-time broadcast, optional WhatsApp escalation અને API-key governance એક જ deployable ICU workflow માં જોડાયેલી છે.",
  },
  kn: {
    OVERVIEW:
      "Rapid AI ಒಂದು real-time ICU telemetry intelligence platform ಆಗಿದೆ. ಆರಂಭಕ್ಕೆ /dashboard/api-access ಅಥವಾ /api-key/my-key ನಿಂದ API key ಪಡೆಯಿರಿ, /telemetry/update ಗೆ data ಕಳುಹಿಸಿ, /icu/summary ಮತ್ತು /icu/timeline ಅನ್ನು ಗಮನಿಸಿ, ಮತ್ತು /voice/query ಬಳಸಿ. API docs /docs/api ನಲ್ಲಿ ಲಭ್ಯವಿದೆ.",
    API_KEY:
      "API keyಗಾಗಿ /dashboard/api-access ಬಳಸಿ ಅಥವಾ x-user-id ಜೊತೆಗೆ GET /api-key/my-key call ಮಾಡಿ. rotate ಮಾಡಲು POST /api-key/regenerate ಬಳಸಿ. /telemetry, /voice, /icu, /integration ಮೊದಲಾದ protected routes ಗೆ x-api-key ಕಡ್ಡಾಯ.",
    DEVELOPER:
      "Developers /docs/api ಇಂದ ಪ್ರಾರಂಭಿಸಬಹುದು. core routes: /telemetry/update, /voice/query, /icu/summary, /icu/timeline, /integration/status. analytics routes: /api/v1/forecast/next ಮತ್ತು /api/v1/alerts. protected calls ಗೆ x-api-key ಅಗತ್ಯ.",
    HOSPITAL:
      "Hospital workflow ನಲ್ಲಿ HL7 listener ಮತ್ತು serial bridge ಮೂಲಕ telemetry ingest ಆಗುತ್ತದೆ. Rapid AI risk score ಮತ್ತು 5-minute forecast ನೀಡುತ್ತದೆ, dashboard timeline ನಲ್ಲಿ transitions ತೋರಿಸುತ್ತದೆ. critical deterioration ಆಗಿದ್ರೆ dashboard stream, voice broadcast ಮತ್ತು optional WhatsApp escalation trigger ಆಗುತ್ತದೆ.",
    WHATSAPP:
      "WhatsApp alerts optional integration ಆಗಿದೆ. status ನೋಡಲು /integration/whatsapp-status ಮತ್ತು test ಮಾಡಲು /integration/test-whatsapp-alert ಬಳಸಿ. VERIFY_TOKEN configured ಇದ್ದರೆ /whatsapp/webhook verification active ಆಗುತ್ತದೆ. credentials ಇಲ್ಲದಿದ್ದರೆ integration safe inactive ಇರುತ್ತದೆ.",
    UNIQUENESS:
      "Rapid AI ಯ ವಿಶೇಷತೆ ಎಂದರೆ telemetry decode, identity resolution, risk + forecasting intelligence, multilingual voice, real-time broadcast, optional WhatsApp escalation ಮತ್ತು API-key governance ಅನ್ನು ಒಂದೇ deployable ICU workflow ನಲ್ಲಿ ಒಟ್ಟಿಗೆ ನೀಡುವುದು.",
  },
  ml: {
    OVERVIEW:
      "Rapid AI ഒരു real-time ICU telemetry intelligence platform ആണ്. തുടങ്ങാൻ /dashboard/api-access അല്ലെങ്കിൽ /api-key/my-key വഴി API key എടുക്കുക, /telemetry/update ലേക്ക് data അയയ്ക്കുക, /icu/summary, /icu/timeline നിരീക്ഷിക്കുക, കൂടാതെ /voice/query ഉപയോഗിക്കുക. API docs /docs/api ൽ ലഭ്യമാണ്.",
    API_KEY:
      "API key ന് /dashboard/api-access ഉപയോഗിക്കൂ, അല്ലെങ്കിൽ x-user-id ഒപ്പം GET /api-key/my-key call ചെയ്യൂ. rotate ചെയ്യാൻ POST /api-key/regenerate ഉപയോഗിക്കാം. /telemetry, /voice, /icu, /integration പോലുള്ള protected routes ന് x-api-key നിർബന്ധമാണ്.",
    DEVELOPER:
      "Developers /docs/api മുതൽ തുടങ്ങാം. core routes: /telemetry/update, /voice/query, /icu/summary, /icu/timeline, /integration/status. analytics routes: /api/v1/forecast/next, /api/v1/alerts. protected calls ന് x-api-key ആവശ്യമാണ്.",
    HOSPITAL:
      "Hospital workflow ൽ HL7 listener, serial bridge വഴി telemetry ingest ചെയ്യുന്നു. Rapid AI risk score, 5-minute forecast നൽകുന്നു, dashboard timeline ൽ transitions കാണിക്കുന്നു. critical deterioration ഉണ്ടാകുമ്പോൾ dashboard stream, voice broadcast, optional WhatsApp escalation trigger ആവും.",
    WHATSAPP:
      "WhatsApp alerts optional integration ആണ്. status നോക്കാൻ /integration/whatsapp-status, test ചെയ്യാൻ /integration/test-whatsapp-alert ഉപയോഗിക്കുക. VERIFY_TOKEN configured ആണെങ്കിൽ /whatsapp/webhook verification active ആയിരിക്കും. credentials ഇല്ലെങ്കിൽ integration safe inactive ആയിരിക്കും.",
    UNIQUENESS:
      "Rapid AI യുടെ uniqueness telemetry decode, identity resolution, risk + forecasting intelligence, multilingual voice, real-time broadcast, optional WhatsApp escalation, API-key governance എന്നിവയെ ഒരൊറ്റ deployable ICU workflow ൽ ഒരുമിപ്പിക്കുന്നതിലാണ്.",
  },
  pa: {
    OVERVIEW:
      "Rapid AI ਇੱਕ real-time ICU telemetry intelligence platform ਹੈ। ਸ਼ੁਰੂ ਕਰਨ ਲਈ /dashboard/api-access ਜਾਂ /api-key/my-key ਤੋਂ API key ਲਵੋ, /telemetry/update ਤੇ data ਭੇਜੋ, /icu/summary ਅਤੇ /icu/timeline ਮਾਨੀਟਰ ਕਰੋ, ਅਤੇ /voice/query ਵਰਤੋ। API docs /docs/api ਤੇ ਹਨ।",
    API_KEY:
      "API key ਲਈ /dashboard/api-access ਵਰਤੋ ਜਾਂ x-user-id ਨਾਲ GET /api-key/my-key call ਕਰੋ। rotate ਲਈ POST /api-key/regenerate ਵਰਤੋ। /telemetry, /voice, /icu, /integration ਵਰਗੇ protected routes ਲਈ x-api-key ਲਾਜ਼ਮੀ ਹੈ।",
    DEVELOPER:
      "Developers /docs/api ਤੋਂ ਸ਼ੁਰੂ ਕਰ ਸਕਦੇ ਹਨ। core routes: /telemetry/update, /voice/query, /icu/summary, /icu/timeline, /integration/status. analytics routes: /api/v1/forecast/next ਅਤੇ /api/v1/alerts. protected calls ਲਈ x-api-key ਚਾਹੀਦਾ ਹੈ।",
    HOSPITAL:
      "Hospital workflow ਵਿੱਚ HL7 listener ਅਤੇ serial bridge ਰਾਹੀਂ telemetry ingest ਹੁੰਦੀ ਹੈ। Rapid AI risk score ਅਤੇ 5-minute forecast ਦਿੰਦਾ ਹੈ ਅਤੇ dashboard timeline ਵਿੱਚ transitions ਦਿਖਾਂਦਾ ਹੈ। critical deterioration ਤੇ dashboard stream, voice broadcast, optional WhatsApp escalation trigger ਹੁੰਦੀ ਹੈ।",
    WHATSAPP:
      "WhatsApp alerts optional integration ਹਨ। status ਲਈ /integration/whatsapp-status ਅਤੇ test ਲਈ /integration/test-whatsapp-alert ਵਰਤੋ। VERIFY_TOKEN configured ਹੋਵੇ ਤਾਂ /whatsapp/webhook verification active ਹੁੰਦੀ ਹੈ। credentials ਨਾ ਹੋਣ ਤੇ integration safe inactive ਰਹਿੰਦੀ ਹੈ।",
    UNIQUENESS:
      "Rapid AI ਦੀ uniqueness ਇਹ ਹੈ ਕਿ telemetry decode, identity resolution, risk + forecasting intelligence, multilingual voice, real-time broadcast, optional WhatsApp escalation ਅਤੇ API-key governance ਇੱਕ ਹੀ deployable ICU workflow ਵਿੱਚ ਇਕੱਠੇ ਮਿਲਦੇ ਹਨ।",
  },
  ur: {
    OVERVIEW:
      "Rapid AI ایک real-time ICU telemetry intelligence platform ہے۔ شروع کرنے کے لیے /dashboard/api-access یا /api-key/my-key سے API key لیں، /telemetry/update پر data بھیجیں، /icu/summary اور /icu/timeline مانیٹر کریں، اور /voice/query استعمال کریں۔ API docs /docs/api پر موجود ہیں۔",
    API_KEY:
      "API key کے لیے /dashboard/api-access استعمال کریں یا x-user-id کے ساتھ GET /api-key/my-key call کریں۔ rotate کے لیے POST /api-key/regenerate استعمال کریں۔ /telemetry, /voice, /icu, /integration جیسے protected routes پر x-api-key لازمی ہے۔",
    DEVELOPER:
      "Developers /docs/api سے شروع کر سکتے ہیں۔ core routes: /telemetry/update, /voice/query, /icu/summary, /icu/timeline, /integration/status. analytics routes: /api/v1/forecast/next اور /api/v1/alerts. protected calls کے لیے x-api-key ضروری ہے۔",
    HOSPITAL:
      "Hospital workflow میں HL7 listener اور serial bridge کے ذریعے telemetry ingest ہوتی ہے۔ Rapid AI risk score اور 5-minute forecast دیتا ہے اور dashboard timeline میں transitions دکھاتا ہے۔ critical deterioration پر dashboard stream, voice broadcast اور optional WhatsApp escalation trigger ہوتی ہے۔",
    WHATSAPP:
      "WhatsApp alerts optional integration ہیں۔ status کے لیے /integration/whatsapp-status اور test کے لیے /integration/test-whatsapp-alert استعمال کریں۔ VERIFY_TOKEN configured ہو تو /whatsapp/webhook verification active ہوتی ہے۔ credentials نہ ہوں تو integration safe inactive رہتی ہے۔",
    UNIQUENESS:
      "Rapid AI کی uniqueness یہ ہے کہ telemetry decode, identity resolution, risk + forecasting intelligence, multilingual voice, real-time broadcast, optional WhatsApp escalation اور API-key governance ایک ہی deployable ICU workflow میں ایک ساتھ ملتے ہیں۔",
  },
  or: {
    OVERVIEW:
      "Rapid AI ଏକ real-time ICU telemetry intelligence platform ଅଟେ। ଆରମ୍ଭ ପାଇଁ /dashboard/api-access କିମ୍ବା /api-key/my-key ରୁ API key ନିଅନ୍ତୁ, /telemetry/update କୁ data ପଠାନ୍ତୁ, /icu/summary ଏବଂ /icu/timeline ମନିଟର କରନ୍ତୁ, ଏବଂ /voice/query ବ୍ୟବହାର କରନ୍ତୁ। API docs /docs/api ରେ ଅଛି।",
    API_KEY:
      "API key ପାଇଁ /dashboard/api-access ବ୍ୟବହାର କରନ୍ତୁ କିମ୍ବା x-user-id ସହିତ GET /api-key/my-key call କରନ୍ତୁ। rotate ପାଇଁ POST /api-key/regenerate ବ୍ୟବହାର କରନ୍ତୁ। /telemetry, /voice, /icu, /integration ପରି protected routes ପାଇଁ x-api-key ଆବଶ୍ୟକ।",
    DEVELOPER:
      "Developers /docs/api ରୁ ଆରମ୍ଭ କରିପାରିବେ। core routes: /telemetry/update, /voice/query, /icu/summary, /icu/timeline, /integration/status. analytics routes: /api/v1/forecast/next ଏବଂ /api/v1/alerts. protected calls ପାଇଁ x-api-key ଦରକାର।",
    HOSPITAL:
      "Hospital workflow ରେ HL7 listener ଏବଂ serial bridge ଦ୍ୱାରା telemetry ingest ହୁଏ। Rapid AI risk score ଏବଂ 5-minute forecast ଦେଏ, dashboard timeline ରେ transitions ଦେଖାଏ। critical deterioration ହେଲେ dashboard stream, voice broadcast ଏବଂ optional WhatsApp escalation trigger ହୁଏ।",
    WHATSAPP:
      "WhatsApp alerts optional integration ଅଟେ। status ପାଇଁ /integration/whatsapp-status ଏବଂ test ପାଇଁ /integration/test-whatsapp-alert ବ୍ୟବହାର କରନ୍ତୁ। VERIFY_TOKEN configured ଥିଲେ /whatsapp/webhook verification active ହୁଏ। credentials ନଥିଲେ integration safe inactive ରହେ।",
    UNIQUENESS:
      "Rapid AI ର uniqueness ହେଲା telemetry decode, identity resolution, risk + forecasting intelligence, multilingual voice, real-time broadcast, optional WhatsApp escalation ଏବଂ API-key governance କୁ ଗୋଟିଏ deployable ICU workflow ରେ ଏକତ୍ର କରିବା।",
  },
});

function isPlatformGuideQuery(text) {
  return PLATFORM_GUIDE_QUERY_PATTERN.test(String(text || ""));
}

function resolvePlatformGuideTopic(transcript) {
  const text = String(transcript || "").toLowerCase();

  if (/patient\s*data|trained\s*patient|demo\s*patient|\bpid\b|patient\s*ids?/.test(text)) {
    return "PATIENT_DEMO";
  }

  if (
    /short|brief|one\s*line|chhota|chota|small/.test(text) &&
    /intro|overview|rapid\s*ai|kya\s*hai|what\s*is/.test(text)
  ) {
    return "SHORT_INTRO";
  }

  if (
    /long|detailed|detail|full|deep|lamba|expand/.test(text) &&
    /intro|overview|rapid\s*ai|kya\s*hai|what\s*is/.test(text)
  ) {
    return "LONG_INTRO";
  }

  if (/feature|features|how\s*it\s*works|how\s*works|kaise\s*work|workflow|end\s*to\s*end/.test(text)) {
    return "FEATURES_WORKFLOW";
  }

  if (/real[\s-]*time|live/.test(text) && /work|kaam|chalta|running|system/.test(text)) {
    return "REALTIME";
  }

  if (/everything|a2z|all\s+features|all\s+about|complete|full\s+overview|overview|saare|readme|presentation/.test(text)) {
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

function normalizeLanguageCode(language, normalizeLanguageFn) {
  if (typeof normalizeLanguageFn === "function") {
    const normalized = normalizeLanguageFn(language);
    if (PLATFORM_GUIDE_REPLIES[normalized]) {
      return normalized;
    }

    const alias = LANGUAGE_FALLBACK_ALIAS[normalized];
    if (alias && PLATFORM_GUIDE_REPLIES[alias]) {
      return alias;
    }
  }

  const fallback = String(language || "en").trim().toLowerCase();

  if (PLATFORM_GUIDE_REPLIES[fallback]) {
    return fallback;
  }

  const alias = LANGUAGE_FALLBACK_ALIAS[fallback];
  if (alias && PLATFORM_GUIDE_REPLIES[alias]) {
    return alias;
  }

  return "en";
}

function getDynamicCopy(languageCode) {
  return DYNAMIC_GUIDE_COPY[languageCode] || DYNAMIC_GUIDE_COPY.en;
}

function firstSentence(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return "";
  }

  const match = normalized.match(/^(.+?[.!?])(\s|$)/);
  return match ? match[1].trim() : normalized;
}

function buildDemoPatientContext() {
  const profiles = listTrainedPatientProfiles().map((profile) => ({
    patientId: profile.patientId,
    patientName: profile.patientName,
    diagnosis: profile.diagnosis,
    riskLevel: profile.riskLevel,
  }));

  return {
    patientCount: profiles.length,
    patientIds: profiles.map((profile) => profile.patientId),
    patients: profiles,
  };
}

function buildPatientSnapshot(summary, patients, maxPatients = 8) {
  if (!summary || !Array.isArray(patients)) {
    return null;
  }

  const clipped = patients.slice(0, maxPatients).map((patient) => ({
    patientId: patient?.patientId ? String(patient.patientId) : null,
    riskLevel: patient?.riskLevel ? String(patient.riskLevel) : null,
    heartRate: Number(patient?.heartRate),
    spo2: Number(patient?.spo2),
    temperature: Number(patient?.temperature),
    bloodPressure: patient?.bloodPressure ? String(patient.bloodPressure) : null,
    diagnosis: patient?.diagnosis ? String(patient.diagnosis) : null,
    respiratoryRate: Number(patient?.respiratoryRate),
    lastUpdated: patient?.lastUpdated ? String(patient.lastUpdated) : null,
  }));

  return {
    summary,
    totalPatientsIncluded: clipped.length,
    patients: clipped,
  };
}

function buildPlatformGuideContext({ transcript, summary, patients } = {}) {
  const topic = resolvePlatformGuideTopic(transcript);
  const knowledge = getVoiceKnowledgeContext(transcript, { maxSnippets: 6 });

  return {
    ...README_ALIGNED_CONTEXT,
    topic,
    knowledgeBase: {
      builtAt: knowledge.builtAt,
      sourceCount: knowledge.sourceCount,
      trainingSources: knowledge.trainingSources,
      snippets: knowledge.snippets,
      featureCatalog: knowledge.featureCatalog,
    },
    patientSnapshot: buildPatientSnapshot(summary, patients),
    demoPatients: buildDemoPatientContext(),
  };
}

function buildPlatformGuideReply({ transcript, language, normalizeLanguageFn, context } = {}) {
  const effectiveContext = context || buildPlatformGuideContext({ transcript });
  const topic = effectiveContext.topic || resolvePlatformGuideTopic(transcript);
  const languageCode = normalizeLanguageCode(language, normalizeLanguageFn);
  const languagePack = PLATFORM_GUIDE_REPLIES[languageCode] || PLATFORM_GUIDE_REPLIES.en;
  const dynamicCopy = getDynamicCopy(languageCode);

  if (topic === "SHORT_INTRO") {
    const shortIntro = dynamicCopy.shortIntro || firstSentence(languagePack.OVERVIEW);
    return `${shortIntro} ${dynamicCopy.realtimeSentence}`.trim();
  }

  if (topic === "LONG_INTRO") {
    return `${languagePack.OVERVIEW} ${dynamicCopy.realtimeSentence} ${languagePack.HOSPITAL} ${languagePack.UNIQUENESS}`.trim();
  }

  if (topic === "FEATURES_WORKFLOW") {
    const coreFeatures = Array.isArray(README_ALIGNED_CONTEXT.coreFeatures)
      ? README_ALIGNED_CONTEXT.coreFeatures.slice(0, 5).join(", ")
      : "";
    return `${dynamicCopy.featuresWorkflowPrefix} Key features include ${coreFeatures}. ${dynamicCopy.realtimeSentence}`.trim();
  }

  if (topic === "REALTIME") {
    return `${dynamicCopy.realtimeSentence} ${languagePack.HOSPITAL}`.trim();
  }

  if (topic === "PATIENT_DEMO") {
    const patientIds = Array.isArray(effectiveContext?.demoPatients?.patientIds)
      ? effectiveContext.demoPatients.patientIds
      : [];
    const idsText = patientIds.length > 0 ? patientIds.join(", ") : "901, 902, 903";
    return `${dynamicCopy.patientDemoPrefix} ${idsText}. ${dynamicCopy.patientDemoHowToAsk}`.trim();
  }

  return languagePack[topic] || languagePack.OVERVIEW || PLATFORM_GUIDE_REPLIES.en.OVERVIEW;
}

module.exports = {
  isPlatformGuideQuery,
  resolvePlatformGuideTopic,
  buildPlatformGuideContext,
  buildPlatformGuideReply,
};
