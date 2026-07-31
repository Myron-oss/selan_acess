"use client";

import { motion } from "framer-motion";

import type { Channel } from "@/lib/types";

interface TabBarProps {
  channels: Channel[];
  activeTab: string;
  isAdmin: boolean;
  pendingRequestCount: number;
  onChange: (tab: string) => void;
}

interface TabButtonProps {
  id: string;
  label: string;
  icon: string;
  badge?: number;
  activeTab: string;
  onChange: (tab: string) => void;
}

function TabButton({
  id,
  label,
  icon,
  badge = 0,
  activeTab,
  onChange
}: TabButtonProps) {
  const active = activeTab === id;

  return (
    <motion.button
      type="button"
      onClick={() => onChange(id)}
      whileTap={{ scale: 0.95 }}
      className={`relative isolate flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold outline-none transition-colors focus:ring-2 focus:ring-[var(--accent)] ${
        active
          ? "text-white"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {active && (
        <motion.span
          layoutId="active-forum-tab"
          className="absolute inset-0 -z-10 rounded-xl bg-[var(--accent)] shadow-sm"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {badge > 0 && (
        <span
          className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            active ? "bg-white text-red-600" : "bg-red-500 text-white"
          }`}
          aria-label={`Новых заявок: ${badge}`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </motion.button>
  );
}

export default function TabBar({
  channels,
  activeTab,
  isAdmin,
  pendingRequestCount,
  onChange
}: TabBarProps) {
  return (
    <nav
      className="z-10 shrink-0 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface)]"
      aria-label="Разделы форума"
    >
      <div className="flex min-w-max gap-1.5 px-3 py-2.5">
        {channels.map((channel) => (
          <TabButton
            key={channel.id}
            id={channel.id}
            label={channel.name}
            icon={channel.emoji ?? "💬"}
            activeTab={activeTab}
            onChange={onChange}
          />
        ))}

        <TabButton
          id="settings"
          label="Настройки"
          icon="⚙️"
          activeTab={activeTab}
          onChange={onChange}
        />

        {isAdmin && (
          <TabButton
            id="admin"
            label="Админка"
            icon="🛡️"
            badge={pendingRequestCount}
            activeTab={activeTab}
            onChange={onChange}
          />
        )}
      </div>
    </nav>
  );
}
