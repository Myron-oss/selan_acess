import { NextRequest, NextResponse } from "next/server";

import { requireEmployee } from "@/lib/apiAuth";
import { canAccessChannel } from "@/lib/channelService";
import { mapMessageReaction } from "@/lib/entityMappers";
import { broadcastMessageEvent } from "@/lib/messageBroadcast";
import {
  isMessageReactionEmoji,
  MESSAGE_REACTION_EVENT
} from "@/lib/messageFeatures";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const authorization = await requireEmployee(request);
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

    const body = (await request.json()) as { emoji?: unknown };
    if (!isMessageReactionEmoji(body.emoji)) {
      return NextResponse.json(
        { error: "Эта реакция не поддерживается." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .select("id,channel_id")
      .eq("id", params.id)
      .maybeSingle();

    if (messageError) {
      throw messageError;
    }
    if (!message) {
      return NextResponse.json(
        { error: "Сообщение не найдено." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    const channelId = String(message.channel_id);

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

    const reactorTgId = String(authorization.employee.tg_id);
    const { data: removed, error: removeError } = await supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", params.id)
      .eq("reactor_tg_id", reactorTgId)
      .eq("emoji", body.emoji)
      .select("id")
      .maybeSingle();

    if (removeError) {
      throw removeError;
    }
    if (removed) {
      await broadcastMessageEvent(channelId, MESSAGE_REACTION_EVENT, {
        action: "delete",
        reaction_id: String(removed.id)
      });

      return NextResponse.json(
        {
          active: false,
          reaction: null,
          removed_reaction_id: String(removed.id)
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from("message_reactions")
      .insert({
        message_id: params.id,
        reactor_tg_id: reactorTgId,
        emoji: body.emoji
      })
      .select("id,message_id,reactor_tg_id,emoji,created_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: existing, error: existingError } = await supabase
          .from("message_reactions")
          .select("id,message_id,reactor_tg_id,emoji,created_at")
          .eq("message_id", params.id)
          .eq("reactor_tg_id", reactorTgId)
          .eq("emoji", body.emoji)
          .single();

        if (existingError) {
          throw existingError;
        }

        return NextResponse.json(
          {
            active: true,
            reaction: mapMessageReaction(
              existing as Record<string, unknown>
            ),
            removed_reaction_id: null
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
      throw insertError;
    }

    const reaction = mapMessageReaction(
      inserted as Record<string, unknown>
    );
    await broadcastMessageEvent(channelId, MESSAGE_REACTION_EVENT, {
      action: "upsert",
      reaction
    });

    return NextResponse.json(
      {
        active: true,
        reaction,
        removed_reaction_id: null
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Failed to toggle message reaction", error);
    return NextResponse.json(
      { error: "Не удалось изменить реакцию." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
