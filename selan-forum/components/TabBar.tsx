"use client";

import type { Channel } from "@/lib/types";

interface TabBarProps {
  channels: Channel[];
  activeTab: string;
  isAdmin: boolean;
  onChange: (tab: string) => void;
}

export default function TabBar({
  channels,
  activeTab,
  isAdmin,
  onChange
}: TabBarProps) {
  return (
    <nav
      className="shrink-0 overflow-x-auto border-b border-slate-200 bg-white"
      aria-label="Ветки форума"
    >
      <div className="flex min-w-max gap-1 px-3 py-2">
        {channels.map((channel) => (
          <button
            key={channel.id}
            type="button"
            onClick={() => onChange(channel.id)}
            className={`rounded-xl px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-brand-500 ${
              activeTab === channel.id
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            aria-current={activeTab === channel.id ? "page" : undefined}
          >
            <span aria-hidden="true">{channel.emoji ?? "💬"}</span>{" "}
            {channel.name}
          </button>
        ))}

        {isAdmin && (
          <button
            type="button"
            onClick={() => onChange("admin")}
            className={`rounded-xl px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-brand-500 ${
              activeTab === "admin"
                ? "bg-slate-800 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            aria-current={activeTab === "admin" ? "page" : undefined}
          >
            ⚙️ Админка
          </button>
        )}
      </div>
    </nav>
  );
}
