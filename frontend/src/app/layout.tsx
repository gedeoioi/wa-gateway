import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "WA Gateway — WhatsApp API & Broadcast",
  description:
    "Kirim pesan WhatsApp otomatis, broadcast massal, dan integrasi REST API. Ringan, mudah, dan cepat.",
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
