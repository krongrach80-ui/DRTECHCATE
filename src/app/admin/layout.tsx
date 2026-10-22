'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Shield,
  Users,
  UserCheck,
  Dumbbell,
  Calendar,
  Lock,
  LogOut,
  Menu,
  X,
  Activity,
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { name: 'ภาพรวมระบบ', href: '/admin', icon: Activity },
  { name: 'จัดการผู้ใช้', href: '/admin/users', icon: Users },
  { name: 'รายชื่อนักกายภาพ (PT)', href: '/admin/pts', icon: UserCheck },
  { name: 'คลังท่าฝึก & มินิเกม', href: '/admin/exercises', icon: Dumbbell },
  { name: 'ตารางนัด & จ่ายคอร์ส', href: '/admin/schedule', icon: Calendar },
  { name: 'ความปลอดภัย & Audit Logs', href: '/admin/security', icon: Lock },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 py-3 flex items-center justify-between z-30 sticky top-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-sky-500/10 border border-sky-500/20 rounded-lg">
            <Shield className="w-5 h-5 text-sky-400" />
          </div>
          <span className="font-bold text-white text-sm">PT Hospital Admin</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed md:sticky top-0 left-0 h-screen w-72 bg-slate-900/90 border-r border-slate-800 flex flex-col justify-between p-5 z-40 transition-transform duration-200 backdrop-blur-xl ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div>
          {/* Logo & System Brand */}
          <div className="flex items-center gap-3 px-2 py-3 mb-6 border-b border-slate-800/80">
            <div className="p-2.5 bg-gradient-to-br from-sky-500/20 to-blue-600/20 border border-sky-500/30 rounded-xl shadow-inner">
              <Shield className="w-6 h-6 text-sky-400" />
            </div>
            <div>
              <div className="font-bold text-white text-base leading-tight">Super Admin</div>
              <div className="text-xs text-sky-400 font-medium">แผนกกายภาพบำบัด</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer info & Logout */}
        <div className="pt-4 border-t border-slate-800/80 space-y-3">
          <div className="px-3 py-2 bg-slate-950/50 rounded-xl border border-slate-800/60">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>RLS Protected & Audited</span>
            </div>
          </div>

          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 px-3.5 py-2.5 rounded-xl transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>ออกจากระบบ</span>
            </button>
          </form>
        </div>
      </aside>

      {/* Main Page Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
