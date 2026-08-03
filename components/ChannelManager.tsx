"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import type { AdminChannel } from "@/lib/types";

interface ChannelManagerProps {
  onChannelsChanged: () => void | Promise<void>;
}

interface ChannelCardProps {
  channel: AdminChannel;
  onUpdated: (channel: AdminChannel) => void;
  onDeleted: (channelId: string) => void;
  onChannelsChanged: () => void | Promise<void>;
}

function ChannelCard({
  channel,
  onUpdated,
  onDeleted,
  onChannelsChanged
}: ChannelCardProps) {
  const [name, setName] = useState(channel.name);
  const [emoji, setEmoji] = useState(channel.emoji ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(channel.name);
    setEmoji(channel.emoji ?? "");
  }, [channel]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = await apiFetch<{ channel: AdminChannel }>(
        `/api/admin/channels/${channel.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, emoji })
        },
        "Не удалось сохранить ветку."
      );
      onUpdated(body.channel);
      await onChannelsChanged();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Не удалось сохранить ветку."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError("");
    try {
      await apiFetch<{ success: true }>(
        `/api/admin/channels/${channel.id}`,
        { method: "DELETE" },
        "Не удалось удалить ветку."
      );
      onDeleted(channel.id);
      setConfirmingDelete(false);
      await onChannelsChanged();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Не удалось удалить ветку."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.article layout className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <div className="grid grid-cols-[72px_1fr] gap-3">
        <label>
          <span className="mb-1 block text-xs font-medium muted-text">Эмодзи</span>
          <input className="field text-center text-xl" value={emoji} onChange={(event) => setEmoji(event.target.value)} maxLength={16} placeholder="💬" disabled={saving} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium muted-text">Название</span>
          <input className="field" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} disabled={saving} />
        </label>
      </div>
      <p className="mt-2 text-xs muted-text">Доступ к ветке назначается отдельно каждому сотруднику.</p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <motion.button type="button" className="primary-button flex-1" onClick={() => void save()} disabled={saving || !name.trim()} whileTap={{ scale: 0.95 }}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </motion.button>
        <motion.button type="button" className="secondary-button border-red-200 text-red-700 dark:border-red-900 dark:text-red-300" onClick={() => setConfirmingDelete(true)} disabled={saving} whileTap={{ scale: 0.95 }}>
          Удалить
        </motion.button>
      </div>

      <AnimatePresence>
        {confirmingDelete && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-labelledby={`delete-channel-${channel.id}`}>
            <motion.div className="panel w-full max-w-sm p-5" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.18 }}>
              <div className="text-3xl" aria-hidden="true">⚠️</div>
              <h4 id={`delete-channel-${channel.id}`} className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-50">Удалить ветку «{channel.name}»?</h4>
              <p className="mt-2 text-sm leading-6 muted-text">Все сообщения, опросы и настройки доступа в этой ветке будут удалены без возможности восстановления.</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" className="secondary-button" onClick={() => setConfirmingDelete(false)} disabled={saving}>Отмена</button>
                <motion.button type="button" className="primary-button !bg-red-600" onClick={() => void remove()} disabled={saving} whileTap={{ scale: 0.95 }}>{saving ? "Удаляем…" : "Удалить"}</motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export default function ChannelManager({ onChannelsChanged }: ChannelManagerProps) {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("💬");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadChannels = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const body = await apiFetch<{ channels: AdminChannel[] }>("/api/admin/channels", { cache: "no-store" }, "Не удалось загрузить ветки.");
      setChannels(body.channels);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Не удалось загрузить ветки."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadChannels(); }, [loadChannels]);

  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const body = await apiFetch<{ channel: AdminChannel }>(
        "/api/admin/channels",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, emoji }) },
        "Не удалось создать ветку."
      );
      setChannels((current) => [...current, body.channel].sort((left, right) => left.name.localeCompare(right.name, "ru")));
      setName("");
      setEmoji("💬");
      setShowCreateForm(false);
      await onChannelsChanged();
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Не удалось создать ветку."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-50">📂 Управление ветками</h3>
          <p className="mt-0.5 text-xs muted-text">Создавайте и переименовывайте ветки. Доступ настраивается у сотрудников.</p>
        </div>
        <motion.button type="button" className="secondary-button shrink-0" onClick={() => setShowCreateForm((current) => !current)} whileTap={{ scale: 0.95 }}>{showCreateForm ? "Закрыть" : "+ Ветка"}</motion.button>
      </div>
      <div className="p-4">
        <AnimatePresence initial={false}>
          {showCreateForm && (
            <motion.form onSubmit={createChannel} className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <h4 className="font-semibold text-slate-900 dark:text-slate-50">Новая ветка</h4>
              <div className="mt-3 grid grid-cols-[72px_1fr] gap-3">
                <label><span className="mb-1 block text-xs font-medium muted-text">Эмодзи</span><input className="field text-center text-xl" value={emoji} onChange={(event) => setEmoji(event.target.value)} maxLength={16} disabled={submitting} /></label>
                <label><span className="mb-1 block text-xs font-medium muted-text">Название</span><input className="field" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} disabled={submitting} /></label>
              </div>
              <motion.button type="submit" className="primary-button mt-4 w-full" disabled={submitting || !name.trim()} whileTap={{ scale: 0.95 }}>{submitting ? "Создаём…" : "Создать ветку"}</motion.button>
            </motion.form>
          )}
        </AnimatePresence>
        {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
        {loading ? <p className="py-5 text-center text-sm muted-text">Загружаем ветки…</p> : channels.length === 0 ? <p className="py-5 text-center text-sm muted-text">Веток пока нет.</p> : <div className="space-y-3">{channels.map((channel) => <ChannelCard key={channel.id} channel={channel} onUpdated={(updated) => setChannels((current) => current.map((item) => item.id === updated.id ? updated : item))} onDeleted={(id) => setChannels((current) => current.filter((item) => item.id !== id))} onChannelsChanged={onChannelsChanged} />)}</div>}
      </div>
    </section>
  );
}
