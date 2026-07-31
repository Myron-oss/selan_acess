import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/apiAuth";
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
      { error: "Некорректный идентификатор заявки." },
      { status: 400 }
    );
  }

  try {
    const authorization = await requireAdmin(request);
    if ("response" in authorization) {
      return authorization.response;
    }

    const { data, error } = await getSupabaseAdmin()
      .from("access_requests")
      .update({ status: "rejected" })
      .eq("id", params.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return NextResponse.json(
        { error: "Заявка не найдена или уже обработана." },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to reject access request", error);
    return NextResponse.json(
      { error: "Не удалось отклонить заявку." },
      { status: 500 }
    );
  }
}
