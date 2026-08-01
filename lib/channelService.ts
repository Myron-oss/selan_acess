import "server-only";

import { unstable_cache } from "next/cache";

import { CHANNELS_CACHE_TAG } from "@/lib/cachedReferenceData";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const getCachedChannelAccess = unstable_cache(
  async (
    channelId: string,
    roleId: string
  ): Promise<boolean> => {
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
  },
  ["channel-access"],
  { revalidate: 30, tags: [CHANNELS_CACHE_TAG] }
);

export function canAccessChannel(
  channelId: string,
  roleId: string
): Promise<boolean> {
  return getCachedChannelAccess(channelId, roleId);
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
