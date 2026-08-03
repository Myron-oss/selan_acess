import { NextRequest, NextResponse } from "next/server";

import { requireEmployee } from "@/lib/apiAuth";
import { runAfterResponse } from "@/lib/backgroundTasks";
import { canAccessChannel } from "@/lib/channelService";
import { mapMessageRead } from "@/lib/entityMappers";
import { broadcastMessageEvent } from "@/lib/messageBroadcast";
import { MESSAGE_READS_EVENT } from "@/lib/messageFeatures";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authorization = await requireEmployee(request);
    if ("response" in authorization) {
      authorization.response.headers.set("Cache-Control", "no-store");
      return authorization.response;
    }

    const body = (await request.json()) as {
      channel_id?: unknown;
      message_ids?: unknown;
    };
    const channelId =
      typeof body.channel_id === "string" ? body.channel_id : "";
    const messageIds = Array.isArray(body.message_ids)
      ? Array.from(
          new Set(
            body.message_ids.filter(
              (id): id is string => typeof id === "string" && isUuid(id)
            )
          )
        )
      : [];

    if (!isUuid(channelId) || messageIds.length === 0) {
      return NextResponse.json(
        { error: "Некорректный список сообщений." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (messageIds.length > 50) {
      return NextResponse.json(
        { error: "За один запрос можно отметить не более 50 сообщений." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!(await canAccessChannel(channelId, authorization.employee.tg_id))) {
      return NextResponse.json(
        { error: "Нет доступа к этой ветке." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("id,sender_tg_id")
      .eq("channel_id", channelId)
      .in("id", messageIds);

    if (messagesError) {
      throw messagesError;
    }

    const readerTgId = String(authorization.employee.tg_id);
    const rows = (messages ?? [])
      .filter((message) => String(message.sender_tg_id) !== readerTgId)
      .map((message) => ({
        message_id: String(message.id),
        reader_tg_id: readerTgId,
        reader_name: authorization.employee.full_name
      }));

    if (rows.length === 0) {
      return NextResponse.json(
        { marked: 0 },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const { data: inserted, error: upsertError } = await supabase
      .from("message_reads")
      .upsert(rows, {
        onConflict: "message_id,reader_tg_id",
        ignoreDuplicates: true
      })
      .select("id,message_id,reader_tg_id,reader_name,read_at");

    if (upsertError) {
      throw upsertError;
    }

    const reads = (inserted ?? []).map((read) =>
      mapMessageRead(read as Record<string, unknown>)
    );
    if (reads.length > 0) {
      runAfterResponse(
        broadcastMessageEvent(channelId, MESSAGE_READS_EVENT, { reads })
      );
    }

    return NextResponse.json(
      { marked: reads.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Failed to mark messages as read", error);
    return NextResponse.json(
      { error: "Не удалось отметить сообщения как прочитанные." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
