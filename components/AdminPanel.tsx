"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";

import AccessRequestsSection from "@/components/AccessRequestsSection";
import ChannelManager from "@/components/ChannelManager";
import EmployeeTable from "@/components/EmployeeTable";
import { apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import type { AdminChannel, Employee, Role } from "@/lib/types";

interface EmployeesResponse {
  employees: Employee[];
  roles: Role[];
  channels: AdminChannel[];
  current_user_tg_id: number;
}

interface AdminPanelProps {
  onPendingCountChange: (count: number) => void;
  onChannelsChanged: () => void | Promise<void>;
}

export default function AdminPanel({ onPendingCountChange, onChannelsChanged }: AdminPanelProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [currentUserTgId, setCurrentUserTgId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const body = await apiFetch<EmployeesResponse>("/api/admin/employees", { cache: "no-store" }, "Не удалось загрузить сотрудников.");
      setEmployees(body.employees);
      setRoles(body.roles);
      setChannels(body.channels);
      setCurrentUserTgId(body.current_user_tg_id);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Не удалось загрузить сотрудников."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadEmployees(); }, [loadEmployees]);

  const approveEmployee = useCallback((employee: Employee) => {
    setEmployees((current) => [...current, employee].sort((left, right) => left.full_name.localeCompare(right.full_name, "ru")));
    void onChannelsChanged();
  }, [onChannelsChanged]);

  const updateEmployee = useCallback((employee: Employee) => {
    setEmployees((current) => current.map((item) => item.id === employee.id ? employee : item).sort((left, right) => left.full_name.localeCompare(right.full_name, "ru")));
  }, []);

  const deleteEmployee = useCallback((employeeId: string) => {
    setEmployees((current) => current.filter((employee) => employee.id !== employeeId));
  }, []);

  const handleChannelsChanged = useCallback(async () => {
    await onChannelsChanged();
    await loadEmployees();
  }, [loadEmployees, onChannelsChanged]);

  return (
    <section className="h-full overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Администрирование</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">Панель администратора</h2>
          <p className="mt-1 text-sm muted-text">Обрабатывайте заявки, сотрудников и ветки форума.</p>
        </div>

        <div className="space-y-5">
          <AccessRequestsSection channels={channels} onApproved={approveEmployee} onCountChange={onPendingCountChange} />
          <ChannelManager onChannelsChanged={handleChannelsChanged} />
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Сотрудники{loading ? "" : `: ${employees.length}`}</h3>
            {loading ? <div className="py-10 text-center text-sm muted-text">Загружаем сотрудников…</div> : error ? (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="panel p-5 text-sm text-red-700 dark:text-red-300">
                <p>{error}</p><motion.button type="button" className="secondary-button mt-3" onClick={() => void loadEmployees()} whileTap={{ scale: 0.95 }}>Повторить</motion.button>
              </motion.div>
            ) : (
              <EmployeeTable employees={employees} roles={roles} channels={channels} currentUserTgId={currentUserTgId} onUpdated={updateEmployee} onDeleted={deleteEmployee} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
