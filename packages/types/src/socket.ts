export interface SocketEvents {
  'device:qr': (data: { deviceId: string; qr: string }) => void;
  'device:status': (data: { deviceId: string; status: string }) => void;
  'device:connected': (data: { deviceId: string; phoneNumber: string }) => void;
  'message:received': (data: { deviceId: string; message: unknown }) => void;
  'message:status': (data: { messageId: string; status: string }) => void;
  'broadcast:progress': (data: { broadcastId: string; sent: number; failed: number; total: number }) => void;
  'broadcast:completed': (data: { broadcastId: string }) => void;
  'notification': (data: { type: string; message: string }) => void;
}
