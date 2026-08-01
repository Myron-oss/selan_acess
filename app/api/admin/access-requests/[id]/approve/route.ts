import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireAdmin } from "@/lib/apiAuth";
import { CHANNELS_CACHE_TAG } from "@/lib/cachedReferenceData";
import { mapEmployee, mapRole } from "@/lib/entityMappers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!isUuid(params.id)) {
    return NextResponse.json(
      { error: "Некорректный идентификатор заявки." },
      { status: 400 }
    );
  }

  try {
    const authorization = await requireAdmin(request);
    if ("response" in authorization) {
      return authorization.response;
    }

    const body = (await request.json()) as { role_id?: unknown };
    const roleId = typeof body.role_id === "string" ? body.role_id : "";
    if (!isUuid(roleId)) {
      return NextResponse.json(
        { error: "Выберите корректную роль." },
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

    const { data, error } = await supabase.rpc("approve_access_request", {
      p_request_id: params.id,
      p_role_id: roleId
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Сотрудник с таким Telegram ID уже существует." },
          { status: 409 }
        );
      }
      if (error.message.includes("access_request_not_found")) {
        return NextResponse.json(
          { error: "Заявка не найдена." },
          { status: 404 }
        );
      }
      if (error.message.includes("access_request_already_processed")) {
        return NextResponse.json(
          { error: "Заявка уже обработана." },
          { status: 409 }
        );
      }
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      throw new Error("Approval did not return an employee");
    }

    const employee = mapEmployee(
      row as Record<string, unknown>,
      mapRole(role as Record<string, unknown>)
    );

    revalidateTag(CHANNELS_CACHE_TAG);

    return NextResponse.json({ employee });
  } catch (error) {
    console.error("Failed to approve access request", error);
    return NextResponse.json(
      { error: "Не удалось одобрить заявку." },
      { status: 500 }
    );
  }
}
