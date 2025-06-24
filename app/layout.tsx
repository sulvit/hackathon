import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import StoreProvider from "../components/StoreProvider";
import "./globals.css";
config.autoAddCss = false; // Tell Font Awesome to skip adding the CSS automatically since it's being imported above

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "S Translator",
  description: "Transcriber & Translator app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="application-name" content="Labkit" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Labkit" />
        <meta name="description" content="Labkit AI Conversation Agent" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Add theme color for browsers */}
        <meta name="theme-color" content="#f3f4f6" />
        {/* Add Apple touch icon link */}
        <link rel="apple-touch-icon" href="/labkit-v1-crop.png"></link>

        {/* Consider adding more icon sizes for apple-touch-icon if needed */}
        {/* <link rel="apple-touch-icon" sizes="152x152" href="/icon-152x152.png"> */}
        {/* <link rel="apple-touch-icon" sizes="180x180" href="/icon-180x180.png"> */}
        {/* <link rel="apple-touch-icon" sizes="167x167" href="/icon-167x167.png"> */}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen overflow-hidden bg-gray-100`}
      >
        <StoreProvider>
          <Toaster richColors position="top-right" />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
