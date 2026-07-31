import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function canAccessChannel(
  channelId: string,
  roleId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("channels")
    .select("id")
    .eq("id", channelId)
    .contains("allowed_role_ids", [roleId])
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function rolesExist(roleIds: string[]): Promise<boolean> {
  if (roleIds.length === 0) {
    return true;
  }

  const { count, error } = await getSupabaseAdmin()
    .from("roles")
    .select("id", { count: "exact", head: true })
    .in("id", roleIds);

  if (error) {
    throw error;
  }

  return count === roleIds.length;
}
