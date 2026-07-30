"use client";

import { useEffect, useState } from "react";

import type { Employee, Role } from "@/lib/types";

interface EmployeeTableProps {
  employees: Employee[];
  roles: Role[];
  onUpdated: (employee: Employee) => void;
  onDeleted: (employeeId: string) => void;
}

interface EmployeeRowProps {
  employee: Employee;
  roles: Role[];
  onUpdated: (employee: Employee) => void;
  onDeleted: (employeeId: string) => void;
}

function EmployeeRow({
  employee,
  roles,
  onUpdated,
  onDeleted
}: EmployeeRowProps) {
  const [fullName, setFullName] = useState(employee.full_name);
  const [tgId, setTgId] = useState(String(employee.tg_id));
  const [roleId, setRoleId] = useState(employee.role_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setFullName(employee.full_name);
    setTgId(String(employee.tg_id));
    setRoleId(employee.role_id);
  }, [employee]);

  async function save() {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tg_id: tgId,
          full_name: fullName,
          role_id: roleId
        })
      });
      const body = (await response.json()) as
        | { employee: Employee }
        | { error?: string };

      if (!response.ok || !("employee" in body)) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Не удалось сохранить изменения."
        );
      }

      onUpdated(body.employee);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Не удалось сохранить изменения."
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
      const response = await fetch(`/api/admin/employees/${employee.id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Не удалось удалить сотрудника.");
      }

      onDeleted(employee.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Не удалось удалить сотрудника."
      );
      setSaving(false);
    }
  }

  return (
    <article className="panel p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
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
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Telegram ID
          </span>
          <input
            className="field"
            value={tgId}
            onChange={(event) => setTgId(event.target.value)}
            inputMode="numeric"
            pattern="[0-9]+"
            disabled={saving}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Роль
          </span>
          <select
            className="field"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            disabled={saving}
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
                {role.is_admin ? " (администратор)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="primary-button flex-1"
          onClick={() => void save()}
          disabled={saving || !fullName.trim() || !tgId || !roleId}
        >
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          type="button"
          className="secondary-button border-red-200 text-red-700 hover:bg-red-50"
          onClick={() => void remove()}
          disabled={saving}
        >
          Удалить
        </button>
      </div>
    </article>
  );
}

export default function EmployeeTable({
  employees,
  roles,
  onUpdated,
  onDeleted
}: EmployeeTableProps) {
  if (employees.length === 0) {
    return (
      <div className="panel p-5 text-center text-sm text-slate-500">
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
          onUpdated={onUpdated}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  );
}
