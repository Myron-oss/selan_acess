import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/apiAuth";
import { getCachedRoles } from "@/lib/cachedReferenceData";
import { mapEmployee } from "@/lib/entityMappers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireAdmin(request);
    if ("response" in authorization) {
      authorization.response.headers.set("Cache-Control", "no-store");
      return authorization.response;
    }

    const supabase = getSupabaseAdmin();
    const [{ data: employeeRows, error: employeeError }, roles] =
      await Promise.all([
        supabase
          .from("employees")
          .select(
            "id,tg_id,full_name,role_id,created_at,avatar_url,theme_preference,accent_color,notifications_enabled"
          )
          .order("full_name", { ascending: true }),
        getCachedRoles()
      ]);

    if (employeeError) {
      throw employeeError;
    }
    const roleById = new Map(roles.map((role) => [role.id, role]));
    const employees = (employeeRows ?? []).map((employee) =>
      mapEmployee(
        employee as Record<string, unknown>,
        roleById.get(String(employee.role_id))
      )
    );

    return NextResponse.json(
      {
        employees,
        roles,
        current_user_tg_id: authorization.employee.tg_id
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Failed to load employees", error);
    return NextResponse.json(
      { error: "Не удалось загрузить сотрудников." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await requireAdmin(request);
    if ("response" in authorization) {
      return authorization.response;
    }

    return NextResponse.json(
      { error: "Добавление сотрудников доступно только через заявки." },
      { status: 405, headers: { Allow: "GET" } }
    );
  } catch (error) {
    console.error("Failed to reject direct employee creation", error);
    return NextResponse.json(
      { error: "Не удалось проверить права администратора." },
      { status: 500 }
    );
  }
}
