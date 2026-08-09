'use client';

import { useState, useEffect, FormEvent } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import {
  Settings, User, Shield, Eye, EyeOff, Loader2,
  Lock, Monitor, Clock, CheckCircle, XCircle, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface LoginRecord {
  id: string;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  reason: string | null;
  createdAt: string;
}

interface SessionData {
  currentSession: {
    ip: string;
    userAgent: string;
    loginAt: string | null;
  };
  security: {
    lastPasswordChange: string | null;
    failedLoginAttempts: number;
    isLocked: boolean;
    lockedUntil: string | null;
  };
}

export default function SettingsPage() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [session, setSession] = useState<SessionData | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginRecord[]>([]);
  const [loadingSecurity, setLoadingSecurity] = useState(true);

  useEffect(() => {
    async function fetchSecurityData() {
      setLoadingSecurity(true);
      try {
        const [sessionRes, historyRes] = await Promise.all([
          api.get<{ success: boolean; data: SessionData }>('/api/v1/auth/session'),
          api.get<{ success: boolean; data: LoginRecord[] }>('/api/v1/auth/login-history?limit=10'),
        ]);
        setSession(sessionRes.data);
        setLoginHistory(historyRes.data);
      } catch {
        // silent
      } finally {
        setLoadingSecurity(false);
      }
    }
    fetchSecurityData();
  }, []);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    setIsChangingPassword(true);
    try {
      await api.put('/api/v1/auth/change-password', { currentPassword, newPassword });
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleRevokeSessions() {
    try {
      const res = await api.post<{ success: boolean; message: string; data: { accessToken: string; refreshToken: string } }>('/api/v1/auth/revoke-sessions');
      
      if (res.data?.accessToken) {
        localStorage.setItem('accessToken', res.data.accessToken);
        localStorage.setItem('refreshToken', res.data.refreshToken);
      }

      toast.success('All other sessions revoked');

      setTimeout(async () => {
        try {
          const [sessionRes, historyRes] = await Promise.all([
            api.get<{ success: boolean; data: SessionData }>('/api/v1/auth/session'),
            api.get<{ success: boolean; data: LoginRecord[] }>('/api/v1/auth/login-history?limit=10'),
          ]);
          setSession(sessionRes.data);
          setLoginHistory(historyRes.data);
        } catch {
          // silent
        }
      }, 300);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke sessions');
    }
  }

  function parseUserAgent(ua: string | null): string {
    if (!ua) return 'Unknown device';
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edg')) return 'Edge';
    if (ua.includes('PostmanRuntime')) return 'Postman';
    return ua.substring(0, 50) + '...';
  }

  return (
    <DashboardLayout title="Settings" subtitle="System configuration">
      <div className="max-w-4xl space-y-4 sm:space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-6">
            <User className="h-6 w-6 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Username</label>
              <p className="text-gray-900">{user?.username || '-'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Email</label>
              <p className="text-gray-900">{user?.email || '-'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Role</label>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                {user?.role || '-'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-6 w-6 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Security</h2>
          </div>

          {loadingSecurity ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-6">
              {session && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                      <Monitor className="h-4 w-4" /> Current Session
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{session.currentSession.ip}</p>
                    <p className="text-xs text-gray-400">{parseUserAgent(session.currentSession.userAgent)}</p>
                    {session.currentSession.loginAt && (
                      <p className="text-xs text-gray-400">
                        {new Date(session.currentSession.loginAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                      <Lock className="h-4 w-4" /> Password Age
                    </div>
                    <p className="text-sm font-medium text-gray-900">
                      {session.security.lastPasswordChange
                        ? `${Math.floor((Date.now() - new Date(session.security.lastPasswordChange).getTime()) / 86400000)} days ago`
                        : 'Never changed'}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                      <AlertTriangle className="h-4 w-4" /> Account Status
                    </div>
                    {session.security.isLocked ? (
                      <span className="inline-flex items-center gap-1 text-sm text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                        <Lock className="h-3 w-3" /> Locked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        <CheckCircle className="h-3 w-3" /> Secure
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Change Password</h3>
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                    <div className="relative">
                      <input
                        type={showCurrent ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp focus:border-transparent outline-none transition-all pr-10"
                        placeholder="Enter current password"
                        required
                        autoComplete="current-password"
                      />
                      <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <div className="relative">
                      <input
                        type={showNew ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp focus:border-transparent outline-none transition-all pr-10"
                        placeholder="Enter new password"
                        required
                        autoComplete="new-password"
                      />
                      <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp focus:border-transparent outline-none transition-all"
                      placeholder="Confirm new password"
                      required
                      autoComplete="new-password"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="bg-whatsapp hover:bg-whatsapp-dark text-white font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isChangingPassword ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Updating...</>
                    ) : (
                      'Change Password'
                    )}
                  </button>
                </form>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">Login History</h3>
                  <button
                    onClick={handleRevokeSessions}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Revoke All Sessions
                  </button>
                </div>
                {loginHistory.length === 0 ? (
                  <p className="text-sm text-gray-500">No login history available.</p>
                ) : (
                  <div className="space-y-2">
                    {loginHistory.map((record) => (
                      <div key={record.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          {record.success ? (
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          )}
                          <div>
                            <p className="text-sm text-gray-900">
                              {record.success ? 'Successful login' : record.reason || 'Failed login'}
                            </p>
                            <p className="text-xs text-gray-400">
                              {record.ip} &middot; {parseUserAgent(record.userAgent)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock className="h-3 w-3" />
                          {new Date(record.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
