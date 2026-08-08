'use client';

import { useState, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageSquare, Send, Search, Paperclip, X, Image, FileText, Film, Music } from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  deviceId: string;
  recipient: string;
  content: string;
  type: string;
  status: string;
  direction: string;
  mediaUrl: string | null;
  sentAt: string | null;
  createdAt: string;
  device: { id: string; name: string };
}

interface Device {
  id: string;
  name: string;
  status: string;
}

function getTypeIcon(type: string) {
  if (type.startsWith('image')) return <Image className="h-4 w-4 text-blue-500" />;
  if (type.startsWith('video')) return <Film className="h-4 w-4 text-purple-500" />;
  if (type.startsWith('audio')) return <Music className="h-4 w-4 text-green-500" />;
  return <FileText className="h-4 w-4 text-gray-500" />;
}

export default function MessagesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showSend, setShowSend] = useState(false);
  const [sendForm, setSendForm] = useState({
    deviceId: '',
    recipient: '',
    content: '',
    type: 'text',
    mediaUrl: '',
  });
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryParams = new URLSearchParams({ page: String(page), limit: '20' });
  if (search) queryParams.set('recipient', search);

  const { data, isLoading, mutate } = useApi<Message[]>(`/api/v1/messages?${queryParams}`);
  const { data: deviceData } = useApi<Device[]>('/api/v1/devices');

  const messages = data?.data || [];
  const pagination = data?.pagination;
  const devices = deviceData?.data || [];

  function getMediaType(mime: string): string {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error('File size max 16MB');
      return;
    }
    setSelectedFile(file);
    setSendForm((prev) => ({ ...prev, type: getMediaType(file.mimetype || file.type) }));
  }

  async function handleUpload(): Promise<string | null> {
    if (!selectedFile) return null;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await fetch(`${window.location.origin}/api/v1/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data.data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
      return null;
    } finally {
      setIsUploading(false);
    }
  }

  function clearFile() {
    setSelectedFile(null);
    setSendForm((prev) => ({ ...prev, type: 'text', mediaUrl: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSend() {
    if (!sendForm.deviceId || !sendForm.recipient) {
      toast.error('Please fill device and recipient');
      return;
    }
    if (!sendForm.content && !selectedFile) {
      toast.error('Please enter a message or attach a file');
      return;
    }
    setIsSending(true);
    try {
      let mediaUrl = sendForm.mediaUrl;
      if (selectedFile) {
        mediaUrl = await handleUpload();
        if (!mediaUrl) { setIsSending(false); return; }
      }
      await api.post('/api/v1/messages/send', {
        ...sendForm,
        mediaUrl: mediaUrl || undefined,
      });
      toast.success('Message sent');
      setShowSend(false);
      setSendForm({ deviceId: '', recipient: '', content: '', type: 'text', mediaUrl: '' });
      setSelectedFile(null);
      mutate();
    } catch {
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <DashboardLayout title="Messages" subtitle="View and send messages">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
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
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md animate-fade-in">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attach File (optional)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
                  className="hidden"
                />
                {selectedFile ? (
                  <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    {getTypeIcon(selectedFile.type)}
                    <span className="text-sm text-gray-700 truncate flex-1">{selectedFile.name}</span>
                    <span className="text-xs text-gray-400">{(selectedFile.size / 1024).toFixed(0)}KB</span>
                    <button onClick={clearFile} className="text-gray-400 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-whatsapp hover:text-whatsapp transition-colors"
                  >
                    <Paperclip className="h-4 w-4" />
                    Choose file (image, video, audio, document)
                  </button>
                )}
              </div>
              {selectedFile && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={sendForm.type}
                    onChange={(e) => setSendForm((prev) => ({ ...prev, type: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                  >
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                    <option value="document">Document</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowSend(false); clearFile(); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button
                onClick={handleSend}
                disabled={isSending || isUploading}
                className="px-4 py-2 text-sm bg-whatsapp text-white rounded-lg hover:bg-whatsapp-dark disabled:opacity-50 flex items-center gap-2"
              >
                {isSending ? 'Sending...' : isUploading ? 'Uploading...' : <><Send className="h-4 w-4" /> Send</>}
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
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Recipient</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Message</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
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
                    {msg.mediaUrl ? (
                      <span className="flex items-center gap-1">
                        {getTypeIcon(msg.type)}
                        {msg.content || msg.type}
                      </span>
                    ) : msg.content}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 capitalize">
                      {getTypeIcon(msg.type)} {msg.type}
                    </span>
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
