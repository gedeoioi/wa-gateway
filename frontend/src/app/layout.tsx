import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "WA Gateway — WhatsApp API & Broadcast",
  description:
    "Kirim pesan WhatsApp otomatis, broadcast massal, dan integrasi REST API. Ringan, mudah, dan cepat.",
  // Next.js also auto-detects src/app/icon.svg as the favicon.
  // Drop an apple-icon.png (180x180) or opengraph-image.png (1200x630) next to
  // it and Next wires them up automatically. Only the icon is declared here
  // because it is the one that always exists.
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
