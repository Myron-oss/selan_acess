import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  CHAT_ATTACHMENTS_BUCKET,
  getAttachmentRule
} from "@/lib/attachments";
import { requireEmployee } from "@/lib/apiAuth";
import { canAccessChannel } from "@/lib/channelService";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      channel_id?: unknown;
      file_name?: unknown;
      file_type?: unknown;
      file_size?: unknown;
    };
    const channelId =
      typeof body.channel_id === "string" ? body.channel_id : "";
    const fileName =
      typeof body.file_name === "string" ? body.file_name.trim() : "";
    const mimeType =
      typeof body.file_type === "string" ? body.file_type.trim() : "";
    const fileSize =
      typeof body.file_size === "number" ? body.file_size : Number.NaN;

    if (!isUuid(channelId)) {
      return NextResponse.json(
        { error: "Некорректный идентификатор ветки." },
        { status: 400 }
      );
    }

    if (!fileName || fileName.length > 255) {
      return NextResponse.json(
        { error: "Имя файла должно содержать от 1 до 255 символов." },
        { status: 400 }
      );
    }

    const rule = getAttachmentRule(fileName, mimeType);
    if (!rule) {
      return NextResponse.json(
        { error: "Этот формат файла не поддерживается." },
        { status: 400 }
      );
    }

    if (
      !Number.isSafeInteger(fileSize) ||
      fileSize <= 0 ||
      fileSize > rule.maxBytes
    ) {
      return NextResponse.json(
        { error: "Файл превышает допустимый размер для этого типа." },
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

    const path = `${channelId}/${randomUUID()}.${rule.extension}`;
    const storage = getSupabaseAdmin().storage.from(CHAT_ATTACHMENTS_BUCKET);
    const { data, error } = await storage.createSignedUploadUrl(path);

    if (error) {
      throw error;
    }

    const { data: publicUrlData } = storage.getPublicUrl(path);

    return NextResponse.json({
      signed_url: data.signedUrl,
      token: data.token,
      path,
      public_url: publicUrlData.publicUrl,
      attachment_type: rule.category,
      content_type: rule.mimeType
    });
  } catch (error) {
    console.error("Failed to authorize attachment upload", error);
    return NextResponse.json(
      { error: "Не удалось подготовить загрузку файла." },
      { status: 500 }
    );
  }
}
