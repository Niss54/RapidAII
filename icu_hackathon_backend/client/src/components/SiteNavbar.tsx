"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchSimulatorStatus } from "@/lib/api";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/chat", label: "Patient Chat" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/docs/api", label: "Docs" },
  { href: "/dashboard/premium", label: "Premium API" },
];

const rapidLogoSrc = "/assets/rapid.png?v=20260409";
const TELEMETRY_MODE_REFRESH_MS = 5000;
const API_ACCESS_ROUTE = "/dashboard/api-access";
const API_ACCESS_USER_STORAGE_KEY = "rapidai-api-access-user-id";

type TelemetryMode = "live" | "simulated";

type SiteNavbarProps = {
  lastUpdatedAt?: string | null;
};

function formatLastUpdated(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function KeyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 9.5a4.5 4.5 0 1 1-8.14 2.73A4.5 4.5 0 0 1 14.5 9.5Z" />
      <path d="M14 12h8" />
      <path d="M18 12v3" />
      <path d="M21 12v2" />
    </svg>
  );
}

export default function SiteNavbar({ lastUpdatedAt = null }: SiteNavbarProps) {
  const pathname = usePathname();
  const lastUpdatedLabel = formatLastUpdated(lastUpdatedAt);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [telemetryMode, setTelemetryMode] = useState<TelemetryMode>("live");
  const isDashboardRoute = pathname.startsWith("/dashboard");

  const shouldShowTelemetryModeBadge =
    pathname === "/dashboard" || pathname.startsWith("/patients/");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncAuthState = () => {
      const storedUserId = window.localStorage.getItem(API_ACCESS_USER_STORAGE_KEY);
      setIsAuthenticated(String(storedUserId || "").trim().length > 0);
    };

    syncAuthState();
    window.addEventListener("storage", syncAuthState);

    return () => {
      window.removeEventListener("storage", syncAuthState);
    };
  }, [pathname]);

  useEffect(() => {
    if (!shouldShowTelemetryModeBadge) {
      return;
    }

    let active = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    const refreshTelemetryMode = async () => {
      try {
        const status = await fetchSimulatorStatus();
        if (!active) {
          return;
        }

        setTelemetryMode(status.running ? "simulated" : "live");
      } catch {
        if (active) {
          setTelemetryMode("live");
        }
      }
    };

    void refreshTelemetryMode();
    interval = setInterval(() => {
      void refreshTelemetryMode();
    }, TELEMETRY_MODE_REFRESH_MS);

    return () => {
      active = false;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [shouldShowTelemetryModeBadge]);

  return (
    <header className="sticky top-0 z-40 pt-4">
      <div className={`container-wrap ${isDashboardRoute ? "nav-dashboard-wrap" : "nav-compact-wrap"}`}>
        <div className="nav-glass flex items-center justify-between rounded-[30px] px-3 py-2.5 md:px-5 md:py-3">
          <Link href="/" className="flex items-center gap-2 px-2">
            <Image
              src={rapidLogoSrc}
              alt="Rapid AI logo"
              width={46}
              height={46}
              className="rounded-lg object-cover"
              unoptimized
              priority
            />
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">RAPID AI</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Care Copilot</p>
            </div>
          </Link>

          <nav className="hidden shrink-0 items-center gap-1 md:flex md:flex-nowrap">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-4 py-2 text-sm whitespace-nowrap nav-link ${active ? "nav-link-active" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}

            {isAuthenticated ? (
              <Link
                href={API_ACCESS_ROUTE}
                className={`rounded-full px-4 py-2 text-sm whitespace-nowrap nav-link ${
                  pathname === API_ACCESS_ROUTE ? "nav-link-active" : ""
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <KeyIcon />
                  <span>API</span>
                </span>
              </Link>
            ) : null}
          </nav>

          <div className="flex items-center gap-2">
            {shouldShowTelemetryModeBadge ? (
              <span
                className={`hidden rounded-full border px-3 py-1 text-[11px] font-semibold lg:inline-flex ${
                  telemetryMode === "simulated"
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                    : "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                }`}
              >
                {telemetryMode === "simulated" ? "Simulated Telemetry" : "Live Telemetry"}
              </span>
            ) : null}

            {lastUpdatedLabel ? (
              <span
                className="hidden rounded-full border border-cyan-500/35 bg-cyan-500/12 px-3 py-1 text-[11px] font-semibold text-cyan-200 lg:inline-flex"
                title={lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : undefined}
              >
                Last Updated: {lastUpdatedLabel}
              </span>
            ) : null}

            <Link href="/chat" className="btn-base btn-green px-4 py-2 text-sm">
              Start Talking
            </Link>
            <Link href="/dashboard" className="btn-base btn-ghost hidden px-4 py-2 text-sm sm:inline-flex">
              Patient Status
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
