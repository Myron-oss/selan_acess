import { NextRequest, NextResponse } from "next/server";

import { requireEmployee } from "@/lib/apiAuth";
import { canAccessChannel } from "@/lib/channelService";
import { loadPollMessage } from "@/lib/pollService";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authorization = await requireEmployee(request);
    if ("response" in authorization) {
      return authorization.response;
    }
    const { employee } = authorization;

    const body = (await request.json()) as {
      channel_id?: unknown;
      question?: unknown;
      options?: unknown;
      is_anonymous?: unknown;
      allows_multiple_answers?: unknown;
    };
    const channelId =
      typeof body.channel_id === "string" ? body.channel_id : "";
    const question =
      typeof body.question === "string" ? body.question.trim() : "";
    const options = Array.isArray(body.options)
      ? body.options.map((option) =>
          typeof option === "string" ? option.trim() : ""
        )
      : [];

    if (!isUuid(channelId)) {
      return NextResponse.json(
        { error: "Некорректная ветка." },
        { status: 400 }
      );
    }
    if (!question || question.length > 300) {
      return NextResponse.json(
        { error: "Вопрос должен содержать от 1 до 300 символов." },
        { status: 400 }
      );
    }
    if (
      options.length < 2 ||
      options.length > 10 ||
      options.some((option) => !option || option.length > 100) ||
      new Set(options.map((option) => option.toLocaleLowerCase("ru"))).size !==
        options.length
    ) {
      return NextResponse.json(
        { error: "Добавьте от 2 до 10 уникальных вариантов ответа." },
        { status: 400 }
      );
    }
    if (
      typeof body.is_anonymous !== "boolean" ||
      typeof body.allows_multiple_answers !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Некорректные настройки опроса." },
        { status: 400 }
      );
    }
    if (!(await canAccessChannel(channelId, employee.tg_id))) {
      return NextResponse.json(
        { error: "Нет доступа к этой ветке." },
        { status: 403 }
      );
    }

    const { data: pollId, error } = await getSupabaseAdmin().rpc(
      "create_poll_message",
      {
        p_channel_id: channelId,
        p_creator_tg_id: String(employee.tg_id),
        p_sender_name: employee.full_name,
        p_question: question,
        p_is_anonymous: body.is_anonymous,
        p_allows_multiple_answers: body.allows_multiple_answers,
        p_options: options
      }
    );

    if (error) {
      throw error;
    }
    if (!isUuid(pollId)) {
      throw new Error("Poll creation did not return an id");
    }

    const message = await loadPollMessage(pollId, employee.tg_id);
    if (!message) {
      throw new Error("Poll message was not created");
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("Failed to create poll", error);
    return NextResponse.json(
      { error: "Не удалось создать опрос." },
      { status: 500 }
    );
  }
}
