import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AuthenticatedEmployee } from "@/lib/types";

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
    .select("id,tg_id,full_name,role_id")
    .eq("tg_id", String(tgId))
    .maybeSingle();

  if (employeeError) {
    throw employeeError;
  }

  if (!employee) {
    return null;
  }

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id,name,is_admin")
    .eq("id", employee.role_id)
    .single();

  if (roleError) {
    throw roleError;
  }

  return {
    id: employee.id as string,
    tg_id: Number(employee.tg_id),
    full_name: employee.full_name as string,
    role_id: employee.role_id as string,
    role: {
      id: role.id as string,
      name: role.name as string,
      is_admin: role.is_admin as boolean
    }
  };
}
