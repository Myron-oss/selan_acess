import { NextRequest, NextResponse } from "next/server";

import {
  ATTACHMENT_LIMITS,
  CHAT_ATTACHMENTS_BUCKET,
  isFileNameAllowedForCategory
} from "@/lib/attachments";
import { requireEmployee } from "@/lib/apiAuth";
import { runAfterResponse } from "@/lib/backgroundTasks";
import { getCachedEmployeeAvatars } from "@/lib/cachedReferenceData";
import { canAccessChannel } from "@/lib/channelService";
import {
  mapMessage,
  mapMessageReaction,
  mapMessageRead,
  mapMessageReplyPreview,
  mapPinnedMessage
} from "@/lib/entityMappers";
import { loadPollsById } from "@/lib/pollService";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PINNED_MESSAGE_SELECT } from "@/lib/messageFeatures";
import { notifyChannelMembers } from "@/lib/telegramNotifications";
import type {
  MessageFileType,
  MessageReplyPreview
} from "@/lib/types";
import { isUuid } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MESSAGE_PAGE_SIZE = 50;

function getRelatedRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object"
      )
    : [];
}

function getRelatedRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object"
    ? (row as Record<string, unknown>)
    : null;
}

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
  const startedAt = performance.now();
  const channelId = request.nextUrl.searchParams.get("channel_id") ?? "";
  const beforeAt = request.nextUrl.searchParams.get("before_at") ?? "";
  if (!isUuid(channelId)) {
    return NextResponse.json(
      { error: "Некорректный идентификатор ветки." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (beforeAt && Number.isNaN(Date.parse(beforeAt))) {
    return NextResponse.json(
      { error: "Некорректный курсор истории сообщений." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const authStartedAt = performance.now();
    const authorization = await requireEmployee(request);
    if ("response" in authorization) {
      authorization.response.headers.set("Cache-Control", "no-store");
      return authorization.response;
    }
    const { employee } = authorization;
    const authFinishedAt = performance.now();

    const accessStartedAt = performance.now();
    if (!(await canAccessChannel(channelId, employee.tg_id))) {
      return NextResponse.json(
        { error: "Нет доступа к этой ветке." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
    const accessFinishedAt = performance.now();

    const supabase = getSupabaseAdmin();
    let messagesQuery = supabase
      .from("messages")
      .select(
        `id,channel_id,sender_tg_id,sender_name,text,file_url,file_type,file_name,file_size,reply_to_message_id,is_pinned,pinned_at,pinned_by_tg_id,poll_id,created_at,updated_at,
        reactions:message_reactions!message_reactions_message_id_fkey(id,message_id,reactor_tg_id,emoji,created_at),
        reads:message_reads!message_reads_message_id_fkey(id,message_id,reader_tg_id,reader_name,read_at),
        reply_to:messages!reply_to_message_id(id,sender_name,text)`
      )
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);

    if (beforeAt) {
      messagesQuery = messagesQuery.lt("created_at", beforeAt);
    }

    const pinnedMessageQuery = beforeAt
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("messages")
          .select(PINNED_MESSAGE_SELECT)
          .eq("channel_id", channelId)
          .eq("is_pinned", true)
          .order("pinned_at", { ascending: false })
          .limit(1)
          .maybeSingle();

    const queryStartedAt = performance.now();
    const [messagesResult, avatarEntries, pinnedMessageResult] = await Promise.all([
      messagesQuery,
      getCachedEmployeeAvatars(),
      pinnedMessageQuery
    ]);
    const queryFinishedAt = performance.now();
    const { data, error } = messagesResult;

    if (error) {
      throw error;
    }
    if (pinnedMessageResult.error) {
      throw pinnedMessageResult.error;
    }

    const hasMore = (data?.length ?? 0) > MESSAGE_PAGE_SIZE;
    const pageRows = (data ?? []).slice(0, MESSAGE_PAGE_SIZE);
    const recentMessages = [...pageRows].reverse();
    const avatarBySender = new Map(avatarEntries);
    const mappedMessages = recentMessages.map((message) => {
      const row = message as Record<string, unknown>;
      const reactions = getRelatedRows(row.reactions)
        .map(mapMessageReaction)
        .sort((left, right) =>
          left.created_at.localeCompare(right.created_at)
        );
      const reads = getRelatedRows(row.reads)
        .map(mapMessageRead)
        .sort((left, right) => left.read_at.localeCompare(right.read_at));
      const replyRow = getRelatedRow(row.reply_to);

      return mapMessage(
        row,
        avatarBySender.get(String(message.sender_tg_id)) ?? null,
        reactions,
        reads,
        replyRow ? mapMessageReplyPreview(replyRow) : null
      );
    });
    const polls = await loadPollsById(
      mappedMessages
        .map((message) => message.poll_id)
        .filter((pollId): pollId is string => Boolean(pollId)),
      employee.tg_id
    );
    const messages = mappedMessages.map((message) => ({
      ...message,
      poll: message.poll_id ? polls.get(message.poll_id) ?? null : null
    }));
    const oldestMessage = recentMessages[0];
    const finishedAt = performance.now();
    const durations = {
      auth_ms: authFinishedAt - authStartedAt,
      access_ms: accessFinishedAt - accessStartedAt,
      data_ms: queryFinishedAt - queryStartedAt,
      total_ms: finishedAt - startedAt
    };

    console.info("[GET /api/messages] performance", {
      channel_id: channelId,
      count: messages.length,
      has_more: hasMore,
      data_api_round_trips: beforeAt ? 2 : 3,
      ...Object.fromEntries(
        Object.entries(durations).map(([key, value]) => [
          key,
          Number(value.toFixed(1))
        ])
      )
    });

    return NextResponse.json(
      {
        messages,
        pinned_message: pinnedMessageResult.data
          ? mapPinnedMessage(
              pinnedMessageResult.data as Record<string, unknown>
            )
          : null,
        has_more: hasMore,
        next_cursor:
          hasMore && oldestMessage
            ? { before_at: String(oldestMessage.created_at) }
            : null
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Server-Timing": [
            `auth;dur=${durations.auth_ms.toFixed(1)}`,
            `access;dur=${durations.access_ms.toFixed(1)}`,
            `data;dur=${durations.data_ms.toFixed(1)}`,
            `total;dur=${durations.total_ms.toFixed(1)}`
          ].join(", "),
          "X-Data-API-Round-Trips": beforeAt ? "2" : "3"
        }
      }
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

    if (!(await canAccessChannel(channelId, employee.tg_id))) {
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
        "id,channel_id,sender_tg_id,sender_name,text,file_url,file_type,file_name,file_size,reply_to_message_id,is_pinned,pinned_at,pinned_by_tg_id,poll_id,created_at,updated_at"
      )
      .single();

    if (error) {
      throw error;
    }

    const message = mapMessage(
      data as Record<string, unknown>,
      employee.avatar_url,
      [],
      [],
      replyTo
    );
    runAfterResponse(
      notifyChannelMembers({
        channelId,
        senderTgId: employee.tg_id,
        senderName: employee.full_name,
        text,
        fileType:
          hasAttachment && isAttachmentType(fileType) ? fileType : null,
        fileName: hasAttachment ? fileName : null,
        createdAt: message.created_at,
        appOrigin:
          process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin
      })
    );

    return NextResponse.json(
      { message },
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
