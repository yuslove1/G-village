import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Toaster } from "sonner";
import "@/styles/globals.css";
import { Providers } from "./providers";
import { BottomNav } from "@/components/bottom-nav";

/**
 * Fraunces for display, Inter for everything else. The serif does the talking
 * on headings and the sans stays out of the way, which is what keeps a
 * five-colour palette from reading as plain.
 */
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500"],
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Gadgetvillage",
    template: "%s · Gadgetvillage",
  },
  description:
    "Buy, sell and trade phones and laptops anywhere in Nigeria. Every used device checked in person before it ships.",
  openGraph: {
    title: "Gadgetvillage",
    description: "Computer Village, at your doorstep.",
    type: "website",
    locale: "en_NG",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#141413",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh">
        <Providers>
          {/* Keyboard users should not have to tab through the whole nav to
              reach the page they came for. */}
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-pill focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-white"
          >
            Skip to content
          </a>

          <main id="main" className="mx-auto min-h-dvh w-full max-w-lg pb-24">
            {children}
          </main>

          <BottomNav />
          <Toaster
            position="top-center"
            toastOptions={{
              className: "font-sans text-sm",
              style: { borderRadius: "12px", border: "1px solid #ECEAE2" },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
