import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import SiteNavbar from "@/components/SiteNavbar";

type EndpointDoc = {
  title: string;
  method: "GET" | "POST";
  path: string;
  summary: string;
  requestExample: string;
  responseExample: string;
};

const endpointDocs: EndpointDoc[] = [
  {
    title: "Telemetry ingestion",
    method: "POST",
    path: "/telemetry/update",
    summary:
      "Ingests a live telemetry snapshot, computes risk, updates patient state, and returns alert + forecast context.",
    requestExample: `curl -X POST "http://localhost:4000/telemetry/update" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "patientId": "205",
    "heartRate": 120,
    "spo2": 85,
    "temperature": 38.1,
    "bloodPressure": "120/80"
  }'`,
    responseExample: `{
  "message": "Telemetry processed",
  "patient": {
    "patientId": "205",
    "heartRate": 118,
    "spo2": 88,
    "temperature": 38.1,
    "bloodPressure": "128/86",
    "riskScore": 72,
    "riskLevel": "CRITICAL",
    "predictedRiskNext5Minutes": "CRITICAL",
    "lastUpdated": "2026-04-11T11:24:08.000Z"
  },
  "alert": {
    "triggered": true,
    "severity": "critical",
    "message": "Critical deterioration detected for patient 205"
  },
  "forecast": {
    "predictedRiskLevel": "CRITICAL",
    "confidence": 0.82,
    "source": "model"
  }
}`,
  },
  {
    title: "Voice queries",
    method: "POST",
    path: "/voice/query",
    summary:
      "Accepts clinician text (or voice workflow payload), resolves intent, and returns a patient-aware response.",
    requestExample: `curl -X POST "http://localhost:4000/voice/query" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "text": "Give me current status of patient 205",
    "language": "en",
    "userId": "doctor-101"
  }'`,
    responseExample: `{
  "intent": "patient_status",
  "language": "en",
  "responseText": "Patient 205 is currently critical with low oxygen saturation and elevated heart rate.",
  "patientId": "205",
  "riskLevel": "CRITICAL",
  "riskScore": 72,
  "audioBase64": null,
  "meta": {
    "source": "llm",
    "responseAt": "2026-04-11T11:26:33.000Z"
  }
}`,
  },
  {
    title: "Forecast prediction",
    method: "POST",
    path: "/api/v1/forecast/next",
    summary:
      "Returns short-horizon deterioration prediction from the analytics service for a patient telemetry snapshot.",
    requestExample: `curl -X POST "http://localhost:8080/api/v1/forecast/next" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "patient_id": "205",
    "heart_rate": 118,
    "spo2": 88,
    "temperature": 38.1,
    "blood_pressure": "128/86"
  }'`,
    responseExample: `{
  "patient_id": "205",
  "predicted_risk_level": "CRITICAL",
  "predicted_risk_score": 78,
  "confidence": 0.84,
  "horizon_minutes": 5,
  "source": "xgboost"
}`,
  },
  {
    title: "ICU summary",
    method: "GET",
    path: "/icu/summary",
    summary:
      "Provides current ICU-wide patient distribution and latest patient snapshots.",
    requestExample: `curl -X GET "http://localhost:4000/icu/summary" \\
  -H "x-api-key: YOUR_API_KEY"`,
    responseExample: `{
  "totals": {
    "critical": 2,
    "moderate": 1,
    "warning": 2,
    "stable": 4,
    "totalPatients": 9
  },
  "patients": [
    {
      "patientId": "205",
      "riskLevel": "CRITICAL",
      "riskScore": 72,
      "predictedRiskNext5Minutes": "CRITICAL",
      "lastUpdated": "2026-04-11T11:24:08.000Z"
    }
  ]
}`,
  },
  {
    title: "Alerts stream",
    method: "GET",
    path: "/api/v1/alerts",
    summary:
      "Returns recent alert events from the analytics layer with timestamps, severity, and cooldown metadata.",
    requestExample: `curl -X GET "http://localhost:8080/api/v1/alerts?limit=20" \\
  -H "x-api-key: YOUR_API_KEY"`,
    responseExample: `{
  "alerts": [
    {
      "id": "a4a2378f-5f31-4db4-a0c6-9f2c4314db8d",
      "patient_id": "205",
      "alert_type": "critical_deterioration",
      "severity": "critical",
      "message": "SpO2 below threshold with high heart rate",
      "created_at": "2026-04-11T11:24:10.000Z",
      "duplicate_suppressed": false,
      "cooldown_remaining_seconds": 0
    }
  ],
  "count": 1
}`,
  },
];

