import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/apiAuth";
import { canAccessChannel } from "@/lib/channelService";
import { mapPinnedMessage } from "@/lib/entityMappers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PINNED_MESSAGE_SELECT =
  "id,channel_id,sender_name,text,file_name,is_pinned,pinned_at,pinned_by_tg_id,created_at";

interface RouteContext {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const authorization = await requireAdmin(request);
    if ("response" in authorization) {
      authorization.response.headers.set("Cache-Control", "no-store");
      return authorization.response;
    }

    if (!isUuid(params.id)) {
      return NextResponse.json(
        { error: "Некорректный идентификатор сообщения." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: currentMessage, error: messageError } = await supabase
      .from("messages")
      .select(PINNED_MESSAGE_SELECT)
      .eq("id", params.id)
      .maybeSingle();

    if (messageError) {
      throw messageError;
    }
    if (!currentMessage) {
      return NextResponse.json(
        { error: "Сообщение не найдено." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const channelId = String(currentMessage.channel_id);
    if (
      !(await canAccessChannel(
        channelId,
        authorization.employee.role_id
      ))
    ) {
      return NextResponse.json(
        { error: "Нет доступа к этой ветке." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const wasPinned = Boolean(currentMessage.is_pinned);
    const nextPinned = !wasPinned;
    const { data: updatedMessage, error: updateError } = await supabase
      .from("messages")
      .update({
        is_pinned: nextPinned,
        pinned_at: nextPinned ? new Date().toISOString() : null,
        pinned_by_tg_id: nextPinned
          ? String(authorization.employee.tg_id)
          : null
      })
      .eq("id", params.id)
      .eq("is_pinned", wasPinned)
      .select(PINNED_MESSAGE_SELECT)
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }
    if (!updatedMessage) {
      return NextResponse.json(
        { error: "Состояние сообщения уже изменилось. Повторите действие." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    let latestPinnedMessage = nextPinned ? updatedMessage : null;
    if (!nextPinned) {
      const { data: latest, error: latestError } = await supabase
        .from("messages")
        .select(PINNED_MESSAGE_SELECT)
        .eq("channel_id", channelId)
        .eq("is_pinned", true)
        .order("pinned_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) {
        console.error("Failed to load the next pinned message", latestError);
      } else {
        latestPinnedMessage = latest;
      }
    }

    return NextResponse.json(
      {
        message: mapPinnedMessage(
          updatedMessage as Record<string, unknown>
        ),
        latest_pinned_message: latestPinnedMessage
          ? mapPinnedMessage(
              latestPinnedMessage as Record<string, unknown>
            )
          : null
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Failed to toggle pinned message", error);
    return NextResponse.json(
      { error: "Не удалось изменить закреплённое сообщение." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
