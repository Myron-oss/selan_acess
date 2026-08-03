import { NextRequest, NextResponse } from "next/server";

import { requireEmployee } from "@/lib/apiAuth";
import { getEmployeeChannels } from "@/lib/channelService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireEmployee(request);
    if ("response" in authorization) {
      authorization.response.headers.set("Cache-Control", "no-store");
      return authorization.response;
    }

    const channels = await getEmployeeChannels(
      authorization.employee.tg_id
    );
    return NextResponse.json(
      { channels },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Failed to load channels", error);
    return NextResponse.json(
      { error: "Не удалось загрузить ветки." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
