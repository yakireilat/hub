import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { themeBootScript } from "@/components/shell/ThemeToggle";
import { HubProvider } from "@/components/shell/HubProvider";
import { ToastProvider } from "@/components/shell/Toast";
import "./globals.css";

export const metadata: Metadata = { title: "Hub", description: "The front door of the Mesh" };
export const viewport: Viewport = { themeColor: "#0D0E11", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="font-sans text-sm antialiased">
        <HubProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </HubProvider>
      </body>
    </html>
  );
}