const FREE_TIER_USAGE_LIMIT = "1000 requests";
const FREE_TIER_EXPIRY_DURATION = "30 days";
const PREMIUM_MONTHLY_PRICE = "$5/month";
const PREMIUM_YEARLY_PRICE = "$60/year";
const PREMIUM_USAGE_LIMIT = "25,000 requests/day";
const SUPPORTED_ENDPOINT_PATHS = endpointDocs.map((doc) => doc.path);
const QUICKSTART_TELEMETRY_CURL = `curl -X POST http://localhost:4000/telemetry/update \\
-H "x-api-key: YOUR_API_KEY" \\
-H "Content-Type: application/json" \\
-d '{
"patientId": "205",
"heartRate": 120,
"spo2": 85,
"temperature": 38.1,
"bloodPressure": "120/80"
}'`;

function HttpBadge({ method }: { method: EndpointDoc["method"] }) {
  const palette = method === "POST"
    ? "border-cyan-500/45 bg-cyan-500/15 text-cyan-200"
    : "border-emerald-500/45 bg-emerald-500/15 text-emerald-200";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.16em] ${palette}`}>
      {method}
    </span>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <article className="quick-card p-4">
      <p className="kicker">{title}</p>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-700/70 bg-slate-950/80 p-3 text-xs leading-6 text-slate-200">
        <code>{code}</code>
      </pre>
    </article>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="page-shell page-static-backdrop pb-10">
      <SiteNavbar />

      <main className="container-wrap mt-8 space-y-6">
        <section className="surface p-6 md:p-8">
          <p className="kicker">Developer Documentation</p>
          <h1 className="mt-2 text-4xl font-semibold">API Reference</h1>
          <p className="mt-3 max-w-4xl muted">
            This page documents the core Rapid AI endpoints used by client apps, simulator workflows, and integrations.
          </p>
        </section>

        <section className="surface border border-emerald-500/35 bg-emerald-500/10 p-6 md:p-8">
          <p className="kicker text-emerald-300">Developer Access</p>
          <h2 className="mt-2 text-2xl font-semibold text-emerald-100">
            Free and premium API key plans are available.
          </h2>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <article className="quick-card p-4">
              <p className="kicker">Usage Limit</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">{FREE_TIER_USAGE_LIMIT}</p>
            </article>

            <article className="quick-card p-4">
              <p className="kicker">Expiry Duration</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">{FREE_TIER_EXPIRY_DURATION}</p>
            </article>

            <article className="quick-card p-4">
              <p className="kicker">Supported Endpoints</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">{SUPPORTED_ENDPOINT_PATHS.length}</p>
            </article>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <article className="quick-card p-4">
              <p className="kicker">Premium Monthly</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">{PREMIUM_MONTHLY_PRICE}</p>
              <p className="mt-1 text-sm text-slate-300">{PREMIUM_USAGE_LIMIT}</p>
            </article>

            <article className="quick-card p-4">
              <p className="kicker">Premium Yearly</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">{PREMIUM_YEARLY_PRICE}</p>
              <p className="mt-1 text-sm text-slate-300">{PREMIUM_USAGE_LIMIT}</p>
            </article>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {SUPPORTED_ENDPOINT_PATHS.map((path) => (
              <span
                key={path}
                className="rounded-full border border-emerald-500/35 bg-slate-950/60 px-3 py-1 font-mono text-xs text-emerald-100"
              >
                {path}
              </span>
            ))}
          </div>

          <div className="mt-5">
            <Link href="/dashboard/api-access" className="btn-base btn-green px-5 py-2 text-sm">
              Generate Free Key
            </Link>
            <Link href="/dashboard/premium" className="btn-base btn-ghost ml-2 px-5 py-2 text-sm">
              Open Premium Plans
            </Link>
          </div>
        </section>

        <section className="surface p-6 md:p-8">
          <p className="kicker">Authentication</p>
          <h2 className="mt-2 text-2xl font-semibold">Using the x-api-key header</h2>
          <p className="mt-3 muted leading-7">
            Protected endpoints require an API key in the <span className="font-mono text-slate-200">x-api-key</span> header.
            Requests without a valid key return <span className="font-mono text-slate-200">401 Unauthorized</span>.
          </p>
          <CodeBlock
            title="Header Example"
            code={`x-api-key: YOUR_API_KEY`}
          />
          <CodeBlock
            title="Quickstart cURL Example"
            code={QUICKSTART_TELEMETRY_CURL}
          />
        </section>

        {endpointDocs.map((doc) => (
          <section key={doc.path} className="surface p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <HttpBadge method={doc.method} />
              <p className="font-mono text-sm text-slate-300">{doc.path}</p>
            </div>

            <h2 className="mt-3 text-2xl font-semibold">{doc.title}</h2>
            <p className="mt-3 muted leading-7">{doc.summary}</p>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <CodeBlock title="Example Request" code={doc.requestExample} />
              <CodeBlock title="Example Response" code={doc.responseExample} />
            </div>
          </section>
        ))}
      </main>

      <SiteFooter />
    </div>
  );
}
