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
      authorization.response.headers.set("Cache-Control", "no-store");
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

    const rows = data ?? [];

    console.log("[GET /api/admin/access-requests] Supabase response", {
      count: rows.length,
      format: Array.isArray(data) ? "array" : typeof data,
      rows
    });

    const requests = rows.map((row) =>
      mapAccessRequest(row as Record<string, unknown>)
    );

    return NextResponse.json(
      { requests, count: requests.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Failed to load access requests", error);
    return NextResponse.json(
      { error: "Не удалось загрузить заявки на доступ." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
