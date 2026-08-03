import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireAdmin } from "@/lib/apiAuth";
import { CHANNELS_CACHE_TAG } from "@/lib/cachedReferenceData";
import { channelsExist } from "@/lib/channelService";
import { mapEmployee, mapRole } from "@/lib/entityMappers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid, parseUniqueUuidArray } from "@/lib/validation";

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

    const body = (await request.json()) as {
      is_admin?: unknown;
      channel_ids?: unknown;
    };
    if (typeof body.is_admin !== "boolean") {
      return NextResponse.json(
        { error: "Укажите тип доступа сотрудника." },
        { status: 400 }
      );
    }
    const channelIds = parseUniqueUuidArray(body.channel_ids);
    if (!channelIds || !(await channelsExist(channelIds))) {
      return NextResponse.json(
        { error: "Список содержит неизвестную ветку." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: roleRows, error: roleError } = await supabase
      .from("roles")
      .select("id,name,is_admin")
      .eq("is_admin", body.is_admin)
      .order("name", { ascending: true });

    if (roleError) {
      throw roleError;
    }
    const role = body.is_admin
      ? roleRows?.[0]
      : roleRows?.find((row) => row.name === "Сотрудник") ?? roleRows?.[0];
    if (!role) {
      return NextResponse.json(
        { error: "Подходящая роль не настроена." },
        { status: 400 }
      );
    }
    const roleId = String(role.id);

    const { data, error } = await supabase.rpc("approve_access_request", {
      p_request_id: params.id,
      p_role_id: roleId,
      p_channel_ids: channelIds
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
      { ...(row as Record<string, unknown>), channel_ids: channelIds },
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
