import { NextRequest, NextResponse } from "next/server";

import { requireEmployee } from "@/lib/apiAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Channel } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireEmployee(request);
    if ("response" in authorization) {
      authorization.response.headers.set("Cache-Control", "no-store");
      return authorization.response;
    }
    const { employee } = authorization;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("channels")
      .select("id,name,emoji,allowed_role_ids")
      .contains("allowed_role_ids", [employee.role_id])
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    const { data: employeeRoles, error: employeesError } = await supabase
      .from("employees")
      .select("role_id");

    if (employeesError) {
      throw employeesError;
    }

    const employeesByRole = new Map<string, number>();
    for (const row of employeeRoles ?? []) {
      const roleId = String(row.role_id);
      employeesByRole.set(roleId, (employeesByRole.get(roleId) ?? 0) + 1);
    }

    const channels: Channel[] = (data ?? []).map((channel) => ({
      id: channel.id as string,
      name: channel.name as string,
      emoji: (channel.emoji as string | null) ?? null,
      allowed_role_ids: (channel.allowed_role_ids as string[]) ?? [],
      participant_count: ((channel.allowed_role_ids as string[]) ?? []).reduce(
        (count, roleId) => count + (employeesByRole.get(roleId) ?? 0),
        0
      )
    }));

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
