import "server-only";

import { unstable_cache } from "next/cache";

import { mapAdminChannel, mapRole } from "@/lib/entityMappers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { AdminChannel, Channel, Role } from "@/lib/types";

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
      .select("id,name,emoji,allowed_role_ids")
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

export const getCachedChannelsForRole = unstable_cache(
  async (roleId: string): Promise<Channel[]> => {
    const supabase = getSupabaseAdmin();
    const [channelsResult, employeeRolesResult] = await Promise.all([
      supabase
        .from("channels")
        .select("id,name,emoji,allowed_role_ids")
        .contains("allowed_role_ids", [roleId])
        .order("name", { ascending: true }),
      supabase.from("employees").select("role_id")
    ]);

    if (channelsResult.error) {
      throw channelsResult.error;
    }
    if (employeeRolesResult.error) {
      throw employeeRolesResult.error;
    }

    const employeesByRole = new Map<string, number>();
    for (const row of employeeRolesResult.data ?? []) {
      const employeeRoleId = String(row.role_id);
      employeesByRole.set(
        employeeRoleId,
        (employeesByRole.get(employeeRoleId) ?? 0) + 1
      );
    }

    return (channelsResult.data ?? []).map((channel) => ({
      id: channel.id as string,
      name: channel.name as string,
      emoji: (channel.emoji as string | null) ?? null,
      allowed_role_ids: (channel.allowed_role_ids as string[]) ?? [],
      participant_count: ((channel.allowed_role_ids as string[]) ?? []).reduce(
        (count, allowedRoleId) =>
          count + (employeesByRole.get(allowedRoleId) ?? 0),
        0
      )
    }));
  },
  ["channels-for-role"],
  { revalidate: 30, tags: [CHANNELS_CACHE_TAG] }
);
