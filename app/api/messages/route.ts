import { NextRequest, NextResponse } from "next/server";

import {
  ATTACHMENT_LIMITS,
  CHAT_ATTACHMENTS_BUCKET,
  isFileNameAllowedForCategory
} from "@/lib/attachments";
import { requireEmployee } from "@/lib/apiAuth";
import { canAccessChannel } from "@/lib/channelService";
import {
  mapMessage,
  mapMessageReaction,
  mapMessageRead,
  mapMessageReplyPreview
} from "@/lib/entityMappers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  MessageFileType,
  MessageReaction,
  MessageRead,
  MessageReplyPreview
} from "@/lib/types";
import { isUuid } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAttachmentType(value: unknown): value is MessageFileType {
  return value === "image" || value === "video" || value === "document";
}

function isChatAttachmentUrl(value: string, channelId: string): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) {
    return false;
  }

  const prefix = `${supabaseUrl}/storage/v1/object/public/${CHAT_ATTACHMENTS_BUCKET}/${channelId}/`;
  return value.startsWith(prefix);
}

export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get("channel_id") ?? "";
  if (!isUuid(channelId)) {
    return NextResponse.json(
      { error: "Некорректный идентификатор ветки." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const authorization = await requireEmployee(request);
    if ("response" in authorization) {
      authorization.response.headers.set("Cache-Control", "no-store");
      return authorization.response;
    }
    const { employee } = authorization;

    if (!(await canAccessChannel(channelId, employee.role_id))) {
      return NextResponse.json(
        { error: "Нет доступа к этой ветке." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("messages")
      .select(
        "id,channel_id,sender_tg_id,sender_name,text,file_url,file_type,file_name,file_size,reply_to_message_id,created_at"
      )
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    const recentMessages = [...(data ?? [])].reverse();
    const senderIds = Array.from(
      new Set(recentMessages.map((message) => String(message.sender_tg_id)))
    );
    const messageIds = recentMessages.map((message) => String(message.id));
    const replyIds = Array.from(
      new Set(
        recentMessages
          .map((message) => message.reply_to_message_id)
          .filter((id): id is string => typeof id === "string")
      )
    );

    async function loadSenders() {
      if (senderIds.length === 0) {
        return [];
      }

      const { data: rows, error: rowsError } = await supabase
        .from("employees")
        .select("tg_id,avatar_url")
        .in("tg_id", senderIds);

      if (rowsError) {
        throw rowsError;
      }
      return rows ?? [];
    }

    async function loadReactions() {
      if (messageIds.length === 0) {
        return [];
      }

      const { data: rows, error: rowsError } = await supabase
        .from("message_reactions")
        .select("id,message_id,reactor_tg_id,emoji,created_at")
        .in("message_id", messageIds)
        .order("created_at", { ascending: true });

      if (rowsError) {
        throw rowsError;
      }
      return rows ?? [];
    }

    async function loadReads() {
      if (messageIds.length === 0) {
        return [];
      }

      const { data: rows, error: rowsError } = await supabase
        .from("message_reads")
        .select("id,message_id,reader_tg_id,reader_name,read_at")
        .in("message_id", messageIds)
        .order("read_at", { ascending: true });

      if (rowsError) {
        throw rowsError;
      }
      return rows ?? [];
    }

    async function loadReplies() {
      if (replyIds.length === 0) {
        return [];
      }

      const { data: rows, error: rowsError } = await supabase
        .from("messages")
        .select("id,sender_name,text")
        .in("id", replyIds);

      if (rowsError) {
        throw rowsError;
      }
      return rows ?? [];
    }

    const [senders, reactionRows, readRows, replyRows] = await Promise.all([
      loadSenders(),
      loadReactions(),
      loadReads(),
      loadReplies()
    ]);

    const avatarBySender = new Map<string, string | null>();
    for (const sender of senders) {
      avatarBySender.set(
        String(sender.tg_id),
        (sender.avatar_url as string | null) ?? null
      );
    }

    const reactionsByMessage = new Map<string, MessageReaction[]>();
    for (const row of reactionRows) {
      const reaction = mapMessageReaction(row as Record<string, unknown>);
      const current = reactionsByMessage.get(reaction.message_id) ?? [];
      current.push(reaction);
      reactionsByMessage.set(reaction.message_id, current);
    }

    const readsByMessage = new Map<string, MessageRead[]>();
    for (const row of readRows) {
      const read = mapMessageRead(row as Record<string, unknown>);
      const current = readsByMessage.get(read.message_id) ?? [];
      current.push(read);
      readsByMessage.set(read.message_id, current);
    }

    const replyById = new Map(
      replyRows.map((row) => {
        const reply = mapMessageReplyPreview(
          row as Record<string, unknown>
        );
        return [reply.id, reply] as const;
      })
    );

    return NextResponse.json(
      {
        messages: recentMessages.map((message) =>
          mapMessage(
            message as Record<string, unknown>,
            avatarBySender.get(String(message.sender_tg_id)) ?? null,
            reactionsByMessage.get(String(message.id)) ?? [],
            readsByMessage.get(String(message.id)) ?? [],
            typeof message.reply_to_message_id === "string"
              ? replyById.get(message.reply_to_message_id) ?? null
              : null
          )
        )
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Failed to load messages", error);
    return NextResponse.json(
      { error: "Не удалось загрузить сообщения." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      channel_id?: unknown;
      text?: unknown;
      file_url?: unknown;
      file_type?: unknown;
      file_name?: unknown;
      file_size?: unknown;
      reply_to_message_id?: unknown;
    };
    const channelId =
      typeof body.channel_id === "string" ? body.channel_id : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const fileUrl =
      typeof body.file_url === "string" ? body.file_url.trim() : "";
    const fileType = body.file_type;
    const fileName =
      typeof body.file_name === "string" ? body.file_name.trim() : "";
    const fileSize =
      typeof body.file_size === "number" ? body.file_size : Number.NaN;
    const hasAttachment = Boolean(fileUrl);
    const replyToMessageId =
      typeof body.reply_to_message_id === "string"
        ? body.reply_to_message_id
        : "";

    if (!isUuid(channelId)) {
      return NextResponse.json(
        { error: "Некорректный идентификатор ветки." },
        { status: 400 }
      );
    }

    if (
      body.reply_to_message_id !== undefined &&
      body.reply_to_message_id !== null &&
      !isUuid(replyToMessageId)
    ) {
      return NextResponse.json(
        { error: "Некорректное сообщение для ответа." },
        { status: 400 }
      );
    }

    if (text.length > 2000 || (!text && !hasAttachment)) {
      return NextResponse.json(
        { error: "Добавьте текст или вложение. Максимальная длина текста — 2000 символов." },
        { status: 400 }
      );
    }

    if (
      hasAttachment &&
      (!isAttachmentType(fileType) ||
        !fileName ||
        fileName.length > 255 ||
        !Number.isSafeInteger(fileSize) ||
        fileSize <= 0 ||
        fileSize > ATTACHMENT_LIMITS[fileType] ||
        !isFileNameAllowedForCategory(fileName, fileType) ||
        !isChatAttachmentUrl(fileUrl, channelId))
    ) {
      return NextResponse.json(
        { error: "Некорректные данные вложения." },
        { status: 400 }
      );
    }

    if (
      !hasAttachment &&
      (body.file_type !== undefined ||
        body.file_name !== undefined ||
        body.file_size !== undefined)
    ) {
      return NextResponse.json(
        { error: "Метаданные файла переданы без ссылки на вложение." },
        { status: 400 }
      );
    }

    const authorization = await requireEmployee(request);
    if ("response" in authorization) {
      return authorization.response;
    }
    const { employee } = authorization;

    if (!(await canAccessChannel(channelId, employee.role_id))) {
      return NextResponse.json(
        { error: "Нет доступа к этой ветке." },
        { status: 403 }
      );
    }

    let replyTo: MessageReplyPreview | null = null;
    if (replyToMessageId) {
      const { data: replyRow, error: replyError } = await getSupabaseAdmin()
        .from("messages")
        .select("id,sender_name,text")
        .eq("id", replyToMessageId)
        .eq("channel_id", channelId)
        .maybeSingle();

      if (replyError) {
        throw replyError;
      }
      if (!replyRow) {
        return NextResponse.json(
          { error: "Сообщение для ответа не найдено в этой ветке." },
          { status: 400 }
        );
      }

      replyTo = mapMessageReplyPreview(
        replyRow as Record<string, unknown>
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from("messages")
      .insert({
        channel_id: channelId,
        sender_tg_id: String(employee.tg_id),
        sender_name: employee.full_name,
        text,
        file_url: hasAttachment ? fileUrl : null,
        file_type: hasAttachment ? fileType : null,
        file_name: hasAttachment ? fileName : null,
        file_size: hasAttachment ? fileSize : null,
        reply_to_message_id: replyToMessageId || null
      })
      .select(
        "id,channel_id,sender_tg_id,sender_name,text,file_url,file_type,file_name,file_size,reply_to_message_id,created_at"
      )
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        message: mapMessage(
          data as Record<string, unknown>,
          employee.avatar_url,
          [],
          [],
          replyTo
        )
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create message", error);
    return NextResponse.json(
      { error: "Не удалось отправить сообщение." },
      { status: 500 }
    );
  }
}
