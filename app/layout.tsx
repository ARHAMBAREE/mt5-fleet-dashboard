import type { Metadata, Viewport } from "next";
import "./globals.css";
import ShellWrapper from "@/components/shell/ShellWrapper";

export const metadata: Metadata = {
  title: "MT5 Fleet Dashboard",
  description:
    "Professional multi-account MetaTrader 5 monitoring platform — realtime telemetry, risk analytics, and alerts across your entire MT5 fleet.",
  applicationName: "MT5 Fleet Dashboard",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0a0e16",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ShellWrapper>{children}</ShellWrapper>
      </body>
    </html>
  );
}
