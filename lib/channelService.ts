import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Channel } from "@/lib/types";

export async function canAccessChannel(
  channelId: string,
  employeeTgId: number
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("employee_channel_access")
    .select("id")
    .eq("channel_id", channelId)
    .eq("employee_tg_id", String(employeeTgId))
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function channelsExist(channelIds: string[]): Promise<boolean> {
  if (channelIds.length === 0) return true;

  const { count, error } = await getSupabaseAdmin()
    .from("channels")
    .select("id", { count: "exact", head: true })
    .in("id", channelIds);

  if (error) throw error;
  return count === channelIds.length;
}

export async function getEmployeeChannels(
  employeeTgId: number
): Promise<Channel[]> {
  const { data, error } = await getSupabaseAdmin().rpc(
    "get_employee_channels",
    { p_employee_tg_id: String(employeeTgId) }
  );

  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((channel) => ({
    id: String(channel.id),
    name: String(channel.name),
    emoji: typeof channel.emoji === "string" ? channel.emoji : null,
    participant_count: Number(channel.participant_count) || 0,
    last_message_preview:
      typeof channel.last_message_preview === "string"
        ? channel.last_message_preview
        : null,
    last_message_at:
      typeof channel.last_message_at === "string"
        ? channel.last_message_at
        : null
  }));
}
