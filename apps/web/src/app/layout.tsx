import { color } from "@hub/tokens";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { themeBootScript } from "@/components/shell/ThemeToggle";
import { HubProvider } from "@/components/shell/HubProvider";
import { ServiceWorker } from "@/components/shell/ServiceWorker";
import { ToastProvider } from "@/components/shell/Toast";
import "./globals.css";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Hub",
  description: "The front door of the Mesh",
  applicationName: "Hub",
  // iPhone: Share → Add to Home Screen opens the hub full screen, with this icon.
  appleWebApp: { capable: true, title: "Hub", statusBarStyle: "black" },
  icons: {
    icon: [{ url: `${base}/icons/icon.svg`, type: "image/svg+xml" }, { url: `${base}/icons/icon-192.png`, sizes: "192x192" }],
    apple: [{ url: `${base}/icons/apple-touch-icon.png`, sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
  // Older iOS reads only the apple- name; Next writes the standard mobile-web-app-capable.
  other: { "apple-mobile-web-app-capable": "yes" },
};
export const viewport: Viewport = {
  themeColor: color.dark.ground,
  width: "device-width",
  initialScale: 1,
  // Lets the tab bar sit above the iPhone home indicator (see its safe-area padding).
  viewportFit: "cover",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {/* With credentials, so Authelia lets the manifest through. */}
        <link rel="manifest" href={`${base}/manifest.webmanifest`} crossOrigin="use-credentials" />
      </head>
      <body className="font-sans text-sm antialiased">
        <HubProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
            <ServiceWorker />
          </ToastProvider>
        </HubProvider>
      </body>
    </html>
  );
}
