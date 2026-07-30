import { NextRequest, NextResponse } from "next/server";

import { getEmployeeContext, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/telegramAuth";
import type { Employee, Role } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: {
    id: string;
  };
}

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
    return NextResponse.json(
      { error: "Требуется авторизация." },
      { status: 401 }
    );
  }

  const employee = await getEmployeeContext(tgId);
  if (!employee) {
    return NextResponse.json(
      { error: "Доступ не предоставлен" },
      { status: 403 }
    );
  }

  if (!employee.role.is_admin) {
    return NextResponse.json(
      { error: "Доступ разрешён только администратору." },
      { status: 403 }
    );
  }

  return null;
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

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!UUID_PATTERN.test(params.id)) {
    return NextResponse.json(
      { error: "Некорректный идентификатор сотрудника." },
      { status: 400 }
    );
  }

  try {
    const deniedResponse = await requireAdmin(request);
    if (deniedResponse) {
      return deniedResponse;
    }

    const body = (await request.json()) as {
      tg_id?: unknown;
      full_name?: unknown;
      role_id?: unknown;
    };
    const updates: Record<string, string> = {};

    if (body.tg_id !== undefined) {
      const tgId = parseTelegramId(body.tg_id);
      if (!tgId) {
        return NextResponse.json(
          { error: "Некорректный Telegram ID." },
          { status: 400 }
        );
      }
      updates.tg_id = String(tgId);
    }

    if (body.full_name !== undefined) {
      const fullName =
        typeof body.full_name === "string" ? body.full_name.trim() : "";
      if (!fullName || fullName.length > 150) {
        return NextResponse.json(
          { error: "ФИО должно содержать от 1 до 150 символов." },
          { status: 400 }
        );
      }
      updates.full_name = fullName;
    }

    let selectedRole: Role | undefined;
    if (body.role_id !== undefined) {
      const roleId = typeof body.role_id === "string" ? body.role_id : "";
      if (!UUID_PATTERN.test(roleId)) {
        return NextResponse.json(
          { error: "Некорректная роль." },
          { status: 400 }
        );
      }

      const { data: role, error: roleError } = await getSupabaseAdmin()
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

      updates.role_id = roleId;
      selectedRole = {
        id: role.id as string,
        name: role.name as string,
        is_admin: role.is_admin as boolean
      };
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Нет данных для изменения." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("employees")
      .update(updates)
      .eq("id", params.id)
      .select("id,tg_id,full_name,role_id,created_at")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Сотрудник с таким Telegram ID уже существует." },
          { status: 409 }
        );
      }
      throw error;
    }
    if (!data) {
      return NextResponse.json(
        { error: "Сотрудник не найден." },
        { status: 404 }
      );
    }

    if (!selectedRole) {
      const { data: role, error: roleError } = await supabase
        .from("roles")
        .select("id,name,is_admin")
        .eq("id", data.role_id)
        .single();
      if (roleError) {
        throw roleError;
      }
      selectedRole = {
        id: role.id as string,
        name: role.name as string,
        is_admin: role.is_admin as boolean
      };
    }

    return NextResponse.json({
      employee: mapEmployee(
        data as Record<string, unknown>,
        selectedRole
      )
    });
  } catch (error) {
    console.error("Failed to update employee", error);
    return NextResponse.json(
      { error: "Не удалось изменить сотрудника." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  if (!UUID_PATTERN.test(params.id)) {
    return NextResponse.json(
      { error: "Некорректный идентификатор сотрудника." },
      { status: 400 }
    );
  }

  try {
    const deniedResponse = await requireAdmin(request);
    if (deniedResponse) {
      return deniedResponse;
    }

    const { data, error } = await getSupabaseAdmin()
      .from("employees")
      .delete()
      .eq("id", params.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return NextResponse.json(
        { error: "Сотрудник не найден." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete employee", error);
    return NextResponse.json(
      { error: "Не удалось удалить сотрудника." },
      { status: 500 }
    );
  }
}
