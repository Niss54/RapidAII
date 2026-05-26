"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import SiteFooter from "@/components/SiteFooter";
import SiteNavbar from "@/components/SiteNavbar";
import {
  BillingConfirmResponse,
  BillingPlan,
  BillingPlanCode,
  clearRuntimeApiKey,
  confirmDemoBillingPayment,
  createDemoBillingCheckout,
  fetchBillingPlans,
  fetchMyApiKey,
  setRuntimeApiKey,
} from "@/lib/api";

const DEFAULT_USER_ID = "doctor-101";
const USER_ID_STORAGE_KEY = "rapidai-api-access-user-id";

const FALLBACK_PLANS: BillingPlan[] = [
  {
    code: "premium_monthly",
    name: "Premium Monthly",
    billing_cycle: "monthly",
    amount_usd: 5,
    amount_display: "$5",
    usage_limit: 25000,
    highlights: [
      "25,000 API requests per day",
      "Telemetry + ICU + Voice + Forecast endpoint access",
      "Fast production onboarding with premium key",
    ],
  },
  {
    code: "premium_yearly",
    name: "Premium Yearly",
    billing_cycle: "yearly",
    amount_usd: 60,
    amount_display: "$60",
    usage_limit: 25000,
    highlights: [
      "25,000 API requests per day",
      "12-month validity with fewer renewals",
      "Best fit for continuous ICU operations",
    ],
  },
];

type CheckoutState = {
  planCode: BillingPlanCode;
  orderId: string;
  amountDisplay: string;
  razorpayKeyId: string;
};

const FEATURE_MATRIX: Array<{
  feature: string;
  freeTier: string;
  premiumTier: string;
}> = [
  {
    feature: "Telemetry ingest endpoint (/telemetry/update)",
    freeTier: "Included",
    premiumTier: "Included",
  },
  {
    feature: "ICU summary and timeline endpoints (/icu/summary, /icu/timeline)",
    freeTier: "Included",
    premiumTier: "Included",
  },
  {
    feature: "Voice query endpoint (/voice/query)",
    freeTier: "Included",
    premiumTier: "Included",
  },
  {
    feature: "Forecast endpoint (/api/v1/forecast/next)",
    freeTier: "Included",
    premiumTier: "Included",
  },
  {
    feature: "Daily API request quota",
    freeTier: "1,000/day",
    premiumTier: "25,000/day",
  },
  {
    feature: "Key validity window",
    freeTier: "30 days",
    premiumTier: "30 days (monthly) or 365 days (yearly)",
  },
  {
    feature: "Billing checkout",
    freeTier: "No",
    premiumTier: "Razorpay checkout",
  },
];

function normalizePlanCode(value: string): BillingPlanCode {
  return value === "premium_yearly" ? "premium_yearly" : "premium_monthly";
}

