"use client";

import { FormEvent, useState } from "react";

import type { Employee, Role } from "@/lib/types";

interface AddEmployeeFormProps {
  roles: Role[];
  onCreated: (employee: Employee) => void;
}

export default function AddEmployeeForm({
  roles,
  onCreated
}: AddEmployeeFormProps) {
  const [tgId, setTgId] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tg_id: tgId, full_name: fullName, role_id: roleId })
      });
      const body = (await response.json()) as
        | { employee: Employee }
        | { error?: string };

      if (!response.ok || !("employee" in body)) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Не удалось добавить сотрудника."
        );
      }

      onCreated(body.employee);
      setTgId("");
      setFullName("");
      setRoleId("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Не удалось добавить сотрудника."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel p-4">
      <h3 className="font-semibold text-slate-900">Добавить сотрудника</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Telegram ID
          </span>
          <input
            className="field"
            type="text"
            inputMode="numeric"
            pattern="[0-9]+"
            value={tgId}
            onChange={(event) => setTgId(event.target.value)}
            placeholder="123456789"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            ФИО
          </span>
          <input
            className="field"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={150}
            placeholder="Иван Петров"
            required
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Роль
          </span>
          <select
            className="field"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            required
          >
            <option value="">Выберите роль</option>
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

      <button
        type="submit"
        className="primary-button mt-4 w-full sm:w-auto"
        disabled={submitting}
      >
        {submitting ? "Добавляем…" : "Добавить сотрудника"}
      </button>
    </form>
  );
}
