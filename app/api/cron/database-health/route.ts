import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATABASE_HEALTH_SCHEDULE = "17 4 * * *";

function isAuthorizedCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    return request.headers.get("authorization") === `Bearer ${cronSecret}`;
  }

  return (
    request.headers.get("x-vercel-cron-schedule") ===
    DATABASE_HEALTH_SCHEDULE
  );
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json(
      { error: "Недействительный запрос планировщика." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const { error } = await getSupabaseAdmin()
      .from("employees")
      .select("id")
      .limit(1);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Database health cron failed", error);
    return NextResponse.json(
      { error: "База данных недоступна." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