function toPlanDisplay(value: string): string {
  const normalized = String(value || "free").trim().toLowerCase();
  if (normalized === "premium_monthly") {
    return "Premium Monthly";
  }

  if (normalized === "premium_yearly") {
    return "Premium Yearly";
  }

  if (!normalized) {
    return "Free";
  }

  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function PremiumApiPlansPage() {
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [plans, setPlans] = useState<BillingPlan[]>(FALLBACK_PLANS);
  const [selectedPlanCode, setSelectedPlanCode] = useState<BillingPlanCode>("premium_monthly");
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [creatingCheckout, setCreatingCheckout] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [checkoutState, setCheckoutState] = useState<CheckoutState | null>(null);
  const [paymentResult, setPaymentResult] = useState<BillingConfirmResponse | null>(null);
  const [activePlanLabel, setActivePlanLabel] = useState("Free");
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    const loadPlans = async () => {
      setLoadingPlans(true);
      try {
        const payload = await fetchBillingPlans();
        if (Array.isArray(payload.plans) && payload.plans.length > 0) {
          setPlans(payload.plans);
          setSelectedPlanCode(normalizePlanCode(payload.plans[0].code));
        }
      } catch {
        setPlans(FALLBACK_PLANS);
      } finally {
        setLoadingPlans(false);
      }
    };

    void loadPlans();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = String(window.localStorage.getItem(USER_ID_STORAGE_KEY) || "").trim();
    if (stored) {
      setUserId(stored);
    }
  }, []);

  useEffect(() => {
    if (!copyStatus) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopyStatus(null);
    }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [copyStatus]);

  useEffect(() => {
    const lookupCurrentPlan = async () => {
      const normalizedUserId = String(userId || "").trim();
      if (!normalizedUserId) {
        return;
      }

      try {
        const keyData = await fetchMyApiKey(normalizedUserId);
        setActivePlanLabel(toPlanDisplay(keyData.plan_type));
      } catch {
        setActivePlanLabel("Free");
      }
    };

    void lookupCurrentPlan();
  }, [userId]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.code === selectedPlanCode) || FALLBACK_PLANS[0],
    [plans, selectedPlanCode]
  );

  function handleUserIdSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = String(userId || "").trim();

    if (!normalized) {
      setError("User ID is required.");
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(USER_ID_STORAGE_KEY, normalized);
    }

    clearRuntimeApiKey();
    setPaymentResult(null);
    setCheckoutState(null);
    setError(null);
  }

  async function handleCreateCheckout() {
    const normalized = String(userId || "").trim();
    if (!normalized) {
      setError("User ID is required.");
      return;
    }

    setError(null);
    setPaymentResult(null);
    setCreatingCheckout(true);

    try {
      const checkout = await createDemoBillingCheckout({
        userId: normalized,
        planCode: selectedPlanCode,
        gateway: "razorpay_test",
      });

      if (typeof window !== "undefined") {
        window.localStorage.setItem(USER_ID_STORAGE_KEY, normalized);
      }

      setCheckoutState({
        planCode: selectedPlanCode,
        orderId: checkout.order.id,
        amountDisplay: checkout.order.amount_display,
        razorpayKeyId: checkout.razorpay_key_id,
      });
    } catch (err) {
      setCheckoutState(null);
      setError(err instanceof Error ? err.message : "Could not create checkout");
    } finally {
      setCreatingCheckout(false);
    }
  }

  async function handleCompleteTestPayment() {
    const normalized = String(userId || "").trim();
    if (!normalized || !checkoutState) {
      setError("Create checkout first.");
      return;
    }

    setError(null);
    setConfirmingPayment(true);

    try {
      const demoPaymentId = `pay_test_${Date.now()}`;
      const result = await confirmDemoBillingPayment({
        userId: normalized,
        planCode: checkoutState.planCode,
        orderId: checkoutState.orderId,
        razorpayPaymentId: demoPaymentId,
        gateway: "razorpay_test",
      });

      setRuntimeApiKey(result.api_key);
      setPaymentResult(result);
      setActivePlanLabel(toPlanDisplay(result.subscription.plan_type));
      setCopyStatus("Premium API key generated. Copy it now.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm payment");
    } finally {
      setConfirmingPayment(false);
    }
  }

  async function handleCopyApiKey() {
    const value = String(paymentResult?.api_key || "").trim();
    if (!value) {
      setCopyStatus("No API key available to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus("API key copied.");
    } catch {
      setCopyStatus("Clipboard permission denied.");
    }
  }

  return (
    <div className="page-shell pb-10">
      <SiteNavbar />

      <main className="container-wrap mt-8 space-y-6">
        <section className="surface p-6 md:p-8">
          <p className="kicker">Premium API Access</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold">Choose Premium Plan</h1>
              <p className="mt-2 max-w-3xl muted">
                Razorpay checkout flow enabled. This screen upgrades API key plan and returns a
                fresh premium key after payment confirmation.
              </p>
            </div>

            <Link href="/dashboard/api-access" className="btn-base btn-ghost px-4 py-2 text-sm">
              API Key Dashboard
            </Link>
          </div>

          <form className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={handleUserIdSubmit}>
            <input
              className="input-dark rounded-xl px-3 py-2 text-sm"
              placeholder="User ID"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            />
            <button type="submit" className="btn-base btn-green px-4 py-2 text-sm">
              Save User ID
            </button>
          </form>

          <div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
            Current detected plan: <span className="font-semibold">{activePlanLabel}</span>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {plans.map((plan) => {
            const selected = plan.code === selectedPlanCode;
            return (
              <article
                key={plan.code}
                className={`feature-card p-5 ${selected ? "border-emerald-500/50 bg-emerald-500/10" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="kicker">{plan.billing_cycle === "yearly" ? "Best For Annual Teams" : "Start Fast"}</p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-100">{plan.name}</h2>
                  </div>

                  <div className="text-right">
                    <p className="text-3xl font-semibold text-emerald-200">{plan.amount_display}</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{plan.billing_cycle}</p>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-300">Usage limit: {plan.usage_limit.toLocaleString()} requests/day</p>

                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {plan.highlights.map((item) => (
                    <li key={`${plan.code}-${item}`}>• {item}</li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={`btn-base mt-5 w-full px-4 py-2 text-sm ${selected ? "btn-green" : "btn-ghost"}`}
                  onClick={() => setSelectedPlanCode(normalizePlanCode(plan.code))}
                >
                  {selected ? "Selected" : "Select Plan"}
                </button>
              </article>
            );
          })}
        </section>

        <section className="surface p-6 md:p-8">
          <p className="kicker">Razorpay Checkout</p>
          <h2 className="mt-2 text-2xl font-semibold">Payment Flow</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <article className="quick-card p-4">
              <p className="kicker">Selected Plan</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">{selectedPlan.name}</p>
            </article>
            <article className="quick-card p-4">
              <p className="kicker">Price</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">{selectedPlan.amount_display}</p>
            </article>
            <article className="quick-card p-4">
              <p className="kicker">Gateway</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">Razorpay</p>
            </article>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-base btn-main px-4 py-2 text-sm"
              disabled={loadingPlans || creatingCheckout}
              onClick={() => {
                void handleCreateCheckout();
              }}
            >
              {creatingCheckout ? "Creating Order..." : "Create Checkout"}
            </button>

            <button
              type="button"
              className="btn-base btn-green px-4 py-2 text-sm"
              disabled={!checkoutState || confirmingPayment}
              onClick={() => {
                void handleCompleteTestPayment();
              }}
            >
              {confirmingPayment ? "Confirming Payment..." : "Pay Now"}
            </button>
          </div>

          {checkoutState ? (
            <div className="mt-4 rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-sm text-violet-100">
              <p>
                Order created: <span className="font-mono">{checkoutState.orderId}</span>
              </p>
              <p className="mt-1">Amount: {checkoutState.amountDisplay}</p>
              <p className="mt-1">Razorpay Key: {checkoutState.razorpayKeyId}</p>
            </div>
          ) : null}

          {paymentResult ? (
            <div className="mt-4 rounded-xl border border-emerald-500/35 bg-emerald-500/12 p-4 text-sm text-emerald-100">
              <p className="font-semibold">Payment successful. Premium key generated:</p>
              <p className="mt-2 break-all font-mono text-xs md:text-sm">{paymentResult.api_key}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-base btn-green px-4 py-2 text-sm"
                  onClick={() => {
                    void handleCopyApiKey();
                  }}
                >
                  Copy Premium API Key
                </button>
                <Link href="/dashboard/api-access" className="btn-base btn-ghost px-4 py-2 text-sm">
                  Open API Key Dashboard
                </Link>
              </div>
            </div>
          ) : null}

          {copyStatus ? (
            <p className="mt-3 rounded-lg border border-cyan-500/35 bg-cyan-500/12 px-3 py-2 text-sm text-cyan-200">
              {copyStatus}
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-500/12 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
        </section>

        <section className="surface p-6 md:p-8">
          <p className="kicker">Free Vs Premium</p>
          <h2 className="mt-2 text-2xl font-semibold">Project Capability Matrix</h2>
          <p className="mt-2 muted">
            Matrix below maps current repository features and the new paid API-key behavior integrated in this update.
          </p>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700/70">
            <table className="min-w-full divide-y divide-slate-700/70 text-left text-sm">
              <thead className="bg-slate-900/70 text-xs uppercase tracking-[0.15em] text-slate-300">
                <tr>
                  <th className="px-4 py-3">Capability</th>
                  <th className="px-4 py-3">Free Tier</th>
                  <th className="px-4 py-3">Premium Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950/50 text-slate-200">
                {FEATURE_MATRIX.map((row) => (
                  <tr key={row.feature}>
                    <td className="px-4 py-3">{row.feature}</td>
                    <td className="px-4 py-3">{row.freeTier}</td>
                    <td className="px-4 py-3">{row.premiumTier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
