import { NextRequest, NextResponse } from "next/server";

import { getEmployeeContext, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/telegramAuth";
import type { Employee, Role } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseTelegramId(value: unknown): number | null {
  if (
    typeof value === "string" &&
    /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0
  ) {
    return Number(value);
  }

  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  return null;
}

async function requireAdmin(request: NextRequest) {
  const tgId = getSessionUserId(request);
  if (!tgId) {
    return {
      response: NextResponse.json(
        { error: "Требуется авторизация." },
        { status: 401 }
      )
    };
  }

  const employee = await getEmployeeContext(tgId);
  if (!employee) {
    return {
      response: NextResponse.json(
        { error: "Доступ не предоставлен" },
        { status: 403 }
      )
    };
  }

  if (!employee.role.is_admin) {
    return {
      response: NextResponse.json(
        { error: "Доступ разрешён только администратору." },
        { status: 403 }
      )
    };
  }

  return { employee };
}

function mapEmployee(
  employee: Record<string, unknown>,
  role?: Role
): Employee {
  return {
    id: String(employee.id),
    tg_id: Number(employee.tg_id),
    full_name: String(employee.full_name),
    role_id: String(employee.role_id),
    created_at: String(employee.created_at),
    role
  };
}

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireAdmin(request);
    if ("response" in authorization) {
      return authorization.response;
    }

    const supabase = getSupabaseAdmin();
    const [
      { data: employeeRows, error: employeeError },
      { data: roleRows, error: roleError }
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id,tg_id,full_name,role_id,created_at")
        .order("full_name", { ascending: true }),
      supabase
        .from("roles")
        .select("id,name,is_admin")
        .order("name", { ascending: true })
    ]);

    if (employeeError) {
      throw employeeError;
    }
    if (roleError) {
      throw roleError;
    }

    const roles: Role[] = (roleRows ?? []).map((role) => ({
      id: role.id as string,
      name: role.name as string,
      is_admin: role.is_admin as boolean
    }));
    const roleById = new Map(roles.map((role) => [role.id, role]));
    const employees = (employeeRows ?? []).map((employee) =>
      mapEmployee(
        employee as Record<string, unknown>,
        roleById.get(String(employee.role_id))
      )
    );

    return NextResponse.json({ employees, roles });
  } catch (error) {
    console.error("Failed to load employees", error);
    return NextResponse.json(
      { error: "Не удалось загрузить сотрудников." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await requireAdmin(request);
    if ("response" in authorization) {
      return authorization.response;
    }

    const body = (await request.json()) as {
      tg_id?: unknown;
      full_name?: unknown;
      role_id?: unknown;
    };
    const tgId = parseTelegramId(body.tg_id);
    const fullName =
      typeof body.full_name === "string" ? body.full_name.trim() : "";
    const roleId = typeof body.role_id === "string" ? body.role_id : "";

    if (!tgId || !fullName || fullName.length > 150 || !UUID_PATTERN.test(roleId)) {
      return NextResponse.json(
        { error: "Проверьте Telegram ID, ФИО и роль." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: role, error: roleError } = await supabase
      .from("roles")
      .select("id,name,is_admin")
      .eq("id", roleId)
      .maybeSingle();

    if (roleError) {
      throw roleError;
    }
    if (!role) {
      return NextResponse.json(
        { error: "Выбранная роль не существует." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("employees")
      .insert({
        tg_id: String(tgId),
        full_name: fullName,
        role_id: roleId
      })
      .select("id,tg_id,full_name,role_id,created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Сотрудник с таким Telegram ID уже существует." },
          { status: 409 }
        );
      }
      throw error;
    }

    const mappedRole: Role = {
      id: role.id as string,
      name: role.name as string,
      is_admin: role.is_admin as boolean
    };

    return NextResponse.json(
      {
        employee: mapEmployee(
          data as Record<string, unknown>,
          mappedRole
        )
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create employee", error);
    return NextResponse.json(
      { error: "Не удалось добавить сотрудника." },
      { status: 500 }
    );
  }
}
