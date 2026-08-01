import "server-only";

import { getMessageChannelTopic } from "@/lib/messageFeatures";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function broadcastMessageEvent(
  channelId: string,
  event: string,
  payload: Record<string, unknown>
) {
  const supabase = getSupabaseAdmin();
  const channel = supabase.channel(getMessageChannelTopic(channelId));

  try {
    const status = await channel.send({
      type: "broadcast",
      event,
      payload
    });

    if (status !== "ok") {
      console.error("Failed to broadcast message event", {
        channelId,
        event,
        status
      });
    }
  } catch (error) {
    console.error("Failed to broadcast message event", {
      channelId,
      event,
      error
    });
  } finally {
    await supabase.removeChannel(channel);
  }
}
