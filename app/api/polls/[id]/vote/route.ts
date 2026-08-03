import { NextRequest, NextResponse } from "next/server";

import { requireEmployee } from "@/lib/apiAuth";
import { canAccessChannel } from "@/lib/channelService";
import { loadPollsById } from "@/lib/pollService";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!isUuid(params.id)) {
    return NextResponse.json(
      { error: "Некорректный идентификатор опроса." },
      { status: 400 }
    );
  }

  try {
    const authorization = await requireEmployee(request);
    if ("response" in authorization) {
      return authorization.response;
    }
    const { employee } = authorization;
    const body = (await request.json()) as { option_id?: unknown };
    const optionId = typeof body.option_id === "string" ? body.option_id : "";
    if (!isUuid(optionId)) {
      return NextResponse.json(
        { error: "Некорректный вариант ответа." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: pollRow, error: pollError } = await supabase
      .from("polls")
      .select("channel_id")
      .eq("id", params.id)
      .maybeSingle();

    if (pollError) {
      throw pollError;
    }
    if (!pollRow) {
      return NextResponse.json(
        { error: "Опрос не найден." },
        { status: 404 }
      );
    }
    if (!(await canAccessChannel(String(pollRow.channel_id), employee.tg_id))) {
      return NextResponse.json(
        { error: "Нет доступа к этому опросу." },
        { status: 403 }
      );
    }

    const { error } = await supabase.rpc("vote_in_poll", {
      p_poll_id: params.id,
      p_option_id: optionId,
      p_voter_tg_id: String(employee.tg_id)
    });

    if (error) {
      if (error.message.includes("poll_or_option_not_found")) {
        return NextResponse.json(
          { error: "Вариант ответа не найден." },
          { status: 404 }
        );
      }
      throw error;
    }

    const polls = await loadPollsById([params.id], employee.tg_id);
    const poll = polls.get(params.id);
    if (!poll) {
      throw new Error("Poll disappeared after vote");
    }

    return NextResponse.json({ poll });
  } catch (error) {
    console.error("Failed to vote in poll", error);
    return NextResponse.json(
      { error: "Не удалось сохранить голос." },
      { status: 500 }
    );
  }
}
