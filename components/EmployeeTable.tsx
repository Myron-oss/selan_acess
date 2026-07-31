"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import Avatar from "@/components/Avatar";
import { apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import type { Employee, Role } from "@/lib/types";

interface EmployeeTableProps {
  employees: Employee[];
  roles: Role[];
  currentUserTgId: number | null;
  onUpdated: (employee: Employee) => void;
  onDeleted: (employeeId: string) => void;
}

interface EmployeeRowProps {
  employee: Employee;
  roles: Role[];
  currentUserTgId: number | null;
  onUpdated: (employee: Employee) => void;
  onDeleted: (employeeId: string) => void;
}

function EmployeeRow({
  employee,
  roles,
  currentUserTgId,
  onUpdated,
  onDeleted
}: EmployeeRowProps) {
  const [fullName, setFullName] = useState(employee.full_name);
  const [roleId, setRoleId] = useState(employee.role_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isCurrentUser = employee.tg_id === currentUserTgId;
  const protectsOwnAdminRole =
    isCurrentUser && Boolean(employee.role?.is_admin);

  useEffect(() => {
    setFullName(employee.full_name);
    setRoleId(employee.role_id);
  }, [employee]);

  async function save() {
    setSaving(true);
    setError("");

    try {
      const body = await apiFetch<{ employee: Employee }>(
        `/api/admin/employees/${employee.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ full_name: fullName, role_id: roleId })
        },
        "Не удалось сохранить изменения."
      );

      onUpdated(body.employee);
    } catch (caughtError) {
      setError(
        getErrorMessage(caughtError, "Не удалось сохранить изменения.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Удалить сотрудника «${employee.full_name}»? Доступ к форуму будет отозван.`
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await apiFetch<{ success: true }>(
        `/api/admin/employees/${employee.id}`,
        { method: "DELETE" },
        "Не удалось удалить сотрудника."
      );

      onDeleted(employee.id);
    } catch (caughtError) {
      setError(
        getErrorMessage(caughtError, "Не удалось удалить сотрудника.")
      );
      setSaving(false);
    }
  }

  return (
    <motion.article
      className="panel p-4"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-4 flex items-center gap-3">
        <Avatar
          name={employee.full_name}
          tgId={employee.tg_id}
          url={employee.avatar_url}
          size="md"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-slate-50">
            {employee.full_name}
            {isCurrentUser && (
              <span className="ml-2 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] text-[var(--accent)] dark:bg-[var(--accent-dark-soft)]">
                Вы
              </span>
            )}
          </p>
          <p className="text-xs muted-text">{employee.role?.name}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium muted-text">
            ФИО
          </span>
          <input
            className="field"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={150}
            disabled={saving}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium muted-text">
            Роль
          </span>
          <select
            className="field"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            disabled={saving}
            title={
              protectsOwnAdminRole
                ? "Нельзя снять с себя права администратора"
                : undefined
            }
          >
            {roles.map((role) => (
              <option
                key={role.id}
                value={role.id}
                disabled={protectsOwnAdminRole && !role.is_admin}
              >
                {role.name}
                {role.is_admin ? " (администратор)" : ""}
              </option>
            ))}
          </select>
          {protectsOwnAdminRole && (
            <span className="mt-1.5 block text-xs text-amber-600 dark:text-amber-400">
              Нельзя выбрать обычную роль для себя: сначала назначьте другого
              администратора.
            </span>
          )}
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <motion.button
          type="button"
          className="primary-button flex-1"
          onClick={() => void save()}
          disabled={saving || !fullName.trim() || !roleId}
          whileTap={{ scale: 0.95 }}
        >
          {saving ? "Сохраняем…" : "Сохранить"}
        </motion.button>
        <motion.button
          type="button"
          className="secondary-button border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
          onClick={() => void remove()}
          disabled={saving}
          whileTap={{ scale: 0.95 }}
        >
          Удалить
        </motion.button>
      </div>
    </motion.article>
  );
}

export default function EmployeeTable({
  employees,
  roles,
  currentUserTgId,
  onUpdated,
  onDeleted
}: EmployeeTableProps) {
  if (employees.length === 0) {
    return (
      <div className="panel p-5 text-center text-sm muted-text">
        Сотрудники пока не добавлены.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {employees.map((employee) => (
        <EmployeeRow
          key={employee.id}
          employee={employee}
          roles={roles}
          currentUserTgId={currentUserTgId}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  );
}
