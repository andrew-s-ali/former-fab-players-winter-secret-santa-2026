import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { IdentityCallbackRedirect } from "@/components/IdentityCallbackRedirect";
import { Snowfall } from "@/components/Snowfall";
import { eventTitle } from "@/lib/event";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: eventTitle(),
  description: `${eventTitle()} — a Commander deck exchange for the former Fab players.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <IdentityCallbackRedirect />
        <Snowfall />
        {children}
      </body>
    </html>
  );
}
