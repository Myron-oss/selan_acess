import { NextRequest, NextResponse } from "next/server";

import {
  ATTACHMENT_LIMITS,
  CHAT_ATTACHMENTS_BUCKET,
  isFileNameAllowedForCategory
} from "@/lib/attachments";
import { requireEmployee } from "@/lib/apiAuth";
import { canAccessChannel } from "@/lib/channelService";
import { mapMessage } from "@/lib/entityMappers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { MessageFileType } from "@/lib/types";
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

    const { data, error } = await getSupabaseAdmin()
      .from("messages")
      .select(
        "id,channel_id,sender_tg_id,sender_name,text,file_url,file_type,file_name,file_size,created_at"
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
    const avatarBySender = new Map<string, string | null>();

    if (senderIds.length > 0) {
      const { data: senders, error: sendersError } = await getSupabaseAdmin()
        .from("employees")
        .select("tg_id,avatar_url")
        .in("tg_id", senderIds);

      if (sendersError) {
        throw sendersError;
      }

      for (const sender of senders ?? []) {
        avatarBySender.set(
          String(sender.tg_id),
          (sender.avatar_url as string | null) ?? null
        );
      }
    }

    return NextResponse.json(
      {
        messages: recentMessages.map((message) =>
          mapMessage(
            message as Record<string, unknown>,
            avatarBySender.get(String(message.sender_tg_id)) ?? null
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

    if (!isUuid(channelId)) {
      return NextResponse.json(
        { error: "Некорректный идентификатор ветки." },
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
        file_size: hasAttachment ? fileSize : null
      })
      .select(
        "id,channel_id,sender_tg_id,sender_name,text,file_url,file_type,file_name,file_size,created_at"
      )
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        message: mapMessage(
          data as Record<string, unknown>,
          employee.avatar_url
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
