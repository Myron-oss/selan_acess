import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/apiAuth";
import { mapAccessRequest } from "@/lib/entityMappers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireAdmin(request);
    if ("response" in authorization) {
      return authorization.response;
    }

    const { data, error } = await getSupabaseAdmin()
      .from("access_requests")
      .select("id,tg_id,tg_username,full_name,status,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    const requests = (data ?? []).map((row) =>
      mapAccessRequest(row as Record<string, unknown>)
    );

    return NextResponse.json({ requests, count: requests.length });
  } catch (error) {
    console.error("Failed to load access requests", error);
    return NextResponse.json(
      { error: "Не удалось загрузить заявки на доступ." },
      { status: 500 }
    );
  }
}
