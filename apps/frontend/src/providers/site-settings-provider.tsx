'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { api } from '@/lib/api';

interface SiteSettings {
  id: string;
  siteName: string;
  siteDescription: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  footerText: string | null;
}

const defaultSettings: SiteSettings = {
  id: 'default',
  siteName: 'WA Gateway',
  siteDescription: 'WhatsApp Gateway Enterprise',
  logoUrl: null,
  faviconUrl: null,
  primaryColor: '#075E54',
  accentColor: '#128C7E',
  footerText: null,
};

const SiteSettingsContext = createContext<SiteSettings>(defaultSettings);

export function useSiteSettings(): SiteSettings {
  return useContext(SiteSettingsContext);
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '7 94 84';
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
}

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await api.get<{ success: boolean; data: SiteSettings }>('/api/v1/site-settings');
        setSettings(res.data);
      } catch {
        // use defaults
      }
    }
    fetchSettings();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', settings.primaryColor);
    root.style.setProperty('--color-accent', settings.accentColor);
    root.style.setProperty('--color-primary-rgb', hexToRgb(settings.primaryColor));

    if (settings.faviconUrl) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = settings.faviconUrl;
    }

    document.title = settings.siteName || 'WA Gateway';
  }, [settings]);

  return (
    <SiteSettingsContext.Provider value={settings}>
      {children}
    </SiteSettingsContext.Provider>
  );
}
