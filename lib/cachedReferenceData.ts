import "server-only";

import { unstable_cache } from "next/cache";

import { mapAdminChannel, mapRole } from "@/lib/entityMappers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { AdminChannel, Role } from "@/lib/types";

export const CHANNELS_CACHE_TAG = "channels";
export const EMPLOYEE_AVATARS_CACHE_TAG = "employee-avatars";

export const getCachedEmployeeAvatars = unstable_cache(
  async (): Promise<Array<[string, string | null]>> => {
    const { data, error } = await getSupabaseAdmin()
      .from("employees")
      .select("tg_id,avatar_url");

    if (error) {
      throw error;
    }

    return (data ?? []).map((employee) => [
        String(employee.tg_id),
        (employee.avatar_url as string | null) ?? null
      ]);
  },
  ["employee-avatars"],
  { revalidate: 30, tags: [EMPLOYEE_AVATARS_CACHE_TAG] }
);

export const getCachedRoles = unstable_cache(
  async (): Promise<Role[]> => {
    const { data, error } = await getSupabaseAdmin()
      .from("roles")
      .select("id,name,is_admin")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((role) =>
      mapRole(role as Record<string, unknown>)
    );
  },
  ["roles"],
  { revalidate: 30, tags: ["roles"] }
);

export const getCachedAdminChannels = unstable_cache(
  async (): Promise<AdminChannel[]> => {
    const { data, error } = await getSupabaseAdmin()
      .from("channels")
      .select("id,name,emoji")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) =>
      mapAdminChannel(row as Record<string, unknown>)
    );
  },
  ["admin-channels"],
  { revalidate: 30, tags: [CHANNELS_CACHE_TAG] }
);
