"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import SiteFooter from "@/components/SiteFooter";
import SiteNavbar from "@/components/SiteNavbar";
import {
  ApiKeyDetailsResponse,
  clearRuntimeApiKey,
  fetchMyApiKey,
  regenerateMyApiKey,
  setRuntimeApiKey,
} from "@/lib/api";

const DEFAULT_USER_ID = "doctor-101";
const USER_ID_STORAGE_KEY = "rapidai-api-access-user-id";

const PLAN_COMPARISON_ROWS: Array<{
  feature: string;
  freeTier: string;
  paidTier: string;
}> = [
  {
    feature: "Daily API quota",
    freeTier: "1,000 requests/day",
    paidTier: "25,000 requests/day",
  },
  {
    feature: "Key validity",
    freeTier: "30 days",
    paidTier: "30 days (monthly) / 365 days (yearly)",
  },
  {
    feature: "Pricing",
    freeTier: "$0",
    paidTier: "$5/month or $60/year",
  },
  {
    feature: "Checkout mode",
    freeTier: "No payment needed",
    paidTier: "Razorpay test (demo)",
  },
];

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function normalizePlanLabel(value: string): string {
  const normalized = String(value || "free").trim().toLowerCase();
  if (!normalized) {
    return "FREE";
  }

  return normalized.toUpperCase();
}

function normalizeUsageValue(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed);
}

