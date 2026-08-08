'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Users, Plus, Search, Trash2, UserPlus, Send } from 'lucide-react';
import toast from 'react-hot-toast';

interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
  email: string | null;
  tags: string | null;
  createdAt: string;
}

interface Device {
  id: string;
  name: string;
  status: string;
}

export default function ContactsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phoneNumber: '', email: '' });
  const [isCreating, setIsCreating] = useState(false);

  const [showSend, setShowSend] = useState(false);
  const [sendForm, setSendForm] = useState({ deviceId: '', recipient: '', content: '' });
  const [isSending, setIsSending] = useState(false);

  const queryParams = new URLSearchParams({ page: String(page), limit: '20' });
  if (search) queryParams.set('search', search);

  const { data, isLoading, mutate } = useApi<Contact[]>(`/api/v1/contacts?${queryParams}`);
  const { data: deviceData } = useApi<Device[]>('/api/v1/devices');

  const contacts = data?.data || [];
  const pagination = data?.pagination;
  const devices = deviceData?.data || [];

  function openSendModal(contact: Contact) {
    const connectedDevice = devices.find((d) => d.status === 'connected');
    setSendForm({
      deviceId: connectedDevice?.id || '',
      recipient: contact.phoneNumber,
      content: '',
    });
    setShowSend(true);
  }

  async function handleCreate() {
    if (!form.name || !form.phoneNumber) {
      toast.error('Name and phone number are required');
      return;
    }
    setIsCreating(true);
    try {
      await api.post('/api/v1/contacts', form);
      toast.success('Contact created');
      setShowCreate(false);
      setForm({ name: '', phoneNumber: '', email: '' });
      mutate();
    } catch {
      toast.error('Failed to create contact');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await api.delete(`/api/v1/contacts/${deleteId}`);
      toast.success('Contact deleted');
      setDeleteId(null);
      mutate();
    } catch {
      toast.error('Failed to delete contact');
    }
  }

  async function handleSend() {
    if (!sendForm.deviceId || !sendForm.recipient || !sendForm.content) {
      toast.error('Please fill all required fields');
      return;
    }
    setIsSending(true);
    try {
      await api.post('/api/v1/messages/send', {
        ...sendForm,
        type: 'text',
      });
      toast.success('Message sent');
      setShowSend(false);
      setSendForm({ deviceId: '', recipient: '', content: '' });
    } catch {
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <DashboardLayout title="Contacts" subtitle="Manage your contact list">
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search contacts..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp focus:border-transparent outline-none"
          />
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-whatsapp hover:bg-whatsapp-dark text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Add Contact
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreate(false)}></div>
          <div className="relative bg-white rounded-xl shadow-xl p-4 sm:p-6 w-full max-w-md mx-4 animate-fade-in">
            <h3 className="text-lg font-semibold mb-4">New Contact</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Contact name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={form.phoneNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                  placeholder="628xxx"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="email@example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="px-4 py-2 text-sm bg-whatsapp text-white rounded-lg hover:bg-whatsapp-dark disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowSend(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
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
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={<Users className="h-16 w-16" />}
          title="No contacts"
          description="Add your first contact"
          action={<button onClick={() => setShowCreate(true)} className="bg-whatsapp hover:bg-whatsapp-dark text-white px-4 py-2 rounded-lg">Add Contact</button>}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-0">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{contact.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{contact.phoneNumber}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{contact.email || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(contact.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openSendModal(contact)}
                        title="Send message"
                        className="p-1 text-gray-400 hover:text-whatsapp"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDeleteId(contact.id)} title="Delete" className="p-1 text-gray-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
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

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Contact"
        message="Are you sure you want to delete this contact?"
        confirmText="Delete"
      />
    </DashboardLayout>
  );
}
