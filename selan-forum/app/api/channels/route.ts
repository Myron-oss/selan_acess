import { NextRequest, NextResponse } from "next/server";

import { getEmployeeContext, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/telegramAuth";
import type { Channel } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const tgId = getSessionUserId(request);
  if (!tgId) {
    return NextResponse.json(
      { error: "Требуется авторизация." },
      { status: 401 }
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

    const { data, error } = await getSupabaseAdmin()
      .from("channels")
      .select("id,name,emoji,allowed_role_ids")
      .contains("allowed_role_ids", [employee.role_id])
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    const channels: Channel[] = (data ?? []).map((channel) => ({
      id: channel.id as string,
      name: channel.name as string,
      emoji: (channel.emoji as string | null) ?? null,
      allowed_role_ids: (channel.allowed_role_ids as string[]) ?? []
    }));

    return NextResponse.json({ channels });
  } catch (error) {
    console.error("Failed to load channels", error);
    return NextResponse.json(
      { error: "Не удалось загрузить ветки." },
      { status: 500 }
    );
  }
}
