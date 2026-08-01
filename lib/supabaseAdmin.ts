import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { mapEmployee, mapRole } from "@/lib/entityMappers";
import type { AuthenticatedEmployee } from "@/lib/types";
import { fetchWithNoStore } from "@/utils/supabase/fetch";

let adminClient: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server environment variables are not configured");
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      fetch: fetchWithNoStore
    }
  });

  return adminClient;
}

export async function getEmployeeContext(
  tgId: number
): Promise<AuthenticatedEmployee | null> {
  const supabase = getSupabaseAdmin();
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select(
      "id,tg_id,full_name,role_id,created_at,avatar_url,theme_preference,accent_color,role:roles!inner(id,name,is_admin)"
    )
    .eq("tg_id", String(tgId))
    .maybeSingle();

  if (employeeError) {
    throw employeeError;
  }

  if (!employee) {
    return null;
  }

  const rawRole = Array.isArray(employee.role)
    ? employee.role[0]
    : employee.role;
  if (!rawRole || typeof rawRole !== "object") {
    throw new Error("Employee role relation is missing");
  }

  const role = mapRole(rawRole as Record<string, unknown>);
  const mappedEmployee = mapEmployee(
    employee as Record<string, unknown>,
    role
  );

  return { ...mappedEmployee, role } satisfies AuthenticatedEmployee;
}
