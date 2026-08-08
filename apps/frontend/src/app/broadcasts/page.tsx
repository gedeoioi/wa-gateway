'use client';

import { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { connectSocket } from '@/lib/socket';
import { Send, Plus, Play, XCircle, Trash2, Loader2, Paperclip, X, Image, FileText, Film, Music } from 'lucide-react';
import toast from 'react-hot-toast';

interface Broadcast {
  id: string;
  name: string;
  deviceId: string;
  message: string;
  type: string;
  mediaUrl: string | null;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  device: { id: string; name: string; status?: string };
}

interface Device {
  id: string;
  name: string;
  status: string;
}

function getTypeIcon(type: string) {
  if (type === 'image') return <Image className="h-4 w-4 text-blue-500" />;
  if (type === 'video') return <Film className="h-4 w-4 text-purple-500" />;
  if (type === 'audio') return <Music className="h-4 w-4 text-green-500" />;
  if (type === 'document') return <FileText className="h-4 w-4 text-gray-500" />;
  return <Send className="h-4 w-4 text-gray-400" />;
}

export default function BroadcastsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, mutate } = useApi<Broadcast[]>(`/api/v1/broadcasts?page=${page}&limit=20`);
  const { data: deviceData, mutate: mutateDevices } = useApi<Device[]>('/api/v1/devices');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    deviceId: '',
    name: '',
    message: '',
    recipients: '',
    type: 'text',
    mediaUrl: '',
    delayBetweenMessages: 2000,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, { sent: number; failed: number; total: number }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const broadcasts = data?.data || [];
  const pagination = data?.pagination;
  const devices = deviceData?.data || [];

  useEffect(() => {
    const socket = connectSocket();
    socket.on('device:status', () => { mutateDevices(); });
    socket.on('broadcast:progress', (d: { broadcastId: string; sent: number; failed: number; total: number }) => {
      setProgress((prev) => ({ ...prev, [d.broadcastId]: { sent: d.sent, failed: d.failed, total: d.total } }));
    });
    socket.on('broadcast:completed', () => { toast.success('Broadcast completed'); mutate(); });
    return () => {
      socket.off('device:status');
      socket.off('broadcast:progress');
      socket.off('broadcast:completed');
    };
  }, [mutate, mutateDevices]);

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
    setForm((prev) => ({ ...prev, type: getMediaType(file.type) }));
  }

  async function handleUpload(): Promise<string | null> {
    if (!selectedFile) return null;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
      const res = await fetch(`${API_BASE}/api/v1/upload`, {
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
    setForm((prev) => ({ ...prev, type: 'text', mediaUrl: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleCreate() {
    const recipients = form.recipients.split('\n').map((r) => r.trim()).filter(Boolean);
    if (!form.deviceId || !form.name || !form.message || recipients.length === 0) {
      toast.error('Please fill all required fields');
      return;
    }
    setIsCreating(true);
    try {
      let mediaUrl = form.mediaUrl;
      if (selectedFile) {
        mediaUrl = await handleUpload() || '';
        if (!mediaUrl && selectedFile) { setIsCreating(false); return; }
      }
      await api.post('/api/v1/broadcasts', { ...form, mediaUrl: mediaUrl || undefined, recipients });
      toast.success('Broadcast created');
      setShowCreate(false);
      setForm({ deviceId: '', name: '', message: '', recipients: '', type: 'text', mediaUrl: '', delayBetweenMessages: 2000 });
      setSelectedFile(null);
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create broadcast');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleStart(id: string) {
    setStartingId(id);
    try {
      await api.post(`/api/v1/broadcasts/${id}/start`);
      toast.success('Broadcast started');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start broadcast', { duration: 5000 });
    } finally {
      setStartingId(null);
    }
  }

  async function handleCancel(id: string) {
    try {
      await api.post(`/api/v1/broadcasts/${id}/cancel`);
      toast.success('Broadcast cancelled');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel');
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/v1/broadcasts/${id}`);
      toast.success('Broadcast deleted');
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <DashboardLayout title="Broadcasts" subtitle="Send messages to multiple recipients">
      <div className="mb-6 flex justify-between items-center">
        <p className="text-sm text-gray-500">{broadcasts.length} broadcast(s)</p>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-whatsapp hover:bg-whatsapp-dark text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Broadcast
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreate(false)}></div>
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-lg animate-fade-in">
            <h3 className="text-lg font-semibold mb-4">New Broadcast</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Device</label>
                <select
                  value={form.deviceId}
                  onChange={(e) => setForm((prev) => ({ ...prev, deviceId: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                >
                  <option value="">Select device</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.status})</option>
                  ))}
                </select>
                {form.deviceId && devices.find((d) => d.id === form.deviceId)?.status !== 'connected' && (
                  <p className="text-xs text-amber-600 mt-1">This device is not connected. Connect it first.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Broadcast Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Campaign name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                  placeholder="Type your broadcast message..."
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
                    {getTypeIcon(form.type)}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Media Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                  >
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                    <option value="document">Document</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipients (one per line)</label>
                <textarea
                  value={form.recipients}
                  onChange={(e) => setForm((prev) => ({ ...prev, recipients: e.target.value }))}
                  placeholder={"628123456789\n628987654321"}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delay between messages (ms)</label>
                <input
                  type="number"
                  value={form.delayBetweenMessages}
                  onChange={(e) => setForm((prev) => ({ ...prev, delayBetweenMessages: parseInt(e.target.value) || 2000 }))}
                  min={1000}
                  max={30000}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowCreate(false); clearFile(); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={isCreating || isUploading}
                className="px-4 py-2 text-sm bg-whatsapp text-white rounded-lg hover:bg-whatsapp-dark disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : isUploading ? 'Uploading...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : broadcasts.length === 0 ? (
        <EmptyState
          icon={<Send className="h-16 w-16" />}
          title="No broadcasts"
          description="Create your first broadcast campaign"
          action={<button onClick={() => setShowCreate(true)} className="bg-whatsapp hover:bg-whatsapp-dark text-white px-4 py-2 rounded-lg">New Broadcast</button>}
        />
      ) : (
        <div className="space-y-4">
          {broadcasts.map((bc) => {
            const liveProgress = progress[bc.id];
            const sent = liveProgress?.sent ?? bc.sentCount;
            const failed = liveProgress?.failed ?? bc.failedCount;
            const total = liveProgress?.total ?? bc.totalRecipients;
            const percent = total > 0 ? ((sent + failed) / total) * 100 : 0;
            const isStarting = startingId === bc.id;

            return (
              <div key={bc.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      {bc.type !== 'text' && getTypeIcon(bc.type)}
                      {bc.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">Device: {bc.device.name}</p>
                  </div>
                  <StatusBadge status={bc.status} />
                </div>
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{bc.message}</p>
                {bc.mediaUrl && (
                  <p className="text-xs text-gray-400 mb-3 truncate">Attachment: {bc.mediaUrl}</p>
                )}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{sent} sent / {failed} failed / {total} total</span>
                    <span>{Math.round(percent)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-whatsapp h-2 rounded-full transition-all duration-500" style={{ width: `${percent}%` }}></div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {(bc.status === 'draft' || bc.status === 'scheduled') && (
                    <button
                      onClick={() => handleStart(bc.id)}
                      disabled={isStarting}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-green-600 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-50"
                    >
                      {isStarting ? <><Loader2 className="h-3 w-3 animate-spin" /> Starting...</> : <><Play className="h-3 w-3" /> Start</>}
                    </button>
                  )}
                  {bc.status === 'sending' && (
                    <button onClick={() => handleCancel(bc.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-yellow-600 bg-yellow-50 rounded-lg hover:bg-yellow-100">
                      <XCircle className="h-3 w-3" /> Cancel
                    </button>
                  )}
                  {bc.status !== 'sending' && (
                    <button onClick={() => handleDelete(bc.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded-lg hover:bg-red-100">
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {pagination && (
            <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
