import { NextRequest, NextResponse } from "next/server";

import { getEmployeeContext, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/telegramAuth";
import type { Message } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function canAccessChannel(
  channelId: string,
  roleId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("channels")
    .select("id")
    .eq("id", channelId)
    .contains("allowed_role_ids", [roleId])
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

function serializeMessage(message: Record<string, unknown>): Message {
  return {
    id: String(message.id),
    channel_id: String(message.channel_id),
    sender_tg_id: Number(message.sender_tg_id),
    sender_name: String(message.sender_name),
    text: String(message.text),
    created_at: String(message.created_at)
  };
}

export async function GET(request: NextRequest) {
  const tgId = getSessionUserId(request);
  if (!tgId) {
    return NextResponse.json(
      { error: "Требуется авторизация." },
      { status: 401 }
    );
  }

  const channelId = request.nextUrl.searchParams.get("channel_id") ?? "";
  if (!UUID_PATTERN.test(channelId)) {
    return NextResponse.json(
      { error: "Некорректный идентификатор ветки." },
      { status: 400 }
    );
  }

  try {
    const employee = await getEmployeeContext(tgId);
    if (!employee) {
      return NextResponse.json(
        { error: "Доступ не предоставлен" },
        { status: 403 }
      );
    }

    if (!(await canAccessChannel(channelId, employee.role_id))) {
      return NextResponse.json(
        { error: "Нет доступа к этой ветке." },
        { status: 403 }
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from("messages")
      .select(
        "id,channel_id,sender_tg_id,sender_name,text,created_at"
      )
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      messages: (data ?? []).map((message) =>
        serializeMessage(message as Record<string, unknown>)
      )
    });
  } catch (error) {
    console.error("Failed to load messages", error);
    return NextResponse.json(
      { error: "Не удалось загрузить сообщения." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const tgId = getSessionUserId(request);
  if (!tgId) {
    return NextResponse.json(
      { error: "Требуется авторизация." },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as {
      channel_id?: unknown;
      text?: unknown;
    };
    const channelId =
      typeof body.channel_id === "string" ? body.channel_id : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!UUID_PATTERN.test(channelId)) {
      return NextResponse.json(
        { error: "Некорректный идентификатор ветки." },
        { status: 400 }
      );
    }

    if (!text || text.length > 2000) {
      return NextResponse.json(
        { error: "Сообщение должно содержать от 1 до 2000 символов." },
        { status: 400 }
      );
    }

    const employee = await getEmployeeContext(tgId);
    if (!employee) {
      return NextResponse.json(
        { error: "Доступ не предоставлен" },
        { status: 403 }
      );
    }

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
        text
      })
      .select("id,channel_id,sender_tg_id,sender_name,text,created_at")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { message: serializeMessage(data as Record<string, unknown>) },
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
