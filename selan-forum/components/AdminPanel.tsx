"use client";

import { useCallback, useEffect, useState } from "react";

import AddEmployeeForm from "@/components/AddEmployeeForm";
import EmployeeTable from "@/components/EmployeeTable";
import type { Employee, Role } from "@/lib/types";

interface EmployeesResponse {
  employees: Employee[];
  roles: Role[];
}

export default function AdminPanel() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/employees", {
        cache: "no-store"
      });
      const body = (await response.json()) as
        | EmployeesResponse
        | { error?: string };

      if (!response.ok || !("employees" in body)) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Не удалось загрузить сотрудников."
        );
      }

      setEmployees(body.employees);
      setRoles(body.roles);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Не удалось загрузить сотрудников."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  function addEmployee(employee: Employee) {
    setEmployees((currentEmployees) =>
      [...currentEmployees, employee].sort((left, right) =>
        left.full_name.localeCompare(right.full_name, "ru")
      )
    );
  }

  function updateEmployee(employee: Employee) {
    setEmployees((currentEmployees) =>
      currentEmployees
        .map((currentEmployee) =>
          currentEmployee.id === employee.id ? employee : currentEmployee
        )
        .sort((left, right) => left.full_name.localeCompare(right.full_name, "ru"))
    );
  }

  function deleteEmployee(employeeId: string) {
    setEmployees((currentEmployees) =>
      currentEmployees.filter((employee) => employee.id !== employeeId)
    );
  }

  return (
    <section className="h-full overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Управление доступом</h2>
        <p className="mt-1 text-sm text-slate-500">
          Добавляйте сотрудников и назначайте им роли.
        </p>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">
          Загружаем сотрудников…
        </div>
      ) : error ? (
        <div className="panel p-5 text-sm text-red-700">
          <p>{error}</p>
          <button
            type="button"
            className="secondary-button mt-3"
            onClick={() => void loadEmployees()}
          >
            Повторить
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <AddEmployeeForm roles={roles} onCreated={addEmployee} />
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              Сотрудники: {employees.length}
            </h3>
            <EmployeeTable
              employees={employees}
              roles={roles}
              onUpdated={updateEmployee}
              onDeleted={deleteEmployee}
            />
          </div>
        </div>
      )}
    </section>
  );
}
