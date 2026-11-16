import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Verity — pre-publication brand compliance",
  description: "Check content against brand rules, facts, terminology and visual identity before it goes live.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background focus:p-2">
          Skip to content
        </a>
        <Header />
        <main id="main" className="mx-auto max-w-6xl px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
