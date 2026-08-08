'use client';

import { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { api } from '@/lib/api';
import { Palette, Image, Type, Save, Loader2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';

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

const colorPresets = [
  { name: 'WhatsApp Green', primary: '#075E54', accent: '#128C7E' },
  { name: 'Blue Ocean', primary: '#1e40af', accent: '#3b82f6' },
  { name: 'Purple Night', primary: '#581c87', accent: '#a855f7' },
  { name: 'Red Rose', primary: '#991b1b', accent: '#ef4444' },
  { name: 'Orange Sunset', primary: '#9a3412', accent: '#f97316' },
  { name: 'Teal Forest', primary: '#115e59', accent: '#14b8a6' },
  { name: 'Slate Gray', primary: '#1e293b', accent: '#64748b' },
  { name: 'Pink Candy', primary: '#9d174d', accent: '#ec4899' },
];

export default function AppearancePage() {
  const [form, setForm] = useState({
    siteName: '',
    siteDescription: '',
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#075E54',
    accentColor: '#128C7E',
    footerText: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await api.get<{ success: boolean; data: SiteSettings }>('/api/v1/site-settings');
        setForm({
          siteName: res.data.siteName,
          siteDescription: res.data.siteDescription,
          logoUrl: res.data.logoUrl || '',
          faviconUrl: res.data.faviconUrl || '',
          primaryColor: res.data.primaryColor,
          accentColor: res.data.accentColor,
          footerText: res.data.footerText || '',
        });
      } catch {
        // use defaults
      } finally {
        setIsLoading(false);
      }
    }
    fetchSettings();
  }, []);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleUpload(file: File, type: 'logo' | 'favicon'): Promise<string | null> {
    const setUploading = type === 'logo' ? setIsUploadingLogo : setIsUploadingFavicon;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.upload<{ success: boolean; data: { url: string } }>('/api/v1/upload', formData);
      return res.data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo file max 2MB');
      return;
    }
    const url = await handleUpload(file, 'logo');
    if (url) {
      update('logoUrl', url);
      toast.success('Logo uploaded');
    }
  }

  async function handleFaviconSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      toast.error('Favicon file max 512KB');
      return;
    }
    const url = await handleUpload(file, 'favicon');
    if (url) {
      update('faviconUrl', url);
      toast.success('Favicon uploaded');
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await api.put('/api/v1/site-settings', form);
      toast.success('Settings saved. Refreshing...');
      setTimeout(() => window.location.reload(), 500);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout title="Appearance" subtitle="Customize website appearance">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Appearance" subtitle="Customize website appearance">
      <div className="max-w-3xl space-y-4 sm:space-y-6">

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-6">
            <Type className="h-6 w-6 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Branding</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
              <input
                type="text"
                value={form.siteName}
                onChange={(e) => update('siteName', e.target.value)}
                placeholder="WA Gateway"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site Description</label>
              <input
                type="text"
                value={form.siteDescription}
                onChange={(e) => update('siteDescription', e.target.value)}
                placeholder="WhatsApp Gateway Enterprise"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text</label>
              <input
                type="text"
                value={form.footerText}
                onChange={(e) => update('footerText', e.target.value)}
                placeholder="Optional footer text"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-6">
            <Image className="h-6 w-6 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Logo & Favicon</h2>
          </div>
          <div className="space-y-5">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleLogoSelect}
                className="hidden"
              />
              {form.logoUrl ? (
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                  <img src={form.logoUrl} alt="Logo" className="h-16 w-16 object-contain rounded border bg-white" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">Logo uploaded</p>
                    <p className="text-xs text-gray-400 truncate mt-1">{form.logoUrl}</p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={isUploadingLogo}
                        className="text-xs text-whatsapp hover:underline font-medium"
                      >
                        {isUploadingLogo ? 'Uploading...' : 'Replace'}
                      </button>
                      <button
                        type="button"
                        onClick={() => update('logoUrl', '')}
                        className="text-xs text-red-500 hover:underline font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="w-full flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-whatsapp hover:text-whatsapp transition-colors disabled:opacity-50"
                >
                  {isUploadingLogo ? (
                    <><Loader2 className="h-5 w-5 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="h-5 w-5" /> Upload Logo (PNG, JPG, SVG, max 2MB)</>
                  )}
                </button>
              )}
              <input
                type="url"
                value={form.logoUrl}
                onChange={(e) => update('logoUrl', e.target.value)}
                placeholder="Or enter URL: https://example.com/logo.png"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none mt-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Favicon</label>
              <input
                ref={faviconInputRef}
                type="file"
                accept="image/png,image/jpeg,image/x-icon,image/svg+xml"
                onChange={handleFaviconSelect}
                className="hidden"
              />
              {form.faviconUrl ? (
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                  <img src={form.faviconUrl} alt="Favicon" className="h-8 w-8 object-contain rounded border bg-white" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">Favicon uploaded</p>
                    <p className="text-xs text-gray-400 truncate mt-1">{form.faviconUrl}</p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => faviconInputRef.current?.click()}
                        disabled={isUploadingFavicon}
                        className="text-xs text-whatsapp hover:underline font-medium"
                      >
                        {isUploadingFavicon ? 'Uploading...' : 'Replace'}
                      </button>
                      <button
                        type="button"
                        onClick={() => update('faviconUrl', '')}
                        className="text-xs text-red-500 hover:underline font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => faviconInputRef.current?.click()}
                  disabled={isUploadingFavicon}
                  className="w-full flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-whatsapp hover:text-whatsapp transition-colors disabled:opacity-50"
                >
                  {isUploadingFavicon ? (
                    <><Loader2 className="h-5 w-5 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="h-5 w-5" /> Upload Favicon (PNG, ICO, SVG, max 512KB)</>
                  )}
                </button>
              )}
              <input
                type="url"
                value={form.faviconUrl}
                onChange={(e) => update('faviconUrl', e.target.value)}
                placeholder="Or enter URL: https://example.com/favicon.ico"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none mt-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-6">
            <Palette className="h-6 w-6 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Colors</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Color Presets</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {colorPresets.map((preset) => {
                  const active = form.primaryColor === preset.primary;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, primaryColor: preset.primary, accentColor: preset.accent }))}
                      className={"flex items-center gap-2 p-3 rounded-lg border-2 transition-colors " + (active ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300")}
                    >
                      <div className="flex gap-1">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.primary }}></div>
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: preset.accent }}></div>
                      </div>
                      <span className="text-xs font-medium text-gray-700 truncate">{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={form.primaryColor} onChange={(e) => update('primaryColor', e.target.value)}
                    className="h-10 w-16 rounded cursor-pointer border border-gray-300" />
                  <input type="text" value={form.primaryColor} onChange={(e) => update('primaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none font-mono text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Accent Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={form.accentColor} onChange={(e) => update('accentColor', e.target.value)}
                    className="h-10 w-16 rounded cursor-pointer border border-gray-300" />
                  <input type="text" value={form.accentColor} onChange={(e) => update('accentColor', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none font-mono text-sm" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Preview</label>
              <div className="flex gap-3">
                <div className="flex-1 p-4 rounded-lg text-white text-center text-sm font-medium" style={{ backgroundColor: form.primaryColor }}>
                  Primary
                </div>
                <div className="flex-1 p-4 rounded-lg text-white text-center text-sm font-medium" style={{ backgroundColor: form.accentColor }}>
                  Accent
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={handleSave} disabled={isSaving}
            className="bg-whatsapp hover:bg-whatsapp-dark text-white font-medium px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
            {isSaving ? (<><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>) : (<><Save className="h-4 w-4" /> Save Changes</>)}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
