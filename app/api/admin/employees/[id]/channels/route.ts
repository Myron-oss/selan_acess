import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/apiAuth";
import { channelsExist } from "@/lib/channelService";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid, parseUniqueUuidArray } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
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

    const body = (await request.json()) as { channel_ids?: unknown };
    const channelIds = parseUniqueUuidArray(body.channel_ids);
    if (!channelIds || !(await channelsExist(channelIds))) {
      return NextResponse.json(
        { error: "Список содержит неизвестную ветку." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("tg_id")
      .eq("id", params.id)
      .maybeSingle();

    if (employeeError) {
      throw employeeError;
    }
    if (!employee) {
      return NextResponse.json(
        { error: "Сотрудник не найден." },
        { status: 404 }
      );
    }

    const { error } = await supabase.rpc("replace_employee_channel_access", {
      p_employee_tg_id: String(employee.tg_id),
      p_channel_ids: channelIds
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({ channel_ids: channelIds });
  } catch (error) {
    console.error("Failed to update employee channel access", error);
    return NextResponse.json(
      { error: "Не удалось сохранить доступ к веткам." },
      { status: 500 }
    );
  }
}
