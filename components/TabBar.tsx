"use client";

import { motion } from "framer-motion";
import { Settings, ShieldCheck } from "lucide-react";

import type { Channel } from "@/lib/types";

interface TabBarProps {
  channels: Channel[];
  activeTab: string;
  isAdmin: boolean;
  pendingRequestCount: number;
  onChange: (tab: string) => void;
}

const timeFormatter = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" });

function activityTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString() ? timeFormatter.format(date) : dateFormatter.format(date);
}

export default function TabBar({ channels, activeTab, isAdmin, pendingRequestCount, onChange }: TabBarProps) {
  return (
    <nav className="flex h-full min-h-0 flex-col bg-[var(--surface)]" aria-label="Разделы форума">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Ветки</p>
        <h2 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-slate-50">Форум Селан</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {channels.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm muted-text">Вам пока не назначены ветки.</div>
        ) : channels.map((channel) => {
          const active = activeTab === channel.id;
          return (
            <motion.button key={channel.id} type="button" onClick={() => onChange(channel.id)} whileTap={{ scale: 0.985 }} className={`relative mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors focus:ring-2 focus:ring-[var(--accent)] ${active ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-dark-soft)]" : "hover:bg-[var(--surface-muted)]"}`} aria-current={active ? "page" : undefined}>
              {active && <motion.span layoutId="active-channel-sidebar" className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-[var(--accent)]" />}
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-xl">{channel.emoji ?? "💬"}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">{channel.name}</span><time className="shrink-0 text-[10px] muted-text">{activityTime(channel.last_message_at)}</time></span>
                <span className="mt-0.5 block truncate text-xs muted-text">{channel.last_message_preview || `${channel.participant_count} участников`}</span>
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="border-t border-[var(--border)] p-2">
        <SidebarButton id="settings" label="Настройки" activeTab={activeTab} onChange={onChange} icon={<Settings size={20} />} />
        {isAdmin && <SidebarButton id="admin" label="Админка" activeTab={activeTab} onChange={onChange} icon={<ShieldCheck size={20} />} badge={pendingRequestCount} />}
      </div>
    </nav>
  );
}

function SidebarButton({ id, label, icon, badge = 0, activeTab, onChange }: { id: string; label: string; icon: React.ReactNode; badge?: number; activeTab: string; onChange: (tab: string) => void }) {
  const active = activeTab === id;
  return (
    <motion.button type="button" onClick={() => onChange(id)} whileTap={{ scale: 0.97 }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)] ${active ? "bg-[var(--accent)] text-white" : "text-slate-700 hover:bg-[var(--surface-muted)] dark:text-slate-200"}`}>
      {icon}<span className="flex-1 text-left">{label}</span>{badge > 0 && <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white text-red-600" : "bg-red-500 text-white"}`}>{badge > 99 ? "99+" : badge}</span>}
    </motion.button>
  );
}
