import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

import { requireAdmin } from "@/lib/apiAuth";
import {
  CHANNELS_CACHE_TAG,
  getCachedAdminChannels
} from "@/lib/cachedReferenceData";
import { rolesExist } from "@/lib/channelService";
import { mapAdminChannel } from "@/lib/entityMappers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { parseUniqueUuidArray } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireAdmin(request);
    if ("response" in authorization) {
      authorization.response.headers.set("Cache-Control", "no-store");
      return authorization.response;
    }

    const channels = await getCachedAdminChannels();

    return NextResponse.json(
      {
        channels
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Failed to load admin channels", error);
    return NextResponse.json(
      { error: "Не удалось загрузить ветки." },
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

    const body = (await request.json()) as {
      name?: unknown;
      emoji?: unknown;
      allowed_role_ids?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
    const roleIds = parseUniqueUuidArray(body.allowed_role_ids);

    if (!name || name.length > 100) {
      return NextResponse.json(
        { error: "Название ветки должно содержать от 1 до 100 символов." },
        { status: 400 }
      );
    }
    if (emoji.length > 16) {
      return NextResponse.json(
        { error: "Эмодзи должен содержать не более 16 символов." },
        { status: 400 }
      );
    }
    if (!roleIds || !(await rolesExist(roleIds))) {
      return NextResponse.json(
        { error: "Список ролей содержит неизвестную роль." },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from("channels")
      .insert({
        name,
        emoji: emoji || null,
        allowed_role_ids: roleIds
      })
      .select("id,name,emoji,allowed_role_ids")
      .single();

    if (error) {
      throw error;
    }

    revalidateTag(CHANNELS_CACHE_TAG);

    return NextResponse.json(
      { channel: mapAdminChannel(data as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create channel", error);
    return NextResponse.json(
      { error: "Не удалось создать ветку." },
      { status: 500 }
    );
  }
}
