"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";

import TabBar from "@/components/TabBar";
import { apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { getAccentOption } from "@/lib/preferences";
import type { AccentColor, Channel, Role, ThemePreference, UserSettings } from "@/lib/types";

interface CurrentUser {
  tg_id: number;
  full_name: string;
  role: Role;
  avatar_url: string | null;
  theme_preference: ThemePreference;
  accent_color: AccentColor;
  notifications_enabled: boolean;
}

interface AuthResponse {
  employee: CurrentUser;
  is_admin: boolean;
  channels: Channel[];
}
type ActiveTab = string | "admin" | "settings";

function SectionLoading() {
  return <div className="flex h-full items-center justify-center text-sm muted-text">Загружаем раздел…</div>;
}

const AdminPanel = dynamic(() => import("@/components/AdminPanel"), { loading: SectionLoading });
const ChannelView = dynamic(() => import("@/components/ChannelView"), { loading: SectionLoading });
const SettingsPanel = dynamic(() => import("@/components/SettingsPanel"), { loading: SectionLoading });

export default function HomePage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
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
        const params = new URLSearchParams(window.location.search);
        const requestedSection = params.get("section");
        const requestedChannelId = params.get("channel");
        const desktop = window.matchMedia("(min-width: 768px)").matches;
        setActiveTab(
          requestedSection === "admin" && authBody.is_admin
            ? "admin"
            : requestedChannelId && authBody.channels.some((channel) => channel.id === requestedChannelId)
              ? requestedChannelId
              : desktop
                ? authBody.channels[0]?.id ?? "settings"
                : ""
        );
        setStatus("ready");
      } catch (caughtError) {
        if (!cancelled) {
          setError(getErrorMessage(caughtError, "Не удалось открыть приложение."));
          setStatus("error");
        }
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  const refreshPendingRequestCount = useCallback(async () => {
    try {
      const body = await apiFetch<{ count: number }>("/api/admin/access-requests", { cache: "no-store" }, "Не удалось обновить число заявок.");
      setPendingRequestCount(Number(body.count) || 0);
    } catch { /* Фоновая проверка не должна перекрывать интерфейс. */ }
  }, []);

  useEffect(() => {
    if (!isAdmin || status !== "ready") return;
    const refresh = () => void refreshPendingRequestCount();
    refresh();
    const intervalId = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(intervalId); window.removeEventListener("focus", refresh); };
  }, [isAdmin, refreshPendingRequestCount, status]);

  const refreshChannels = useCallback(async () => {
    try {
      const body = await apiFetch<{ channels: Channel[] }>("/api/channels", { cache: "no-store" }, "Не удалось обновить ветки.");
      setChannels(body.channels);
      setActiveTab((current) => {
        if (current === "admin" || current === "settings" || current === "") return current;
        if (body.channels.some((channel) => channel.id === current)) return current;
        return window.matchMedia("(min-width: 768px)").matches ? body.channels[0]?.id ?? "settings" : "";
      });
    } catch { /* Сохраняем текущий экран при фоновом сбое. */ }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const accent = getAccentOption(currentUser.accent_color);
    root.style.setProperty("--accent", accent.color);
    root.style.setProperty("--accent-soft", accent.soft);
    root.style.setProperty("--accent-dark-soft", accent.darkSoft);
    const syncTheme = () => root.classList.toggle("dark", currentUser.theme_preference === "dark" || (currentUser.theme_preference === "system" && media.matches));
    syncTheme();
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, [currentUser]);

  if (status === "loading") return <main className="flex min-h-[var(--app-height)] items-center justify-center bg-[var(--messenger-bg)]"><div className="text-center"><motion.div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface)] text-2xl shadow-lg" animate={{ scale: [1, 1.04, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>💬</motion.div><p className="mt-4 text-sm muted-text">Проверяем доступ…</p></div></main>;
  if (status === "error") return <main className="flex min-h-[var(--app-height)] items-center justify-center bg-[var(--messenger-bg)] p-5"><motion.section initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="panel w-full max-w-md p-7 text-center"><div className="text-4xl">🔒</div><h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-slate-50">Форум Селан</h1><p className="mt-2 text-sm leading-6 muted-text">{error}</p></motion.section></main>;
  if (!currentUser) return null;

  const activeChannel = channels.find((channel) => channel.id === activeTab);
  const settings: UserSettings = {
    theme_preference: currentUser.theme_preference,
    accent_color: currentUser.accent_color,
    avatar_url: currentUser.avatar_url,
    notifications_enabled: currentUser.notifications_enabled
  };
  const hasDetail = Boolean(activeTab);

  return (
    <main className="mx-auto flex h-[var(--app-height)] w-full max-w-6xl overflow-hidden bg-[var(--messenger-bg)] shadow-2xl shadow-slate-900/10">
      <aside className={`${hasDetail ? "hidden" : "block"} h-full w-full shrink-0 border-r border-[var(--border)] md:block md:w-80 lg:w-96`}>
        <TabBar channels={channels} activeTab={activeTab} isAdmin={isAdmin} pendingRequestCount={pendingRequestCount} onChange={setActiveTab} />
      </aside>

      <section className={`${hasDetail ? "flex" : "hidden"} min-w-0 flex-1 flex-col md:flex`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={activeTab || "empty"} className="h-full min-h-0" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
            {activeTab === "settings" ? (
              <MobileSection title="Настройки" onBack={() => setActiveTab("")}><SettingsPanel user={currentUser} settings={settings} onChange={(updated) => setCurrentUser((user) => user ? { ...user, ...updated } : user)} /></MobileSection>
            ) : activeTab === "admin" && isAdmin ? (
              <MobileSection title="Админка" onBack={() => setActiveTab("")}><AdminPanel onPendingCountChange={setPendingRequestCount} onChannelsChanged={refreshChannels} /></MobileSection>
            ) : activeChannel ? (
              <ChannelView
                channel={activeChannel}
                isAdmin={isAdmin}
                currentUser={{
                  tg_id: currentUser.tg_id,
                  avatar_url: currentUser.avatar_url
                }}
                onBack={() => setActiveTab("")}
                onChannelActivity={refreshChannels}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm muted-text">Выберите ветку слева.</div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {isAdmin && pendingRequestCount > 0 && activeTab !== "admin" && (
          <motion.button type="button" className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left shadow-xl dark:border-amber-800 dark:bg-amber-950" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} onClick={() => setActiveTab("admin")} whileTap={{ scale: 0.97 }}>
            <span className="text-xl">📋</span><span className="flex-1 text-sm font-bold text-amber-950 dark:text-amber-50">Новых заявок: {pendingRequestCount}</span><span>→</span>
          </motion.button>
        )}
      </AnimatePresence>
    </main>
  );
}

function MobileSection({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col"><header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-3 md:hidden"><button type="button" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--surface-muted)]" onClick={onBack} aria-label="Назад"><ArrowLeft size={22} /></button><h2 className="font-bold text-slate-900 dark:text-slate-50">{title}</h2></header><div className="min-h-0 flex-1">{children}</div></div>;
}
