"use client";

import { useEffect, useState } from "react";

import AdminPanel from "@/components/AdminPanel";
import ChannelView from "@/components/ChannelView";
import TabBar from "@/components/TabBar";
import type { Channel, Role } from "@/lib/types";

interface AuthResponse {
  employee: {
    full_name: string;
    role: Role;
  };
  is_admin: boolean;
}

type ActiveTab = string | "admin";

export default function HomePage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const { default: WebApp } = await import("@twa-dev/sdk");

        // The npm SDK exposes the same window.Telegram.WebApp object.
        WebApp.ready();
        WebApp.expand();

        if (!WebApp.initData) {
          throw new Error("Откройте приложение через меню Telegram-бота.");
        }

        const authResponse = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: WebApp.initData })
        });
        const authBody = (await authResponse.json()) as
          | AuthResponse
          | { error?: string };

        if (!authResponse.ok) {
          throw new Error(
            "error" in authBody && authBody.error
              ? authBody.error
              : "Не удалось подтвердить доступ."
          );
        }

        const channelResponse = await fetch("/api/channels", {
          cache: "no-store"
        });
        const channelBody = (await channelResponse.json()) as
          | { channels: Channel[] }
          | { error?: string };

        if (!channelResponse.ok || !("channels" in channelBody)) {
          throw new Error(
            "error" in channelBody && channelBody.error
              ? channelBody.error
              : "Не удалось загрузить ветки."
          );
        }

        if (cancelled) {
          return;
        }

        const authenticated = authBody as AuthResponse;
        setEmployeeName(authenticated.employee.full_name);
        setIsAdmin(authenticated.is_admin);
        setChannels(channelBody.channels);
        setActiveTab(
          channelBody.channels[0]?.id ??
            (authenticated.is_admin ? "admin" : "")
        );
        setStatus("ready");
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Не удалось открыть приложение."
          );
          setStatus("error");
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return (
      <main className="flex min-h-[var(--app-height)] items-center justify-center p-6">
        <div className="text-center">
          <div
            className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600"
            aria-hidden="true"
          />
          <p className="mt-4 text-sm text-slate-600">Проверяем доступ…</p>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-[var(--app-height)] items-center justify-center p-5">
        <section className="panel w-full max-w-md p-6 text-center">
          <div className="text-4xl" aria-hidden="true">
            🔒
          </div>
          <h1 className="mt-3 text-xl font-semibold">Форум Селан</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
        </section>
      </main>
    );
  }

  const activeChannel = channels.find((channel) => channel.id === activeTab);

  return (
    <main className="mx-auto flex h-[var(--app-height)] w-full max-w-3xl flex-col overflow-hidden bg-[#f7faf8]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold leading-tight">Форум Селан</h1>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {employeeName}
            </p>
          </div>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            В сети
          </span>
        </div>
      </header>

      <TabBar
        channels={channels}
        activeTab={activeTab}
        isAdmin={isAdmin}
        onChange={setActiveTab}
      />

      <div className="min-h-0 flex-1">
        {activeTab === "admin" && isAdmin ? (
          <AdminPanel />
        ) : activeChannel ? (
          <ChannelView key={activeChannel.id} channel={activeChannel} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
            Для вашей роли пока нет доступных веток.
          </div>
        )}
      </div>
    </main>
  );
}
