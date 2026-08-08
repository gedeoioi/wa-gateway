'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useApi } from '@/hooks/use-api';
import { CardSkeleton } from '@/components/ui/loading-skeleton';
import { Smartphone, MessageSquare, Send, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { connectSocket } from '@/lib/socket';

interface DeviceItem {
  id: string;
  name: string;
  status: string;
}

interface MessageStats {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
}

interface ContactItem {
  id: string;
}

export default function DashboardPage() {
  const { data: deviceData, isLoading: loadingDevices } = useApi<DeviceItem[]>('/api/v1/devices');
  const { data: msgStats, isLoading: loadingMessages } = useApi<MessageStats>('/api/v1/messages/stats');
  const { data: contactData } = useApi<ContactItem[]>('/api/v1/contacts');

  const [deviceStatuses, setDeviceStatuses] = useState<Record<string, string>>({});

  useEffect(() => {
    const socket = connectSocket();
    socket.on('device:status', (data: { deviceId: string; status: string }) => {
      setDeviceStatuses((prev) => ({ ...prev, [data.deviceId]: data.status }));
    });
    return () => {
      socket.off('device:status');
    };
  }, []);

  const devices = deviceData?.data || [];
  const contacts = contactData?.data || [];
  const messages = msgStats?.data || { total: 0, sent: 0, delivered: 0, failed: 0 };

  const connectedDevices = devices.filter(
    (d) => (deviceStatuses[d.id] || d.status) === 'connected',
  ).length;

  const statsCards = [
    {
      label: 'Total Devices',
      value: devices.length,
      subtext: `${connectedDevices} connected`,
      icon: Smartphone,
      color: 'bg-blue-500',
    },
    {
      label: 'Total Messages',
      value: messages.total,
      subtext: `${messages.sent} sent`,
      icon: MessageSquare,
      color: 'bg-green-500',
    },
    {
      label: 'Messages Failed',
      value: messages.failed,
      subtext: 'Error rate',
      icon: Send,
      color: 'bg-red-500',
    },
    {
      label: 'Contacts',
      value: contacts.length,
      subtext: 'Total contacts',
      icon: Users,
      color: 'bg-purple-500',
    },
  ];

  return (
    <DashboardLayout title="Dashboard" subtitle="Overview of your WhatsApp Gateway">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
        {statsCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className={`${card.color} p-3 rounded-lg`}>
                <card.icon className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="text-sm font-medium text-gray-500">{card.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
            <p className="text-xs text-gray-400 mt-1">{card.subtext}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Device Status</h2>
          {loadingDevices ? (
            <CardSkeleton />
          ) : devices.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No devices configured</p>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => {
                const status = deviceStatuses[device.id] || device.status;
                return (
                  <div key={device.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-5 w-5 text-gray-400" />
                      <span className="font-medium text-gray-900">{device.name}</span>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                        status === 'connected'
                          ? 'bg-green-100 text-green-800'
                          : status === 'connecting'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Message Statistics</h2>
          {loadingMessages ? (
            <CardSkeleton />
          ) : (
            <div className="space-y-4">
              {[
                { label: 'Total', value: messages.total, color: 'bg-gray-200' },
                { label: 'Sent', value: messages.sent, color: 'bg-blue-500' },
                { label: 'Delivered', value: messages.delivered, color: 'bg-green-500' },
                { label: 'Failed', value: messages.failed, color: 'bg-red-500' },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{stat.label}</span>
                    <span className="font-medium">{stat.value}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`${stat.color} h-2 rounded-full transition-all duration-500`}
                      style={{
                        width: messages.total > 0 ? `${(stat.value / messages.total) * 100}%` : '0%',
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
