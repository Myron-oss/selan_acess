import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/apiAuth";
import { mapEmployee, mapRole } from "@/lib/entityMappers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Role } from "@/lib/types";
import { isUuid } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: {
    id: string;
  };
}

async function countAdministrators(): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("employees")
    .select("id,role:roles!inner(is_admin)", { count: "exact", head: true })
    .eq("roles.is_admin", true);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!isUuid(params.id)) {
    return NextResponse.json(
      { error: "Некорректный идентификатор сотрудника." },
      { status: 400 }
    );
  }

  try {
    const authorization = await requireAdmin(request);
    if ("response" in authorization) {
      return authorization.response;
    }

    const supabase = getSupabaseAdmin();
    const { data: targetEmployee, error: targetError } = await supabase
      .from("employees")
      .select(
        "id,tg_id,full_name,role_id,created_at,avatar_url,theme_preference,accent_color,role:roles!inner(id,name,is_admin)"
      )
      .eq("id", params.id)
      .maybeSingle();

    if (targetError) {
      throw targetError;
    }
    if (!targetEmployee) {
      return NextResponse.json(
        { error: "Сотрудник не найден." },
        { status: 404 }
      );
    }

    const rawOldRole = Array.isArray(targetEmployee.role)
      ? targetEmployee.role[0]
      : targetEmployee.role;
    if (!rawOldRole || typeof rawOldRole !== "object") {
      throw new Error("Employee role relation is missing");
    }
    const oldRole = mapRole(rawOldRole as Record<string, unknown>);

    const body = (await request.json()) as {
      full_name?: unknown;
      role_id?: unknown;
    };
    const updates: Record<string, string> = {};

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
      if (!isUuid(roleId)) {
        return NextResponse.json(
          { error: "Некорректная роль." },
          { status: 400 }
        );
      }

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

      updates.role_id = roleId;
      selectedRole = mapRole(role as Record<string, unknown>);

      if (oldRole.is_admin && !selectedRole.is_admin) {
        if (
          Number(targetEmployee.tg_id) === authorization.employee.tg_id
        ) {
          return NextResponse.json(
            { error: "Нельзя снять с себя права администратора" },
            { status: 400 }
          );
        }

        if ((await countAdministrators()) <= 1) {
          return NextResponse.json(
            { error: "Нельзя оставить систему без администраторов" },
            { status: 400 }
          );
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Нет данных для изменения." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("employees")
      .update(updates)
      .eq("id", params.id)
      .select(
        "id,tg_id,full_name,role_id,created_at,avatar_url,theme_preference,accent_color"
      )
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
      selectedRole = mapRole(role as Record<string, unknown>);
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
  if (!isUuid(params.id)) {
    return NextResponse.json(
      { error: "Некорректный идентификатор сотрудника." },
      { status: 400 }
    );
  }

  try {
    const authorization = await requireAdmin(request);
    if ("response" in authorization) {
      return authorization.response;
    }

    const supabase = getSupabaseAdmin();
    const { data: targetEmployee, error: targetError } = await supabase
      .from("employees")
      .select("id,role_id,role:roles!inner(is_admin)")
      .eq("id", params.id)
      .maybeSingle();

    if (targetError) {
      throw targetError;
    }
    if (!targetEmployee) {
      return NextResponse.json(
        { error: "Сотрудник не найден." },
        { status: 404 }
      );
    }

    const rawTargetRole = Array.isArray(targetEmployee.role)
      ? targetEmployee.role[0]
      : targetEmployee.role;
    if (!rawTargetRole || typeof rawTargetRole !== "object") {
      throw new Error("Employee role relation is missing");
    }

    if (
      Boolean((rawTargetRole as Record<string, unknown>).is_admin) &&
      (await countAdministrators()) <= 1
    ) {
      return NextResponse.json(
        { error: "Нельзя оставить систему без администраторов" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
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
