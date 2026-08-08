'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Users, Plus, Trash2, Eye, EyeOff, Shield, UserCheck, UserX, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/use-auth';

interface UserItem {
  id: string;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'operator' });
  const [editForm, setEditForm] = useState({ email: '', role: '', isActive: true });
  const [showPassword, setShowPassword] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data, isLoading, mutate } = useApi<UserItem[]>('/api/v1/auth/users');

  const users = data?.data || [];

  function openEditModal(user: UserItem) {
    setEditUser(user);
    setEditForm({ email: user.email, role: user.role, isActive: user.isActive });
    setShowEdit(true);
  }

  async function handleCreate() {
    if (!form.username || !form.email || !form.password) {
      toast.error('All fields are required');
      return;
    }
    setIsCreating(true);
    try {
      await api.post('/api/v1/auth/users', form);
      toast.success('User created');
      setShowCreate(false);
      setForm({ username: '', email: '', password: '', role: 'operator' });
      mutate();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user';
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleEdit() {
    if (!editUser) return;
    setIsSaving(true);
    try {
      await api.put(`/api/v1/auth/users/${editUser.id}`, editForm);
      toast.success('User updated');
      setShowEdit(false);
      setEditUser(null);
      mutate();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await api.delete(`/api/v1/auth/users/${deleteId}`);
      toast.success('User deleted');
      setDeleteId(null);
      mutate();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete user';
      toast.error(message);
    }
  }

  async function handleToggleActive(userId: string, currentActive: boolean) {
    try {
      await api.put(`/api/v1/auth/users/${userId}`, { isActive: !currentActive });
      toast.success(currentActive ? 'User deactivated' : 'User activated');
      mutate();
    } catch {
      toast.error('Failed to update user');
    }
  }

  function getRoleBadge(role: string) {
    const colors: Record<string, string> = {
      admin: 'bg-red-100 text-red-800',
      operator: 'bg-blue-100 text-blue-800',
      viewer: 'bg-gray-100 text-gray-800',
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colors[role] || colors.viewer}`}>
        {role}
      </span>
    );
  }

  return (
    <DashboardLayout title="Users" subtitle="Manage user accounts">
      <div className="mb-6 flex justify-end">
        <button
          onClick={() => setShowCreate(true)}
          className="bg-whatsapp hover:bg-whatsapp-dark text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreate(false)}></div>
          <div className="relative bg-white rounded-xl shadow-xl p-4 sm:p-6 w-full max-w-md mx-4 animate-fade-in">
            <h3 className="text-lg font-semibold mb-4">Add New User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="Enter username"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="email@example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Enter password"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                >
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="px-4 py-2 text-sm bg-whatsapp text-white rounded-lg hover:bg-whatsapp-dark disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEdit && editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setShowEdit(false); setEditUser(null); }}></div>
          <div className="relative bg-white rounded-xl shadow-xl p-4 sm:p-6 w-full max-w-md mx-4 animate-fade-in">
            <h3 className="text-lg font-semibold mb-4">Edit User: {editUser.username}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={editUser.username}
                  disabled
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="email@example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                >
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={editForm.isActive ? 'active' : 'inactive'}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, isActive: e.target.value === 'active' }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-whatsapp outline-none"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowEdit(false); setEditUser(null); }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button
                onClick={handleEdit}
                disabled={isSaving}
                className="px-4 py-2 text-sm bg-whatsapp text-white rounded-lg hover:bg-whatsapp-dark disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
          <div className="h-12 bg-gray-100"></div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex border-b border-gray-100 p-4"><div className="h-4 bg-gray-200 rounded w-full"></div></div>
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-16 w-16" />}
          title="No users"
          description="Add your first user"
          action={<button onClick={() => setShowCreate(true)} className="bg-whatsapp hover:bg-whatsapp-dark text-white px-4 py-2 rounded-lg">Add User</button>}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Username</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Last Login</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-0">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      {u.username}
                      {u.id === currentUser?.id && (
                        <span className="text-xs text-gray-400">(you)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{u.email}</td>
                  <td className="px-6 py-4">{getRoleBadge(u.role)}</td>
                  <td className="px-6 py-4">
                    {u.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        <UserCheck className="h-3 w-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                        <UserX className="h-3 w-3" /> Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditModal(u)}
                        title="Edit"
                        className="p-1 text-gray-400 hover:text-blue-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(u.id, u.isActive)}
                        disabled={u.id === currentUser?.id}
                        title={u.isActive ? 'Deactivate' : 'Activate'}
                        className="p-1 text-gray-400 hover:text-yellow-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {u.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => setDeleteId(u.id)}
                        disabled={u.id === currentUser?.id}
                        title="Delete"
                        className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete User"
        message="Are you sure you want to delete this user? This action cannot be undone."
        confirmText="Delete"
      />
    </DashboardLayout>
  );
}
