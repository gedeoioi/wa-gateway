'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  LayoutDashboard,
  Smartphone,
  MessageSquare,
  Send,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/devices', label: 'Devices', icon: Smartphone },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/broadcasts', label: 'Broadcasts', icon: Send },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/users', label: 'Users', icon: UserPlus, adminOnly: true },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const filteredNavItems = navItems.filter((item) => {
    if ('adminOnly' in item && item.adminOnly) {
      return user?.role === 'admin';
    }
    return true;
  });

  return (
    <aside
      className={`${
        collapsed ? 'w-20' : 'w-64'
      } bg-gray-900 text-white min-h-screen flex flex-col transition-all duration-300`}
    >
      <div className="p-4 flex items-center justify-between border-b border-gray-800">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="bg-whatsapp p-2 rounded-lg">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">WA Gateway</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {filteredNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-whatsapp text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        {!collapsed && user && (
          <div className="mb-3 px-3">
            <p className="text-sm font-medium text-white">{user.username}</p>
            <p className="text-xs text-gray-400">{user.role}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 w-full transition-colors"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
