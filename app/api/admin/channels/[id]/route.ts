import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireAdmin } from "@/lib/apiAuth";
import { CHANNELS_CACHE_TAG } from "@/lib/cachedReferenceData";
import { rolesExist } from "@/lib/channelService";
import { mapAdminChannel } from "@/lib/entityMappers";
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
      { error: "Некорректный идентификатор ветки." },
      { status: 400 }
    );
  }

  try {
    const authorization = await requireAdmin(request);
    if ("response" in authorization) {
      return authorization.response;
    }

    const body = (await request.json()) as {
      name?: unknown;
      emoji?: unknown;
      allowed_role_ids?: unknown;
    };
    const updates: {
      name?: string;
      emoji?: string | null;
      allowed_role_ids?: string[];
    } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 100) {
        return NextResponse.json(
          { error: "Название ветки должно содержать от 1 до 100 символов." },
          { status: 400 }
        );
      }
      updates.name = name;
    }

    if (body.emoji !== undefined) {
      const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
      if (emoji.length > 16) {
        return NextResponse.json(
          { error: "Эмодзи должен содержать не более 16 символов." },
          { status: 400 }
        );
      }
      updates.emoji = emoji || null;
    }

    if (body.allowed_role_ids !== undefined) {
      const roleIds = parseUniqueUuidArray(body.allowed_role_ids);
      if (!roleIds || !(await rolesExist(roleIds))) {
        return NextResponse.json(
          { error: "Список ролей содержит неизвестную роль." },
          { status: 400 }
        );
      }
      updates.allowed_role_ids = roleIds;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Нет данных для изменения ветки." },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from("channels")
      .update(updates)
      .eq("id", params.id)
      .select("id,name,emoji,allowed_role_ids")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return NextResponse.json(
        { error: "Ветка не найдена." },
        { status: 404 }
      );
    }

    revalidateTag(CHANNELS_CACHE_TAG);

    return NextResponse.json({
      channel: mapAdminChannel(data as Record<string, unknown>)
    });
  } catch (error) {
    console.error("Failed to update channel", error);
    return NextResponse.json(
      { error: "Не удалось изменить ветку." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  if (!isUuid(params.id)) {
    return NextResponse.json(
      { error: "Некорректный идентификатор ветки." },
      { status: 400 }
    );
  }

  try {
    const authorization = await requireAdmin(request);
    if ("response" in authorization) {
      return authorization.response;
    }

    const { data, error } = await getSupabaseAdmin()
      .from("channels")
      .delete()
      .eq("id", params.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return NextResponse.json(
        { error: "Ветка не найдена." },
        { status: 404 }
      );
    }

    revalidateTag(CHANNELS_CACHE_TAG);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete channel", error);
    return NextResponse.json(
      { error: "Не удалось удалить ветку." },
      { status: 500 }
    );
  }
}
