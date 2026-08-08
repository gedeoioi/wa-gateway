export type DeviceStatus = 'connected' | 'disconnected' | 'connecting' | 'qr_pending';

export interface Device {
  id: string;
  name: string;
  phoneNumber: string | null;
  status: DeviceStatus;
  isActive: boolean;
  lastConnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceCreateRequest {
  name: string;
}

export interface DeviceQRCode {
  qr: string;
  deviceId: string;
}
