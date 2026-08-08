'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageSquare, Send, Search } from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  deviceId: string;
  recipient: string;
  content: string;
  type: string;
  status: string;
  direction: string;
  sentAt: string | null;
  createdAt: string;
  device: { id: string; name: string };
}

interface Device {
  id: string;
  name: string;
  status: string;
}

export default function MessagesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showSend, setShowSend] = useState(false);
  const [sendForm, setSendForm] = useState({
    deviceId: '',
    recipient: '',
    content: '',
  });
  const [isSending, setIsSending] = useState(false);

  const queryParams = new URLSearchParams({ page: String(page), limit: '20' });
  if (search) queryParams.set('recipient', search);

  const { data, isLoading, mutate } = useApi<Message[]>(`/api/v1/messages?${queryParams}`);
  const { data: deviceData } = useApi<Device[]>('/api/v1/devices');

  const messages = data?.data || [];
  const pagination = data?.pagination;
  const devices = deviceData?.data || [];

          async function handleSend() {
    if (!sendForm.deviceId || !sendForm.recipient) {
      toast.error('Please fill device and recipient');
      return;
    }
    if (!sendForm.content) {
      toast.error('Please enter a message');
      return;
    }
    setIsSending(true);
    try {
      await api.post('/api/v1/messages/send', sendForm);
      toast.success('Message sent');
      setShowSend(false);
      setSendForm({ deviceId: '', recipient: '', content: '' });
      mutate();
    } catch {
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <DashboardLayout title="Messages" subtitle="View and send messages">
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by recipient..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp focus:border-transparent outline-none"
          />
        </div>
        <button
          onClick={() => setShowSend(true)}
          className="bg-whatsapp hover:bg-whatsapp-dark text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Send className="h-4 w-4" />
          Send Message
        </button>
      </div>

      {showSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowSend(false)}></div>
          <div className="relative bg-white rounded-xl shadow-xl p-4 sm:p-6 w-full max-w-md mx-4 animate-fade-in">
            <h3 className="text-lg font-semibold mb-4">Send Message</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Device</label>
                <select
                  value={sendForm.deviceId}
                  onChange={(e) => setSendForm((prev) => ({ ...prev, deviceId: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                >
                  <option value="">Select device</option>
                  {devices.filter((d) => d.status === 'connected').map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipient</label>
                <input
                  type="text"
                  value={sendForm.recipient}
                  onChange={(e) => setSendForm((prev) => ({ ...prev, recipient: e.target.value }))}
                  placeholder="628xxx"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={sendForm.content}
                  onChange={(e) => setSendForm((prev) => ({ ...prev, content: e.target.value }))}
                  placeholder="Type your message..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowSend(false); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button
                onClick={handleSend}
                disabled={isSending}
                className="px-4 py-2 text-sm bg-whatsapp text-white rounded-lg hover:bg-whatsapp-dark disabled:opacity-50 flex items-center gap-2"
              >
                {isSending ? 'Sending...' : <><Send className="h-4 w-4" /> Send</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
          <div className="h-12 bg-gray-100"></div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex border-b border-gray-100 p-4"><div className="h-4 bg-gray-200 rounded w-full"></div></div>
          ))}
        </div>
      ) : messages.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-16 w-16" />}
          title="No messages"
          description="Send your first message to get started"
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Recipient</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Message</th>
                                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Device</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <tr key={msg.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-0">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{msg.recipient}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {msg.content}
                  </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{msg.device.name}</td>
                  <td className="px-6 py-4"><StatusBadge status={msg.status} /></td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(msg.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {pagination && (
            <div className="p-4 border-t border-gray-200">
              <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
