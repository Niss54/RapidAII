import type { Metadata } from "next";
// import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import LiquidEther from "@/components/LiquidEther";
import "./globals.css";

// const spaceGrotesk = Space_Grotesk({
//   variable: "--font-space-grotesk",
//   subsets: ["latin"],
// });

// const ibmPlexMono = IBM_Plex_Mono({
//   variable: "--font-ibm-plex-mono",
//   weight: ["400", "500"],
//   subsets: ["latin"],
// });

export const metadata: Metadata = {
  title: "Rapid AI | ICU Voice + Patient Intelligence",
  description:
    "Rapid AI helps care teams monitor patients, detect early risk, and act faster through chat and voice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full bg-app text-foreground">

        <div className="liquid-ether-layer" aria-hidden="true">
          <LiquidEther
            mouseForce={11}
            cursorSize={92}
            colors={["#5227FF", "#FF9FFC", "#B19EEF"]}
            autoDemo
            autoSpeed={0.5}
            autoIntensity={1.4}
            isBounce={false}
            resolution={0.38}
            iterationsViscous={18}
            iterationsPoisson={16}
            adaptivePerformance
            style={{ width: "100%", height: "100%", position: "relative" }}
          />
        </div>

        <div className="app-layer">{children}</div>
      </body>
    </html>
  );
}
