"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import type { AccessRequest, AdminChannel, Employee } from "@/lib/types";

interface AccessRequestsSectionProps {
  channels: AdminChannel[];
  onApproved: (employee: Employee) => void;
  onCountChange: (count: number) => void;
}

interface RequestsResponse {
  requests: AccessRequest[];
  count: number;
}

const requestDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit"
});

export default function AccessRequestsSection({ channels, onApproved, onCountChange }: AccessRequestsSectionProps) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [adminByRequest, setAdminByRequest] = useState<Record<string, boolean>>({});
  const [channelsByRequest, setChannelsByRequest] = useState<Record<string, string[]>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRequests = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }
    setError("");
    try {
      const body = await apiFetch<RequestsResponse>(
        "/api/admin/access-requests",
        { cache: "no-store" },
        "Не удалось загрузить заявки."
      );

      if (!Array.isArray(body.requests)) {
        throw new Error("API вернул некорректный формат списка заявок.");
      }
      setRequests(body.requests);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Не удалось загрузить заявки."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests(true);

    const refresh = () => void loadRequests();
    const intervalId = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
    };
  }, [loadRequests]);

  useEffect(() => {
    if (!loading) {
      onCountChange(requests.length);
    }
  }, [loading, onCountChange, requests.length]);

  function removeRequest(requestId: string) {
    setRequests((current) => current.filter((item) => item.id !== requestId));
  }

  function toggleChannel(requestId: string, channelId: string) {
    setChannelsByRequest((current) => {
      const selected = current[requestId] ?? [];
      return {
        ...current,
        [requestId]: selected.includes(channelId)
          ? selected.filter((id) => id !== channelId)
          : [...selected, channelId]
      };
    });
  }

  async function approve(accessRequest: AccessRequest) {
    setProcessingId(accessRequest.id);
    setError("");
    try {
      const body = await apiFetch<{ employee: Employee }>(
        `/api/admin/access-requests/${accessRequest.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            is_admin: adminByRequest[accessRequest.id] ?? false,
            channel_ids: channelsByRequest[accessRequest.id] ?? []
          })
        },
        "Не удалось одобрить заявку."
      );
      onApproved(body.employee);
      removeRequest(accessRequest.id);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Не удалось одобрить заявку."));
    } finally {
      setProcessingId(null);
    }
  }

  async function reject(accessRequest: AccessRequest) {
    setProcessingId(accessRequest.id);
    setError("");
    try {
      await apiFetch<{ success: true }>(`/api/admin/access-requests/${accessRequest.id}/reject`, { method: "POST" }, "Не удалось отклонить заявку.");
      removeRequest(accessRequest.id);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Не удалось отклонить заявку."));
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-4">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-50">📋 Заявки на доступ</h3>
          <p className="mt-0.5 text-xs muted-text">Назначьте права администратора и доступные ветки.</p>
        </div>
        <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-[var(--accent)] px-2 py-1 text-xs font-bold text-white">{requests.length}</span>
      </div>
      <div className="p-4">
        {loading ? <p className="py-4 text-center text-sm muted-text">Загружаем заявки…</p> : requests.length === 0 ? (
          <div className="rounded-xl bg-[var(--surface-muted)] p-4 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Новых заявок нет</p>
            <p className="mt-1 text-xs muted-text">Новые заявки появятся здесь после регистрации сотрудника в боте.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {requests.map((accessRequest) => {
                const processing = processingId === accessRequest.id;
                const selectedChannels = channelsByRequest[accessRequest.id] ?? [];
                return (
                  <motion.article key={accessRequest.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate font-semibold text-slate-900 dark:text-slate-50">{accessRequest.full_name}</p>{accessRequest.tg_username && <p className="mt-0.5 text-xs muted-text">@{accessRequest.tg_username}</p>}</div>
                      <time className="shrink-0 text-[11px] muted-text">{requestDateFormatter.format(new Date(accessRequest.created_at))}</time>
                    </div>

                    <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm">
                      <span><span className="block font-semibold text-slate-800 dark:text-slate-100">Администратор</span><span className="block text-xs muted-text">Управление сотрудниками и ветками</span></span>
                      <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={adminByRequest[accessRequest.id] ?? false} onChange={(event) => setAdminByRequest((current) => ({ ...current, [accessRequest.id]: event.target.checked }))} disabled={processing} />
                    </label>

                    <fieldset className="mt-3" disabled={processing}>
                      <legend className="mb-1.5 text-xs font-medium muted-text">Доступные ветки</legend>
                      {channels.length === 0 ? <p className="text-xs text-amber-600 dark:text-amber-400">Сначала создайте хотя бы одну ветку.</p> : <div className="grid gap-2 sm:grid-cols-2">{channels.map((channel) => <label key={channel.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={selectedChannels.includes(channel.id)} onChange={() => toggleChannel(accessRequest.id, channel.id)} /><span aria-hidden="true">{channel.emoji ?? "💬"}</span><span className="truncate">{channel.name}</span></label>)}</div>}
                    </fieldset>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <motion.button type="button" className="primary-button" onClick={() => void approve(accessRequest)} disabled={processing} whileTap={{ scale: 0.95 }}>{processing ? "Обработка…" : "Одобрить"}</motion.button>
                      <motion.button type="button" className="secondary-button border-red-200 text-red-700 dark:border-red-900 dark:text-red-300" onClick={() => void reject(accessRequest)} disabled={processing} whileTap={{ scale: 0.95 }}>Отклонить</motion.button>
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            <p>{error}</p>
            {requests.length === 0 && (
              <button
                type="button"
                className="mt-2 font-semibold underline"
                onClick={() => void loadRequests(true)}
              >
                Повторить
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
