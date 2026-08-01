"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import type { AccessRequest, Employee, Role } from "@/lib/types";

interface AccessRequestsSectionProps {
  roles: Role[];
  onApproved: (employee: Employee) => void;
  onCountChange: (count: number) => void;
}

interface RequestsResponse {
  requests: AccessRequest[];
  count: number;
  debug: AccessRequestsDebug;
}

interface AccessRequestsDebug {
  supabase_project_ref: string;
  raw_query_count: number;
  admin_tg_id: number;
}

const requestDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit"
});

export default function AccessRequestsSection({
  roles,
  onApproved,
  onCountChange
}: AccessRequestsSectionProps) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>(
    {}
  );
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [debug, setDebug] = useState<AccessRequestsDebug | null>(null);

  const defaultRoleId = useMemo(
    () =>
      roles.find((role) => role.name === "Сотрудник")?.id ??
      roles.find((role) => !role.is_admin)?.id ??
      roles[0]?.id ??
      "",
    [roles]
  );

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
      setDebug(body.debug);
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
    setRequests((current) =>
      current.filter((item) => item.id !== requestId)
    );
  }

  async function approve(accessRequest: AccessRequest) {
    const roleId = selectedRoles[accessRequest.id] ?? defaultRoleId;
    if (!roleId) {
      setError("Сначала создайте хотя бы одну роль.");
      return;
    }

    setProcessingId(accessRequest.id);
    setError("");

    try {
      const body = await apiFetch<{ employee: Employee }>(
        `/api/admin/access-requests/${accessRequest.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role_id: roleId })
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
      await apiFetch<{ success: true }>(
        `/api/admin/access-requests/${accessRequest.id}/reject`,
        { method: "POST" },
        "Не удалось отклонить заявку."
      );

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
          <h3 className="font-semibold text-slate-900 dark:text-slate-50">
            📋 Заявки на доступ
          </h3>
          <p className="mt-0.5 text-xs muted-text">
            Подтвердите сотрудника и назначьте ему роль.
          </p>
        </div>
        <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-[var(--accent)] px-2 py-1 text-xs font-bold text-white">
          {requests.length}
        </span>
      </div>

      <div className="p-4">
        {loading ? (
          <p className="py-4 text-center text-sm muted-text">
            Загружаем заявки…
          </p>
        ) : requests.length === 0 ? (
          <div className="rounded-xl bg-[var(--surface-muted)] p-4 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Новых заявок нет
            </p>
            <p className="mt-1 text-xs muted-text">
              Они появятся здесь после команды /start боту.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {requests.map((accessRequest) => {
                const selectedRoleId =
                  selectedRoles[accessRequest.id] ?? defaultRoleId;
                const processing = processingId === accessRequest.id;

                return (
                  <motion.article
                    key={accessRequest.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 dark:text-slate-50">
                          {accessRequest.full_name}
                        </p>
                        <p className="mt-0.5 text-xs muted-text">
                          {accessRequest.tg_username
                            ? `@${accessRequest.tg_username}`
                            : `Telegram ID: ${accessRequest.tg_id}`}
                        </p>
                      </div>
                      <time className="shrink-0 text-[11px] muted-text">
                        {requestDateFormatter.format(
                          new Date(accessRequest.created_at)
                        )}
                      </time>
                    </div>

                    <label className="mt-3 block">
                      <span className="mb-1 block text-xs font-medium muted-text">
                        Роль после одобрения
                      </span>
                      <select
                        className="field"
                        value={selectedRoleId}
                        onChange={(event) =>
                          setSelectedRoles((current) => ({
                            ...current,
                            [accessRequest.id]: event.target.value
                          }))
                        }
                        disabled={processing}
                      >
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                            {role.is_admin ? " (администратор)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <motion.button
                        type="button"
                        className="primary-button"
                        onClick={() => void approve(accessRequest)}
                        disabled={processing || !selectedRoleId}
                        whileTap={{ scale: 0.95 }}
                      >
                        {processing ? "Обработка…" : "Одобрить"}
                      </motion.button>
                      <motion.button
                        type="button"
                        className="secondary-button border-red-200 text-red-700 dark:border-red-900 dark:text-red-300"
                        onClick={() => void reject(accessRequest)}
                        disabled={processing}
                        whileTap={{ scale: 0.95 }}
                      >
                        Отклонить
                      </motion.button>
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

        {debug && (
          <p className="mt-3 break-all text-[10px] text-slate-400 dark:text-slate-500">
            debug: project={debug.supabase_project_ref}, count=
            {debug.raw_query_count}, admin={debug.admin_tg_id}
          </p>
        )}
      </div>
    </section>
  );
}
