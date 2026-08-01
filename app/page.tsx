"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";

import Avatar from "@/components/Avatar";
import TabBar from "@/components/TabBar";
import { apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { getAccentOption } from "@/lib/preferences";
import type {
  AccentColor,
  Channel,
  Role,
  ThemePreference,
  UserSettings
} from "@/lib/types";

interface CurrentUser {
  tg_id: number;
  full_name: string;
  role: Role;
  avatar_url: string | null;
  theme_preference: ThemePreference;
  accent_color: AccentColor;
}

interface AuthResponse {
  employee: CurrentUser;
  is_admin: boolean;
  channels: Channel[];
}

type ActiveTab = string | "admin" | "settings";

function SectionLoading() {
  return (
    <div className="flex h-full items-center justify-center text-sm muted-text">
      Загружаем раздел…
    </div>
  );
}

const AdminPanel = dynamic(() => import("@/components/AdminPanel"), {
  loading: SectionLoading
});
const ChannelView = dynamic(() => import("@/components/ChannelView"), {
  loading: SectionLoading
});
const SettingsPanel = dynamic(() => import("@/components/SettingsPanel"), {
  loading: SectionLoading
});

export default function HomePage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const { default: WebApp } = await import("@twa-dev/sdk");
        WebApp.ready();
        WebApp.expand();

        if (!WebApp.initData) {
          throw new Error("Откройте приложение через меню Telegram-бота.");
        }

        const authBody = await apiFetch<AuthResponse>(
          "/api/auth/verify",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData: WebApp.initData })
          },
          "Не удалось подтвердить доступ."
        );

        if (cancelled) {
          return;
        }

        setCurrentUser(authBody.employee);
        setIsAdmin(authBody.is_admin);
        setChannels(authBody.channels);
        setActiveTab(authBody.channels[0]?.id ?? "settings");

        setStatus("ready");
      } catch (caughtError) {
        if (!cancelled) {
          setError(getErrorMessage(caughtError, "Не удалось открыть приложение."));
          setStatus("error");
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshPendingRequestCount = useCallback(async () => {
    try {
      const body = await apiFetch<{ count: number }>(
        "/api/admin/access-requests",
        { cache: "no-store" },
        "Не удалось обновить число заявок."
      );
      setPendingRequestCount(Number(body.count) || 0);
    } catch {
      // Фоновое обновление не должно перекрывать основной интерфейс.
    }
  }, []);

  useEffect(() => {
    if (!isAdmin || status !== "ready") {
      return;
    }

    const refresh = () => void refreshPendingRequestCount();
    refresh();
    const intervalId = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
    };
  }, [isAdmin, refreshPendingRequestCount, status]);

  const refreshChannels = useCallback(async () => {
    let body: { channels: Channel[] };
    try {
      body = await apiFetch<{ channels: Channel[] }>(
        "/api/channels",
        { cache: "no-store" },
        "Не удалось обновить ветки."
      );
    } catch {
      return;
    }

    setChannels(body.channels);
    setActiveTab((current) => {
      if (current === "admin" || current === "settings") {
        return current;
      }

      return body.channels.some((channel) => channel.id === current)
        ? current
        : body.channels[0]?.id ?? "settings";
    });
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const accent = getAccentOption(currentUser.accent_color);

    root.style.setProperty("--accent", accent.color);
    root.style.setProperty("--accent-soft", accent.soft);
    root.style.setProperty("--accent-dark-soft", accent.darkSoft);

    const syncTheme = () => {
      const shouldUseDark =
        currentUser.theme_preference === "dark" ||
        (currentUser.theme_preference === "system" && media.matches);
      root.classList.toggle("dark", shouldUseDark);
    };

    syncTheme();
    media.addEventListener("change", syncTheme);

    return () => {
      media.removeEventListener("change", syncTheme);
    };
  }, [currentUser]);

  function updateSettings(settings: UserSettings) {
    setCurrentUser((user) => (user ? { ...user, ...settings } : user));
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-[var(--app-height)] items-center justify-center bg-[var(--messenger-bg)] p-6">
        <div className="text-center">
          <motion.div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface)] shadow-lg"
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          >
            <span className="text-2xl" aria-hidden="true">
              💬
            </span>
          </motion.div>
          <p className="mt-4 text-sm muted-text">Проверяем доступ…</p>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-[var(--app-height)] items-center justify-center bg-[var(--messenger-bg)] p-5">
        <motion.section
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="panel w-full max-w-md p-7 text-center"
        >
          <div className="text-4xl" aria-hidden="true">
            🔒
          </div>
          <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-slate-50">
            Форум Селан
          </h1>
          <p className="mt-2 text-sm leading-6 muted-text">{error}</p>
        </motion.section>
      </main>
    );
  }

  if (!currentUser) {
    return null;
  }

  const activeChannel = channels.find((channel) => channel.id === activeTab);
  const settings: UserSettings = {
    theme_preference: currentUser.theme_preference,
    accent_color: currentUser.accent_color,
    avatar_url: currentUser.avatar_url
  };

  return (
    <main className="mx-auto flex h-[var(--app-height)] w-full max-w-3xl flex-col overflow-hidden bg-[var(--messenger-bg)] shadow-2xl shadow-slate-900/10">
      <header className="z-20 shrink-0 border-b border-[var(--border)] bg-[var(--surface)] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-lg text-white shadow-md shadow-slate-900/10">
              💬
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-bold leading-tight text-slate-900 dark:text-slate-50">
                Форум Селан
              </h1>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs muted-text">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {currentUser.full_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className="rounded-full outline-none focus:ring-2 focus:ring-[var(--accent)]"
            aria-label="Открыть настройки"
          >
            <Avatar
              name={currentUser.full_name}
              tgId={currentUser.tg_id}
              url={currentUser.avatar_url}
              size="md"
            />
          </button>
        </div>
      </header>

      <TabBar
        channels={channels}
        activeTab={activeTab}
        isAdmin={isAdmin}
        pendingRequestCount={pendingRequestCount}
        onChange={setActiveTab}
      />

      <AnimatePresence>
        {isAdmin && pendingRequestCount > 0 && activeTab !== "admin" && (
          <motion.button
            type="button"
            className="fixed left-1/2 top-[max(5.5rem,calc(env(safe-area-inset-top)+5rem))] z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left shadow-xl shadow-slate-900/15 dark:border-amber-800 dark:bg-amber-950"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={() => setActiveTab("admin")}
            whileTap={{ scale: 0.97 }}
            aria-live="polite"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-lg text-white"
              aria-hidden="true"
            >
              📋
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-amber-950 dark:text-amber-50">
                {pendingRequestCount === 1
                  ? "Новая заявка на доступ"
                  : `Новых заявок: ${pendingRequestCount}`}
              </span>
              <span className="mt-0.5 block text-xs text-amber-800 dark:text-amber-200">
                Нажмите, чтобы открыть заявки сотрудников
              </span>
            </span>
            <span className="text-amber-700 dark:text-amber-300" aria-hidden="true">
              →
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0"
          >
            {activeTab === "settings" ? (
              <SettingsPanel
                user={currentUser}
                settings={settings}
                onChange={updateSettings}
              />
            ) : activeTab === "admin" && isAdmin ? (
              <AdminPanel
                onPendingCountChange={setPendingRequestCount}
                onChannelsChanged={refreshChannels}
              />
            ) : activeChannel ? (
              <ChannelView
                channel={activeChannel}
                isAdmin={isAdmin}
                currentUser={{
                  tg_id: currentUser.tg_id,
                  avatar_url: currentUser.avatar_url
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm muted-text">
                Для вашей роли пока нет доступных веток.
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}
