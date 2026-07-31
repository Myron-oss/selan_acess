"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

import Avatar from "@/components/Avatar";
import { apiFetch } from "@/lib/apiClient";
import { MAX_AVATAR_BYTES } from "@/lib/attachments";
import { getErrorMessage } from "@/lib/errors";
import {
  ACCENT_OPTIONS,
  getAccentOption
} from "@/lib/preferences";
import type {
  AccentColor,
  ThemePreference,
  UserSettings
} from "@/lib/types";

interface SettingsPanelProps {
  user: {
    tg_id: number;
    full_name: string;
  };
  settings: UserSettings;
  onChange: (settings: UserSettings) => void;
}

const THEME_OPTIONS: Array<{
  id: ThemePreference;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "light",
    label: "Светлая",
    icon: "☀️",
    description: "Всегда светлый интерфейс"
  },
  {
    id: "dark",
    label: "Тёмная",
    icon: "🌙",
    description: "Комфортно при слабом освещении"
  },
  {
    id: "system",
    label: "Системная",
    icon: "📱",
    description: "Как в настройках устройства"
  }
];

export default function SettingsPanel({
  user,
  settings,
  onChange
}: SettingsPanelProps) {
  const [current, setCurrent] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrent(settings);
  }, [settings]);

  async function savePatch(patch: Partial<UserSettings>) {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const body = await apiFetch<{ settings: UserSettings }>(
        "/api/settings",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch)
        },
        "Не удалось сохранить настройки."
      );

      setCurrent(body.settings);
      onChange(body.settings);
      setMessage("Настройки сохранены");
    } catch (caughtError) {
      setError(
        getErrorMessage(caughtError, "Не удалось сохранить настройки.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Выберите файл изображения.");
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setError("Размер изображения не должен превышать 4 МБ.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const body = await apiFetch<{ avatar_url: string }>(
        "/api/upload-avatar",
        { method: "POST", body: formData },
        "Не удалось загрузить аватарку."
      );

      const nextSettings = { ...current, avatar_url: body.avatar_url };
      setCurrent(nextSettings);
      onChange(nextSettings);
      setMessage("Аватарка обновлена");
    } catch (caughtError) {
      setError(
        getErrorMessage(caughtError, "Не удалось загрузить аватарку.")
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="h-full overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
      <div className="mx-auto max-w-xl space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Персонализация
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">
            Настройки
          </h2>
          <p className="mt-1 text-sm muted-text">
            Оформление сохраняется в профиле и доступно на всех устройствах.
          </p>
        </div>

        <div className="panel flex items-center gap-4 p-4">
          <Avatar
            name={user.full_name}
            tgId={user.tg_id}
            url={current.avatar_url}
            size="xl"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900 dark:text-slate-50">
              {user.full_name}
            </p>
            <p className="mt-0.5 text-xs muted-text">
              PNG, JPG, WebP или другое изображение до 4 МБ
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <motion.button
                type="button"
                className="primary-button min-h-9 px-3 py-1.5 text-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                whileTap={{ scale: 0.95 }}
              >
                {uploading ? "Загружаем…" : "Сменить фото"}
              </motion.button>
              {current.avatar_url && (
                <motion.button
                  type="button"
                  className="secondary-button min-h-9 px-3 py-1.5 text-sm"
                  onClick={() => void savePatch({ avatar_url: null })}
                  disabled={saving || uploading}
                  whileTap={{ scale: 0.95 }}
                >
                  Удалить
                </motion.button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => void uploadAvatar(event)}
            />
          </div>
        </div>

        <div className="panel p-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-50">
            Тема интерфейса
          </h3>
          <div className="mt-3 grid gap-2">
            {THEME_OPTIONS.map((option) => {
              const active = current.theme_preference === option.id;

              return (
                <motion.button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    void savePatch({ theme_preference: option.id })
                  }
                  disabled={saving}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] dark:bg-[var(--accent-dark-soft)]"
                      : "border-[var(--border)] bg-[var(--surface-muted)] hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  <span className="text-xl" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {option.label}
                    </span>
                    <span className="block text-xs muted-text">
                      {option.description}
                    </span>
                  </span>
                  <span
                    className={`h-5 w-5 rounded-full border-2 ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)] shadow-[inset_0_0_0_4px_white] dark:shadow-[inset_0_0_0_4px_#17212b]"
                        : "border-slate-300 dark:border-slate-600"
                    }`}
                    aria-hidden="true"
                  />
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="panel p-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-50">
            Акцентный цвет
          </h3>
          <p className="mt-1 text-xs muted-text">
            Используется для ваших сообщений и активных элементов.
          </p>
          <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-7">
            {ACCENT_OPTIONS.map((option) => {
              const active = current.accent_color === option.id;

              return (
                <motion.button
                  key={option.id}
                  type="button"
                  onClick={() => void savePatch({ accent_color: option.id })}
                  disabled={saving}
                  whileTap={{ scale: 0.9 }}
                  className="flex flex-col items-center gap-1.5 rounded-xl p-1 outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  aria-label={option.label}
                  title={option.label}
                >
                  <span
                    className={`h-10 w-10 rounded-full border-4 transition-transform ${
                      active
                        ? "scale-110 border-white shadow-[0_0_0_2px_var(--accent)] dark:border-slate-800"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: option.color }}
                  />
                  <span
                    className={`text-[10px] ${
                      active ? "font-semibold text-[var(--accent)]" : "muted-text"
                    }`}
                  >
                    {option.label}
                  </span>
                </motion.button>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl bg-[var(--messenger-bg)] p-3">
            <div
              className="ml-auto max-w-[82%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm text-white shadow-sm"
              style={{
                backgroundColor: getAccentOption(current.accent_color).color
              }}
            >
              Так будут выглядеть ваши сообщения
              <span className="ml-2 text-[10px] text-white/70">12:45</span>
            </div>
          </div>
        </div>

        {(message || error) && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl px-3 py-2 text-center text-sm ${
              error
                ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
            }`}
          >
            {error || message}
          </motion.p>
        )}
      </div>
    </section>
  );
}
