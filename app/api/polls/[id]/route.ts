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

export async function GET(request: NextRequest, { params }: RouteContext) {
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

    const { data: pollRow, error } = await getSupabaseAdmin()
      .from("polls")
      .select("channel_id")
      .eq("id", params.id)
      .maybeSingle();

    if (error) {
      throw error;
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

    const polls = await loadPollsById([params.id], employee.tg_id);
    const poll = polls.get(params.id);
    if (!poll) {
      return NextResponse.json(
        { error: "Опрос не найден." },
        { status: 404 }
      );
    }

    return NextResponse.json({ poll });
  } catch (error) {
    console.error("Failed to load poll", error);
    return NextResponse.json(
      { error: "Не удалось загрузить опрос." },
      { status: 500 }
    );
  }
}
