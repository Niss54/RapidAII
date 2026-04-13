import Image from "next/image";
import Link from "next/link";
import type { IconType } from "react-icons";
import { FaGithub, FaLinkedinIn } from "react-icons/fa6";

const rapidLogoSrc = "/assets/rapid.png?v=20260409";

const quickLinks = [
  { label: "Home", href: "/" },
  { label: "Patient Chat", href: "/chat" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Contact", href: "/docs" },
];

const companyLinks = [
  { label: "Rapid AI", href: "/" },
  { label: "ICU Voice", href: "/chat" },
  { label: "Patient Intel", href: "/dashboard" },
  { label: "Care Copilot", href: "/docs" },
];

const resourceLinks = [
  { label: "Docs", href: "/docs" },
  { label: "API Docs", href: "/docs/api" },
  { label: "Setup Guide", href: "/docs" },
  { label: "Integration Status", href: "/dashboard#integrationStatus" },
];

const serviceLinks = [
  { label: "AI Integration", href: "/docs" },
  { label: "Voice Monitoring", href: "/chat" },
  { label: "Escalation Alerts", href: "/dashboard" },
  { label: "Case Insights", href: "/patients/205" },
];

type SocialLink = {
  label: string;
  href: string;
  Icon: IconType;
};

const socialLinks: SocialLink[] = [
  { label: "LinkedIn", href: "https://linkedin.com", Icon: FaLinkedinIn },
  { label: "GitHub", href: "https://github.com", Icon: FaGithub },
];

function FooterLinkColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <div>
      <h4 className="text-[clamp(1.2rem,1.45vw,1.35rem)] leading-tight font-semibold text-white">{title}</h4>
      <ul className="mt-4 space-y-2.5 text-[1rem] leading-snug text-slate-400 md:text-[1.03rem]">
        {links.map((link) => (
          <li key={`${title}-${link.label}`}>
            <Link className="transition-colors duration-200 hover:text-white" href={link.href}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SiteFooter() {
  return (
    <footer className="mt-16 pb-10">
      <div className="container-wrap footer-wide-wrap">
        <div className="nav-glass footer-frame rounded-[30px] px-6 py-8 text-slate-300 md:px-9 md:py-10">
          <div className="grid grid-cols-1 items-start gap-10 border-b border-cyan-500/20 pb-12 lg:grid-cols-[1.8fr_repeat(4,minmax(0,1fr))_0.9fr]">
            <section className="max-w-[320px]">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/40 bg-[#041019] p-2 shadow-[0_0_18px_rgba(34,211,238,0.16)]">
                <Image
                  src={rapidLogoSrc}
                  alt="Rapid AI logo"
                  width={46}
                  height={46}
                  className="h-11 w-11 rounded-full object-cover"
                  unoptimized
                />
              </div>
              <p className="mt-5 text-[0.96rem] leading-relaxed text-slate-300 md:text-[1.02rem]">
                Rapid AI powers ICU teams with real-time patient intelligence, faster voice-guided triage, and safer
                escalation decisions.
              </p>
            </section>

            <FooterLinkColumn title="Quick Links" links={quickLinks} />
            <FooterLinkColumn title="Company" links={companyLinks} />
            <FooterLinkColumn title="Resources" links={resourceLinks} />
            <FooterLinkColumn title="Services" links={serviceLinks} />

            <section>
              <h4 className="text-[clamp(1.2rem,1.45vw,1.35rem)] font-semibold text-white">Connect</h4>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {socialLinks.map(({ label, href, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/40 bg-[#031019] text-cyan-300 transition-colors duration-200 hover:border-cyan-300 hover:text-white"
                  >
                    <Icon size={22} />
                  </a>
                ))}
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-5 pt-8 text-[1rem] leading-relaxed text-slate-400 lg:flex-row lg:items-start lg:justify-between">
            <p className="max-w-[980px]">
              By using this website, you agree to our Terms of Service. Services are delivered based on agreed project
              scope and payment milestones, client data is handled responsibly, and our liability is limited to the
              amount paid for the project under applicable law.
            </p>

            <div className="flex flex-wrap gap-x-8 gap-y-2 text-[1rem] text-slate-300">
              <Link className="underline decoration-cyan-500/40 underline-offset-4 hover:text-white" href="/docs">
                Terms of Service
              </Link>
              <Link className="underline decoration-cyan-500/40 underline-offset-4 hover:text-white" href="/docs">
                Privacy Policy
              </Link>
              <Link className="underline decoration-cyan-500/40 underline-offset-4 hover:text-white" href="/docs">
                Cookies
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 text-[0.98rem] text-slate-300 lg:flex-row lg:items-center lg:justify-between">
            <p>© 2026 Rapid AI by Team Syntrix. All rights reserved.</p>
            <p>
              Designed &amp; Built with <span className="text-cyan-300">&hearts;</span> by Team Syntrix
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
