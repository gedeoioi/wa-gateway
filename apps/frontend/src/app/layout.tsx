import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/providers/auth-provider';
import { SiteSettingsProvider } from '@/providers/site-settings-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'WA Gateway Enterprise',
  description: 'WhatsApp Gateway Enterprise Management System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SiteSettingsProvider>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: { duration: 3000 },
              error: { duration: 5000 },
            }}
          />
        </AuthProvider>
        </SiteSettingsProvider>
      </body>
    </html>
  );
}