export default function ApiAccessPage() {
  const [userIdInput, setUserIdInput] = useState(DEFAULT_USER_ID);
  const [activeUserId, setActiveUserId] = useState(DEFAULT_USER_ID);
  const [apiKeyDetails, setApiKeyDetails] = useState<ApiKeyDetailsResponse | null>(null);
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const fetchApiKeyDetails = useCallback(async (userId: string, options?: { silent?: boolean }) => {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      setError("User ID is required.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError(null);
    if (options?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const next = await fetchMyApiKey(normalizedUserId);
      setApiKeyDetails(next);
    } catch (err) {
      setApiKeyDetails(null);
      setError(err instanceof Error ? err.message : "Could not fetch API key details.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const storedUserId = typeof window === "undefined" ? "" : window.localStorage.getItem(USER_ID_STORAGE_KEY);
    const normalizedStored = String(storedUserId || "").trim();

    if (normalizedStored) {
      setUserIdInput(normalizedStored);
      setActiveUserId(normalizedStored);
      return;
    }

    setActiveUserId(DEFAULT_USER_ID);
  }, []);

  useEffect(() => {
    void fetchApiKeyDetails(activeUserId);
  }, [activeUserId, fetchApiKeyDetails]);

  useEffect(() => {
    if (!copyStatus) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyStatus(null);
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copyStatus]);

  const visibleApiKey = useMemo(() => {
    if (revealedApiKey) {
      return revealedApiKey;
    }

    if (apiKeyDetails?.api_key_masked) {
      return apiKeyDetails.api_key_masked;
    }

    return "No key available";
  }, [apiKeyDetails?.api_key_masked, revealedApiKey]);

  const usageLimit = normalizeUsageValue(apiKeyDetails?.usage_limit ?? 0);
  const usageCount = normalizeUsageValue(apiKeyDetails?.usage_count ?? 0);
  const usagePercent = usageLimit > 0 ? Math.min(100, Math.round((usageCount / usageLimit) * 100)) : 0;

  function handleUserIdSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedUserId = String(userIdInput || "").trim();
    if (!normalizedUserId) {
      setError("User ID is required.");
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(USER_ID_STORAGE_KEY, normalizedUserId);
    }

    clearRuntimeApiKey();

    setRevealedApiKey(null);
    setActiveUserId(normalizedUserId);
  }

  async function handleCopyApiKey() {
    const value = String(visibleApiKey || "").trim();
    if (!value || value === "No key available") {
      setCopyStatus("No API key to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus("API key copied.");
    } catch {
      setCopyStatus("Clipboard permission denied.");
    }
  }

  async function handleRegenerateApiKey() {
    const normalizedUserId = String(activeUserId || "").trim();
    if (!normalizedUserId) {
      setError("User ID is required.");
      return;
    }

    setError(null);
    setRegenerating(true);

    try {
      const result = await regenerateMyApiKey(normalizedUserId);
      setApiKeyDetails({
        user_id: result.user_id,
        plan_type: result.plan_type,
        usage_limit: normalizeUsageValue(result.usage_limit),
        usage_count: normalizeUsageValue(result.usage_count),
        created_at: result.created_at,
        expires_at: result.expires_at,
        is_active: result.is_active,
        api_key_masked: result.api_key_masked,
        auto_created: false,
      });
      setRevealedApiKey(result.api_key);
      setRuntimeApiKey(result.api_key);
      setCopyStatus("New API key ready. Copy it now.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate API key.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="page-shell pb-10">
      <SiteNavbar />

      <main className="container-wrap mt-8 space-y-5">
        <section className="surface p-6 md:p-8">
          <p className="kicker">API Access Control</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold">API Key Dashboard</h1>
              <p className="mt-2 muted">
                Manage your current key, review plan limits, and rotate credentials safely.
              </p>
            </div>

            <Link href="/dashboard" className="btn-base btn-ghost px-4 py-2 text-sm">
              Back To Dashboard
            </Link>
          </div>

          <form className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]" onSubmit={handleUserIdSubmit}>
            <input
              className="input-dark rounded-xl px-3 py-2 text-sm"
              placeholder="User ID"
              value={userIdInput}
              onChange={(event) => setUserIdInput(event.target.value)}
            />
            <button type="submit" className="btn-base btn-green px-4 py-2 text-sm">
              Load API Key
            </button>
            <button
              type="button"
              className="btn-base btn-ghost px-4 py-2 text-sm"
              disabled={refreshing || loading}
              onClick={() => {
                void fetchApiKeyDetails(activeUserId, { silent: true });
              }}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </form>
        </section>

        <section className="surface p-6 md:p-8">
          <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Active API Key</p>
            <p className="mt-2 break-all font-mono text-lg text-cyan-100">{loading ? "Loading API key..." : visibleApiKey}</p>
            <p className="mt-3 text-xs text-cyan-300/90">
              {revealedApiKey
                ? "This regenerated key is shown only once. Store it securely before leaving this page."
                : "Masked key is shown for safety. Regenerate to reveal a new key once."}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-base btn-main px-4 py-2 text-sm"
              disabled={loading}
              onClick={() => {
                void handleCopyApiKey();
              }}
            >
              Copy API key
            </button>
            <button
              type="button"
              className="btn-base btn-green px-4 py-2 text-sm"
              disabled={regenerating || loading}
              onClick={() => {
                void handleRegenerateApiKey();
              }}
            >
              {regenerating ? "Regenerating..." : "Regenerate API key"}
            </button>
          </div>

          {copyStatus ? (
            <p className="mt-3 rounded-lg border border-emerald-500/35 bg-emerald-500/12 px-3 py-2 text-sm text-emerald-200">
              {copyStatus}
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-500/12 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="stat-card p-4">
            <p className="kicker">Plan Type</p>
            <p className="mt-2 text-3xl font-semibold text-slate-100">
              {apiKeyDetails ? normalizePlanLabel(apiKeyDetails.plan_type) : "--"}
            </p>
          </article>

          <article className="stat-card p-4">
            <p className="kicker">Expiration Date</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              {apiKeyDetails ? formatDateTime(apiKeyDetails.expires_at) : "--"}
            </p>
          </article>

          <article className="stat-card p-4">
            <p className="kicker">Usage Count</p>
            <p className="mt-2 text-3xl font-semibold text-slate-100">{usageCount}</p>
            <p className="mt-1 text-sm text-slate-400">of {usageLimit} requests</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </article>
        </section>

        <section className="surface p-6 md:p-8">
          <p className="kicker">Free Vs Paid</p>
          <h2 className="mt-2 text-2xl font-semibold">API Access Plans</h2>
          <p className="mt-2 muted max-w-3xl">
            Free tier remains available for quick testing. Paid premium plans add higher quota with either monthly or
            yearly billing in demo Razorpay mode.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <article className="quick-card p-4">
              <p className="kicker">Free Tier</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">Best for evaluation and local development</p>
              <p className="mt-1 text-sm text-slate-300">Auto-created through My Key endpoint and dashboard login.</p>
            </article>

            <article className="quick-card p-4 border-emerald-500/40 bg-emerald-500/12">
              <p className="kicker text-emerald-300">Premium Tier</p>
              <p className="mt-2 text-lg font-semibold text-emerald-100">Best for production API usage</p>
              <p className="mt-1 text-sm text-emerald-200/90">
                Monthly: $5. Yearly: $60. Test checkout integrated with Razorpay test mode.
              </p>
            </article>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700/70">
            <table className="min-w-full divide-y divide-slate-700/70 text-left text-sm">
              <thead className="bg-slate-900/70 text-xs uppercase tracking-[0.15em] text-slate-300">
                <tr>
                  <th className="px-4 py-3">Feature</th>
                  <th className="px-4 py-3">Free</th>
                  <th className="px-4 py-3">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950/50 text-slate-200">
                {PLAN_COMPARISON_ROWS.map((row) => (
                  <tr key={row.feature}>
                    <td className="px-4 py-3">{row.feature}</td>
                    <td className="px-4 py-3">{row.freeTier}</td>
                    <td className="px-4 py-3">{row.paidTier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/dashboard/premium" className="btn-base btn-green px-4 py-2 text-sm">
              Upgrade To Premium
            </Link>
            <Link href="/docs/api" className="btn-base btn-ghost px-4 py-2 text-sm">
              API Docs
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}