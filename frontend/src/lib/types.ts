export type DeviceStatus = "connected" | "connecting" | "disconnected" | "logged_out";

export interface User {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  role: string;
  usedThisMonth: number;
  monthlyQuota: number;
  createdAt?: string;
}

export interface Device {
  id: string;
  name: string;
  phoneNumber: string | null;
  status: DeviceStatus;
  lastError: string | null;
  lastSeenAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface MessageLog {
  id: string;
  to: string;
  body: string;
  type: string;
  status: "queued" | "sending" | "sent" | "failed";
  error: string | null;
  source: string;
  direction: string;
  deviceId: string | null;
  deviceName: string | null;
  mediaUrl: string | null;
  providerId: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface BroadcastSummary {
  id: string;
  name: string;
  status: "draft" | "queued" | "running" | "completed" | "failed" | "cancelled";
  total: number;
  sent: number;
  failed: number;
  pending: number;
  delayMs: number;
  deviceName: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  progress?: number;
}

export interface BroadcastRecipient {
  id: string;
  phone: string;
  name: string | null;
  status: "pending" | "sent" | "failed";
  error: string | null;
  sentAt: string | null;
  body: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  masked: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface DashboardStats {
  stats: {
    sent: number;
    failed: number;
    queued: number;
    todaySent: number;
    devices: number;
    connected: number;
    broadcasts: number;
    quota: { used: number; limit: number };
  };
  trend: { date: string; sent: number; failed: number }[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
