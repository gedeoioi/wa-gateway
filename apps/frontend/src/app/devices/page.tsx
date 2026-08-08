'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { connectSocket } from '@/lib/socket';
import { Smartphone, Plus, Wifi, WifiOff, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Device {
  id: string;
  name: string;
  phoneNumber: string | null;
  status: string;
  isActive: boolean;
  lastConnectedAt: string | null;
  createdAt: string;
}

export default function DevicesPage() {
  const { data, isLoading, mutate } = useApi<Device[]>('/api/v1/devices');
  const [devices, setDevices] = useState<Device[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<{ deviceId: string; qr: string } | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (data?.data) setDevices(data.data);
  }, [data]);

  const pollQR = useCallback(async (deviceId: string) => {
    try {
      const res = await api.get<{ success: boolean; data: { qr: string } | null }>(
        `/api/v1/devices/${deviceId}/qr`,
      );
      if (res.data?.qr) {
        setQrCode({ deviceId, qr: res.data.qr });
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      // ignore polling errors
    }
  }, []);

  useEffect(() => {
    const socket = connectSocket();

    socket.on('device:status', (d: { deviceId: string; status: string }) => {
      setDevices((prev) =>
        prev.map((dev) => (dev.id === d.deviceId ? { ...dev, status: d.status } : dev)),
      );

      if (d.status === 'connected' || d.status === 'disconnected') {
        setQrCode((prev) => (prev?.deviceId === d.deviceId ? null : prev));
        setConnectingId((prev) => (prev === d.deviceId ? null : prev));
      }
    });

    socket.on('device:connected', (d: { deviceId: string; phoneNumber: string }) => {
      setDevices((prev) =>
        prev.map((dev) =>
          dev.id === d.deviceId ? { ...dev, phoneNumber: d.phoneNumber, status: 'connected' } : dev,
        ),
      );
      setQrCode((prev) => (prev?.deviceId === d.deviceId ? null : prev));
      setConnectingId(null);
    });

    socket.on('device:qr', (d: { deviceId: string; qr: string }) => {
      setQrCode(d);
      setConnectingId(null);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    });

    return () => {
      socket.off('device:status');
      socket.off('device:connected');
      socket.off('device:qr');
    };
  }, []);

  useEffect(() => {
    if (connectingId) {
      pollQR(connectingId);
      pollRef.current = setInterval(() => pollQR(connectingId), 3000);
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }
  }, [connectingId, pollQR]);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await api.post('/api/v1/devices', { name: newName });
      toast.success('Device created');
      setNewName('');
      setShowCreate(false);
      mutate();
    } catch {
      toast.error('Failed to create device');
    }
  }

  async function handleConnect(id: string) {
    try {
      setConnectingId(id);
      setQrCode(null);
      await api.post(`/api/v1/devices/${id}/connect`);
      toast.success('Connecting...');
    } catch {
      toast.error('Failed to connect');
      setConnectingId(null);
    }
  }

  async function handleDisconnect(id: string) {
    try {
      await api.post(`/api/v1/devices/${id}/disconnect`);
      toast.success('Disconnected');
      setConnectingId(null);
      setQrCode(null);
      mutate();
    } catch {
      toast.error('Failed to disconnect');
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await api.delete(`/api/v1/devices/${deleteId}`);
      toast.success('Device deleted');
      setDeleteId(null);
      mutate();
    } catch {
      toast.error('Failed to delete');
    }
  }

  return (
    <DashboardLayout title="Devices" subtitle="Manage your WhatsApp devices">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <p className="text-sm text-gray-500">{devices.length} device(s)</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-whatsapp hover:bg-whatsapp-dark text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Device
        </button>
      </div>

      {qrCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setQrCode(null)}></div>
          <div className="relative bg-white rounded-xl shadow-xl p-8 text-center animate-fade-in">
            <h3 className="text-lg font-semibold mb-2">Scan QR Code</h3>
            <p className="text-sm text-gray-500 mb-4">Open WhatsApp on your phone and scan this code</p>
            <div className="bg-white p-4 rounded-lg border-2 border-gray-200 inline-block">
              <img
                src={qrCode.qr}
                alt="WhatsApp QR Code"
                width={256}
                height={256}
                className="block"
              />
            </div>
            <p className="text-xs text-gray-400 mt-3">
              QR code refreshes automatically. Close and reconnect if it expires.
            </p>
            <button
              onClick={() => setQrCode(null)}
              className="mt-4 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreate(false)}></div>
          <div className="relative bg-white rounded-xl shadow-xl p-4 sm:p-6 w-full max-w-md mx-4 animate-fade-in">
            <h3 className="text-lg font-semibold mb-4">New Device</h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Device name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp focus:border-transparent outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 text-sm bg-whatsapp text-white rounded-lg hover:bg-whatsapp-dark"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : devices.length === 0 ? (
        <EmptyState
          icon={<Smartphone className="h-16 w-16" />}
          title="No devices"
          description="Add your first WhatsApp device to get started"
          action={
            <button
              onClick={() => setShowCreate(true)}
              className="bg-whatsapp hover:bg-whatsapp-dark text-white px-4 py-2 rounded-lg"
            >
              Add Device
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => (
            <div key={device.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-100 p-2 rounded-lg">
                    <Smartphone className="h-5 w-5 text-gray-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{device.name}</h3>
                    <p className="text-xs text-gray-500">{device.phoneNumber || 'Not connected'}</p>
                  </div>
                </div>
                <StatusBadge status={device.status} />
              </div>

              <div className="flex gap-2 mt-4">
                {device.status === 'connected' ? (
                  <button
                    onClick={() => handleDisconnect(device.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <WifiOff className="h-4 w-4" />
                    Disconnect
                  </button>
                ) : connectingId === device.id ? (
                  <button
                    disabled
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-yellow-600 bg-yellow-50 rounded-lg"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Waiting for QR...
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(device.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    <Wifi className="h-4 w-4" />
                    Connect
                  </button>
                )}
                <button
                  onClick={() => setDeleteId(device.id)}
                  className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Device"
        message="Are you sure? This will disconnect and remove the device permanently."
        confirmText="Delete"
      />
    </DashboardLayout>
  );
}
